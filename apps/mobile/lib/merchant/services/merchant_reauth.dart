import 'dart:async';
import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:http/http.dart' as http;

import 'merchant_session_service.dart';

// The Business App session, end to end.
//
//   sign-in (handle + PIN) ──▶ access token (~15 min) + refresh token (≤30 d)
//   access token expires   ──▶ renewed with the refresh token — no PIN sent
//   device unlock          ──▶ the PIN is checked ON the device only
//   renewal refused        ──▶ the session ENDS: tokens + identity cleared,
//                              sign-in (handle + PIN) is shown
//   renewal outage         ──▶ nothing ends; the screens say "temporarily
//                              unavailable" and the next call tries again
//   sign-out               ──▶ local state cleared, refresh token revoked

/// Why a re-authentication did not produce a session.
enum ReauthFailure {
  /// Banzami refused the handle + PIN: the PIN changed, the credential was
  /// revoked or reassigned, or the Business Account was suspended. The session
  /// on this device is over.
  refused,

  /// Too many attempts; the credential is temporarily locked server-side.
  locked,

  /// Banzami could not be reached. Nothing is known about the session.
  offline,
}

class ReauthException implements Exception {
  final ReauthFailure failure;
  const ReauthException(this.failure);
}

/// Reads a string claim from a JWT payload without verifying the signature.
/// The token comes from Banzami over TLS and is only read for its merchant id;
/// every server call verifies it again.
String? claimFromJwt(String jwt, String key) {
  final parts = jwt.split('.');
  if (parts.length != 3) return null;
  try {
    var p = parts[1].replaceAll('-', '+').replaceAll('_', '/');
    while (p.length % 4 != 0) {
      p += '=';
    }
    final map = jsonDecode(utf8.decode(base64.decode(p))) as Map<String, dynamic>;
    final v = map[key];
    return v is String ? v : null;
  } catch (_) {
    return null;
  }
}

/// The BanzamiClient for the current Business session: it renews an expired
/// access token with the session's refresh token ([renewBusinessSession]) and
/// ends the session ([MerchantSessionService.markExpired]) once, when Banzami
/// refuses it for good.
BanzamiClient buildBusinessClient({
  required MerchantSessionService session,
  required String baseUrl,
  http.Client? httpClient,
}) {
  final s = session.session;
  late final BanzamiClient client;
  client = BanzamiClient(
    baseUrl:        baseUrl,
    apiKey:         s?.apiKey ?? '',
    jwt:            s?.jwt,
    jwtExpiresAt:   s?.jwtExpiresAt,
    httpClient:     httpClient,
    onUnauthorized: session.markExpired,
    refreshSession: () => renewBusinessSession(client: client, session: session),
  );
  return client;
}

/// Renews the Business session's access token with its refresh token — the
/// PIN is not involved. Shared: concurrent callers get the result of ONE
/// renewal, because the refresh token is single-use and presenting it twice
/// would end the whole sign-in.
///
/// Returns the new access token; `null` when the session has ended (no
/// refresh token, it expired, or Banzami refused it); throws during an outage
/// ([BanzamiApiException] 5xx/429, [BanzamiNetworkException]) — which says
/// nothing about the session.
Future<RenewedSession?> renewBusinessSession({
  required BanzamiClient client,
  required MerchantSessionService session,
}) =>
    session.renewOnce(() => _renew(client, session));

Future<RenewedSession?> _renew(BanzamiClient client, MerchantSessionService session) async {
  final s = session.session;
  if (s == null || !s.canRenew) return null;

  final tokens = await client.refreshMerchantSession(s.refreshToken!);
  if (tokens == null) return null; // SESSION_ENDED

  if (await session.applyRenewedTokens(s, tokens)) return tokens;

  // The session was ended or replaced while the renewal was in flight. The
  // tokens just issued belong to nobody: revoke them, and let whatever session
  // is current now answer.
  final refresh = tokens.refreshToken;
  if (refresh != null) {
    unawaited(client.logoutMerchantSession(refresh).catchError((Object _) {}));
  }
  final cur = session.session;
  if (cur != null && cur.isHandleLogin && !session.isTokenExpired(margin: Duration.zero)) {
    return RenewedSession(token: cur.jwt!, expiresAt: cur.jwtExpiresAt!);
  }
  return null;
}

