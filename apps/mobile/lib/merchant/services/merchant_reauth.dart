import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';

import 'merchant_session_service.dart';

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

/// Re-establishes the Business session from the handle + PIN the user just
/// entered — the Business App's refresh, as the consumer app's PIN unlock is.
///
/// The PIN is the refresh authority and never leaves this call: nothing stores
/// it (the device keeps only a salted hash for the offline lock). The identity
/// is re-read with the fresh token and replaces what the device remembered, so
/// a handle that now belongs to a different Business Account can never pair a
/// new token with an old wallet.
Future<void> reauthenticateBusiness({
  required BanzamiClient client,
  required MerchantSessionService session,
  required String pin,
}) async {
  final handle = session.session?.handle;
  if (handle == null) throw const ReauthException(ReauthFailure.refused);

  final ({String token, DateTime expiresAt, String environment}) auth;
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
      jwt:           auth.token,
      jwtExpiresAt:  auth.expiresAt,
      merchantId:    merchant.id,
      merchantName:  merchant.name,
      merchantEmail: merchant.email,
      walletId:      wallet.id,
      verified:      merchant.verified,
    );
  } on BanzamiNetworkException {
    throw const ReauthException(ReauthFailure.offline);
  } on BanzamiApiException {
    throw const ReauthException(ReauthFailure.refused);
  }
}