/// What unlocking the device found out about a Business session.
enum SessionResume {
  /// The access token is fresh, or was just renewed with the refresh token.
  active,

  /// Banzami could not be reached to renew. The session has not ended; the
  /// screens say the service is temporarily unavailable and try again.
  unavailable,

  /// The session has ended: the app is now on sign-in.
  ended,
}

/// Called when the device is unlocked (PIN checked on the device, or
/// biometrics): renews an expired access token with the refresh token before
/// any screen that needs it is shown. The PIN is never sent to Banzami here.
Future<SessionResume> resumeBusinessSession({
  required BanzamiClient client,
  required MerchantSessionService session,
}) async {
  if (session.session == null) return SessionResume.ended;
  if (!session.isTokenExpired()) return SessionResume.active;
  try {
    await client.ensureSession();
    return SessionResume.active;
  } on BanzamiApiException catch (e) {
    return e.statusCode == 401 ? SessionResume.ended : SessionResume.unavailable;
  } on BanzamiNetworkException {
    return SessionResume.unavailable;
  }
}

/// Signs in again from the handle + PIN the user just entered — only when the
/// session cannot be renewed (it ended, or it predates refresh tokens).
///
/// The PIN never leaves this call: nothing stores it (the device keeps only a
/// salted hash for the offline lock). The identity is re-read with the fresh
/// token and replaces what the device remembered, so a handle that now belongs
/// to a different Business Account can never pair a new token with an old
/// wallet. The new refresh token is stored with the session.
Future<void> reauthenticateBusiness({
  required BanzamiClient client,
  required MerchantSessionService session,
  required String pin,
}) async {
  final handle = session.session?.handle ?? session.signInHandle;
  if (handle == null) throw const ReauthException(ReauthFailure.refused);

  final MerchantAuthTokens auth;
  try {
    auth = await client.loginMerchantHandlePin(handle: handle, pin: pin);
  } on BanzamiApiException catch (e) {
    throw ReauthException(e.statusCode == 429 ? ReauthFailure.locked : ReauthFailure.refused);
  } on BanzamiNetworkException {
    throw const ReauthException(ReauthFailure.offline);
  } on FormatException {
    // A non-JSON answer (a proxy error page) says nothing about the session.
    throw const ReauthException(ReauthFailure.offline);
  }

  final merchantId = claimFromJwt(auth.token, 'merchant_id');
  if (merchantId == null) throw const ReauthException(ReauthFailure.refused);

  try {
    client.setJwt(auth.token, expiresAt: auth.expiresAt);
    final merchant = await client.getMerchant(merchantId);
    final wallet   = await client.getMerchantWallet();
    await session.applyReauthentication(
      jwt:              auth.token,
      jwtExpiresAt:     auth.expiresAt,
      refreshToken:     auth.refreshToken,
      refreshExpiresAt: auth.refreshExpiresAt,
      environment:      auth.environment,
      merchantId:       merchant.id,
      merchantName:     merchant.name,
      merchantEmail:    merchant.email,
      walletId:         wallet.id,
      verified:         merchant.verified,
    );
  } on BanzamiNetworkException {
    throw const ReauthException(ReauthFailure.offline);
  } on BanzamiApiException {
    throw const ReauthException(ReauthFailure.refused);
  }
}

/// Signs out of this device. Local state is cleared first and regardless —
/// the device stops looking signed in at once — then the refresh token is
/// revoked on Banzami, best effort (an unreachable server cannot keep the
/// device signed in; the token is gone from it either way).
///
/// "Terminar sessão" keeps the @handle so signing in again asks only for the
/// PIN; [removeAccount] ("Remover conta" / "Usar outra conta") forgets the
/// Business entirely.
Future<void> signOutBusiness({
  required BanzamiClient client,
  required MerchantSessionService session,
  bool removeAccount = false,
}) async {
  final refresh = session.session?.refreshToken;
  if (removeAccount) {
    await session.clearAccount();
  } else {
    await session.endSession();
  }
  if (refresh == null) return;
  try {
    await client.logoutMerchantSession(refresh);
  } on Exception {
    // Best effort: see above.
  }
}
