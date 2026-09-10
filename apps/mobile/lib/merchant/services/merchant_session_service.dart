import 'dart:async';
import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart' show MerchantAuthTokens, RenewedSession;
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

// ---------------------------------------------------------------------------
// Session model
// ---------------------------------------------------------------------------

/// How the current session was authenticated.
enum MerchantLoginMethod { apiKey, handlePin }

/// Which screen the Business App shows for the current session state.
enum MerchantRoute {
  /// No Business on this device: welcome / sign-in from scratch.
  welcome,

  /// A Business session ENDED on the server (its refresh token was refused,
  /// or it has none and its access token expired). Nothing it knew is kept
  /// except the @handle: the user signs in again with handle + PIN.
  signIn,

  /// A live session behind the device lock (PIN / biometrics, checked here).
  locked,

  /// Signed in and unlocked.
  signedIn,
}

/// Unified merchant session. The rest of the app uses this abstraction and
/// never needs to know whether the JWT came from an API key or @handle + PIN.
///
/// Exactly one auth credential is held: [apiKey] (legacy integration login) OR
/// [jwt] (+[jwtExpiresAt], from @handle + PIN login) with the rotating
/// [refreshToken] that renews it.
class MerchantSession {
  final String merchantId;
  final String merchantName;
  final String merchantEmail;
  final String walletId;

  final MerchantLoginMethod loginMethod;
  final String environment; // 'LIVE' | 'SANDBOX'

  final String?   apiKey;           // set only for apiKey login
  final String?   jwt;              // set only for handlePin login
  final DateTime? jwtExpiresAt;
  final String?   refreshToken;     // handlePin login; single-use, rotates
  final DateTime? refreshExpiresAt;
  final String?   handle;           // set only for handlePin login

  final bool biometricsEnabled;
  final bool verified;

  const MerchantSession({
    required this.merchantId,
    required this.merchantName,
    required this.merchantEmail,
    required this.walletId,
    required this.loginMethod,
    required this.environment,
    this.apiKey,
    this.jwt,
    this.jwtExpiresAt,
    this.refreshToken,
    this.refreshExpiresAt,
    this.handle,
    this.biometricsEnabled = false,
    this.verified          = false,
  });

  bool get isSandbox     => environment == 'SANDBOX';
  bool get isHandleLogin => loginMethod == MerchantLoginMethod.handlePin;

  /// A handle session that can still renew its access token without the PIN:
  /// it holds a refresh token that has not expired. A session stored before
  /// renewable sessions existed has none.
  bool get canRenew {
    if (!isHandleLogin || refreshToken == null) return false;
    final exp = refreshExpiresAt;
    return exp == null || DateTime.now().isBefore(exp);
  }

  /// The merchant's @banza payment address (e.g. "@doa"), or null when the
  /// handle isn't known (legacy API-key sessions). This is the primary public
  /// identifier — the merchant UUID is internal and never the display identity.
  String? get banzaAddress =>
      (handle != null && handle!.trim().isNotEmpty) ? '@${handle!.trim()}' : null;

  /// The credential in use — the API key (legacy) or the current JWT. Never
  /// for display.
  String get authIdentity => apiKey ?? jwt ?? '';

  /// Decides whether a cached BanzamiClient can be reused: the same Business
  /// signed in the same way. Stable across access-token renewals — a renewal
  /// must not replace the client (and its single in-flight renewal) mid-burst.
  String get clientKey => isHandleLogin
      ? 'handle:$merchantId:$environment'
      : 'api_key:${apiKey ?? ''}';

  MerchantSession copyWith({
    bool? biometricsEnabled,
    bool? verified,
    String? jwt,
    DateTime? jwtExpiresAt,
    String? refreshToken,
    DateTime? refreshExpiresAt,
    bool clearRefreshToken = false,
  }) =>
      MerchantSession(
        merchantId:        merchantId,
        merchantName:      merchantName,
        merchantEmail:     merchantEmail,
        walletId:          walletId,
        loginMethod:       loginMethod,
        environment:       environment,
        apiKey:            apiKey,
        jwt:               jwt          ?? this.jwt,
        jwtExpiresAt:      jwtExpiresAt ?? this.jwtExpiresAt,
        refreshToken:      clearRefreshToken ? null : (refreshToken ?? this.refreshToken),
        refreshExpiresAt:  clearRefreshToken ? null : (refreshExpiresAt ?? this.refreshExpiresAt),
        handle:            handle,
        biometricsEnabled: biometricsEnabled ?? this.biometricsEnabled,
        verified:          verified          ?? this.verified,
      );
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class MerchantSessionService extends ChangeNotifier {
  static const _store = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );
  static final _bio = LocalAuthentication();

  static const _kMerchantId    = 'merchant_id';
  static const _kMerchantName  = 'merchant_name';
  static const _kMerchantEmail = 'merchant_email';
  static const _kWalletId      = 'merchant_wallet_id';
  static const _kApiKey        = 'merchant_api_key';
  static const _kJwt           = 'merchant_jwt';
  static const _kJwtExpiry     = 'merchant_jwt_expiry';
  static const _kRefreshToken  = 'merchant_refresh_token';
  static const _kRefreshExpiry = 'merchant_refresh_expiry';
  static const _kHandle        = 'merchant_handle';
  static const _kLoginMethod   = 'merchant_login_method'; // 'api_key' | 'handle_pin'
  static const _kEnvironment   = 'merchant_environment';  // 'LIVE' | 'SANDBOX'
  static const _kPinHash       = 'merchant_pin_hash';
  static const _kBioEnabled    = 'merchant_bio_enabled';
  static const _kVerified      = 'merchant_verified';
  static const _kNotifSound    = 'merchant_notif_sound';

  /// What an ended Business session leaves behind: the tokens first (so an
  /// interrupted wipe can never leave a renewable session), then everything
  /// the device remembered about the Business. Kept: the @handle (to sign in
  /// again), the login method + environment, the PIN hash (the device lock,
  /// checked before a server attempt is spent) and the device preferences.
  static const _sessionKeys = [
    _kRefreshToken, _kRefreshExpiry, _kJwt, _kJwtExpiry,
    _kMerchantId, _kMerchantName, _kMerchantEmail, _kWalletId, _kVerified,
  ];

  /// Whether to play a confirmation sound on incoming payment notifications.
  /// Defaults to on. Background notifications also follow the OS sound settings.
  static Future<bool> isNotifSoundEnabled() async =>
      (await _store.read(key: _kNotifSound)) != '0';
  static Future<void> setNotifSoundEnabled(bool on) async =>
      _store.write(key: _kNotifSound, value: on ? '1' : '0');

  MerchantSession? _session;
  bool             _locked      = true;
  bool             _initialized = false;
  bool             _expired     = false;

  /// The @handle of a Business session that ended, for signing in again.
  String?          _signInHandle;

  /// Storage mutations run one after another, so the wipe of an ended session
  /// can never interleave with (and undo, or be undone by) a renewal's writes.
  Future<void>? _storage;

  /// The app-level renewal in flight. The client already shares one renewal
  /// between its requests; this also covers a second client instance, so the
  /// single-use refresh token is never presented twice at once.
  Future<RenewedSession?>? _renewing;

  MerchantSession? get session     => _session;
  bool             get isLocked    => _locked;
  bool             get hasSession  => _session != null;
  bool             get initialized => _initialized;

  /// The server no longer accepts this device's session. For a Business
  /// (handle) session this means it has ended: [session] is null, nothing it
  /// remembered is kept, and the PIN signs in again against Banzami (see
  /// [signInHandle]); biometrics cannot stand in for it. Cleared by
  /// [applyReauthentication] or a new sign-in.
  bool             get sessionExpired => _expired;

  /// The @handle to sign in again with, while [route] is [MerchantRoute.signIn].
  String? get signInHandle => _expired ? _signInHandle : null;

  MerchantRoute get route {
    if (_session == null) {
      return (_expired && _signInHandle != null) ? MerchantRoute.signIn : MerchantRoute.welcome;
    }
    return _locked ? MerchantRoute.locked : MerchantRoute.signedIn;
  }

  /// A handle-login ACCESS token that has expired, or will within [margin]. An
  /// API-key session renews its own token and never reports expired here. An
  /// expired access token is not an ended session while [MerchantSession.canRenew].
  bool isTokenExpired({Duration margin = const Duration(minutes: 2)}) {
    final s = _session;
    if (s == null || !s.isHandleLogin) return false;
    final exp = s.jwtExpiresAt;
    if (s.jwt == null || exp == null) return true;
    return !DateTime.now().add(margin).isBefore(exp);
  }

  /// Completes when every storage write queued so far has landed.
  Future<void> get settled => _storage ?? Future<void>.value();

  /// Runs [op] after every storage mutation queued before it. When nothing is
  /// queued it runs at once (the queue is dropped when it drains, so no
  /// completed future is kept around to chain on).
  Future<T> _serial<T>(Future<T> Function() op) {
    final prev   = _storage;
    final result = prev == null ? op() : prev.then((_) => op());
    late final Future<void> tail;
    tail = result.then<void>((_) {}, onError: (Object _) {}).whenComplete(() {
      if (identical(_storage, tail)) _storage = null;
    });
    _storage = tail;
    return result;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  Future<void> initialize() async {
    final started = DateTime.now();
    final merchantId    = await _store.read(key: _kMerchantId);
    final merchantName  = await _store.read(key: _kMerchantName);
    final merchantEmail = await _store.read(key: _kMerchantEmail);
    final walletId      = await _store.read(key: _kWalletId);
    final apiKey        = await _store.read(key: _kApiKey);
    final jwt           = await _store.read(key: _kJwt);
    final jwtExpiry     = await _store.read(key: _kJwtExpiry);
    final refreshToken  = await _store.read(key: _kRefreshToken);
    final refreshExpiry = await _store.read(key: _kRefreshExpiry);
    final handle        = await _store.read(key: _kHandle);
    final method        = await _store.read(key: _kLoginMethod);
    final environment   = await _store.read(key: _kEnvironment);
    final bioEnabled    = await _store.read(key: _kBioEnabled);
    final verified      = await _store.read(key: _kVerified);
    final pinHash       = await _store.read(key: _kPinHash);

    final hasIdentity = merchantId != null && merchantName != null &&
        merchantEmail != null && walletId != null;
    // Backward compatible: sessions stored before this refactor have no method
    // and only an API key → treat them as apiKey login.
    final loginMethod = method == 'handle_pin'
        ? MerchantLoginMethod.handlePin
        : MerchantLoginMethod.apiKey;
    final env = environment ??
        ((apiKey != null && apiKey.startsWith('bz_test')) ? 'SANDBOX' : 'LIVE');
    final hasAuth = loginMethod == MerchantLoginMethod.handlePin
        ? jwt != null
        : apiKey != null;

    if (hasIdentity && hasAuth) {
      _session = MerchantSession(
        merchantId:        merchantId,
        merchantName:      merchantName,
        merchantEmail:     merchantEmail,
        walletId:          walletId,
        loginMethod:       loginMethod,
        environment:       env,
        apiKey:            loginMethod == MerchantLoginMethod.apiKey ? apiKey : null,
        jwt:               loginMethod == MerchantLoginMethod.handlePin ? jwt : null,
        jwtExpiresAt:      jwtExpiry != null ? DateTime.tryParse(jwtExpiry) : null,
        refreshToken:      loginMethod == MerchantLoginMethod.handlePin ? refreshToken : null,
        refreshExpiresAt:  refreshExpiry != null ? DateTime.tryParse(refreshExpiry) : null,
        handle:            handle,
        biometricsEnabled: bioEnabled == 'true',
        verified:          verified   == 'true',
      );
    }

    final s = _session;
    if (s != null && s.isHandleLogin && !s.canRenew && isTokenExpired()) {
      // A restored Business session that cannot renew — stored before
      // renewable sessions, or its refresh token has expired — and whose
      // access token is dead opens on SIGN-IN, never on a home screen whose
      // every financial call would fail while the profile, read from this
      // device, looked signed in.
      _enterSignIn(s.handle);
      await _wipeEndedSessionSafely();
    } else if (s == null && loginMethod == MerchantLoginMethod.handlePin &&
        handle != null && pinHash != null) {
      // A Business session that ended earlier (or whose wipe was interrupted).
      _enterSignIn(handle);
      await _wipeEndedSessionSafely();
    }

    // Keep the animated welcome (splash) up for at least the animation duration
    // (1200ms), matching the consumer app, so it plays fully and never flashes.
    final elapsed = DateTime.now().difference(started);
    const minSplash = Duration(milliseconds: 1200);
    if (elapsed < minSplash) {
      await Future<void>.delayed(minSplash - elapsed);
    }

    _initialized = true;
    notifyListeners();
  }

  void _enterSignIn(String? handle) {
    _session      = null;
    _signInHandle = handle;
    _expired      = true;
    _locked       = true;
  }

  Future<void> _wipeEndedSessionSafely() async {
    try {
      await _serial(_wipeSessionState);
    } catch (e) {
      debugPrint('[session] could not clear the ended session: ${e.runtimeType}');
    }
  }

  Future<void> _wipeSessionState() async {
    for (final k in _sessionKeys) {
      await _store.delete(key: k);
    }
  }

  // ---------------------------------------------------------------------------
  // Setup — both auth paths persist the SAME unified session
  // ---------------------------------------------------------------------------

  /// API-key login (Merchant ID + API Key).
  Future<void> createSession({
    required String merchantId,
    required String merchantName,
    required String merchantEmail,
    required String walletId,
    required String apiKey,
    required String pin,
    bool verified = false,
  }) async {
    final env = apiKey.startsWith('bz_test') ? 'SANDBOX' : 'LIVE';
    await _serial(() async {
      await _persistIdentity(merchantId, merchantName, merchantEmail, walletId, env, verified, pin);
      await _store.write(key: _kLoginMethod, value: 'api_key');
      await _store.write(key: _kApiKey, value: apiKey);
      await _store.delete(key: _kRefreshToken);
      await _store.delete(key: _kRefreshExpiry);
      await _store.delete(key: _kJwt);
      await _store.delete(key: _kJwtExpiry);
      await _store.delete(key: _kHandle);
    });
    _session = MerchantSession(
      merchantId:    merchantId,
      merchantName:  merchantName,
      merchantEmail: merchantEmail,
      walletId:      walletId,
      loginMethod:   MerchantLoginMethod.apiKey,
      environment:   env,
      apiKey:        apiKey,
      verified:      verified,
    );
    _expired      = false;
    _signInHandle = null;
    _locked       = false;
    notifyListeners();
  }

  /// @handle + PIN login. The caller has already exchanged handle+PIN for
  /// tokens (BanzamiClient.loginMerchantHandlePin) and fetched the merchant +
  /// wallet. [refreshToken] / [refreshExpiresAt] come with the sign-in from a
  /// gateway with renewable sessions.
  Future<void> createHandleSession({
    required String merchantId,
    required String merchantName,
    required String merchantEmail,
    required String walletId,
    required String jwt,
    required DateTime jwtExpiresAt,
    required String handle,
    required String environment,
    required String pin,
    String? refreshToken,
    DateTime? refreshExpiresAt,
    bool verified = false,
  }) async {
    await _serial(() async {
      await _persistIdentity(merchantId, merchantName, merchantEmail, walletId, environment, verified, pin);
      await _store.write(key: _kLoginMethod, value: 'handle_pin');
      await _persistTokens(jwt, jwtExpiresAt, refreshToken, refreshExpiresAt);
      await _store.write(key: _kHandle, value: handle);
      await _store.delete(key: _kApiKey);
    });
    _session = MerchantSession(
      merchantId:       merchantId,
      merchantName:     merchantName,
      merchantEmail:    merchantEmail,
      walletId:         walletId,
      loginMethod:      MerchantLoginMethod.handlePin,
      environment:      environment,
      jwt:              jwt,
      jwtExpiresAt:     jwtExpiresAt,
      refreshToken:     refreshToken,
      refreshExpiresAt: refreshExpiresAt,
      handle:           handle,
      verified:         verified,
    );
    _expired      = false;
    _signInHandle = null;
    _locked       = false;
    notifyListeners();
  }

  /// Update the cached KYB-verified flag from the live status (e.g. after the
  /// dashboard fetches getMerchantKybStatus). Persists + notifies so the whole
  /// app reflects a sandbox auto-approval without needing a re-login. No-op when
  /// unchanged or when there is no session.
  Future<void> setVerified(bool verified) async {
    final s = _session;
    if (s == null || s.verified == verified) return;
    _session = s.copyWith(verified: verified);
    await _store.write(key: _kVerified, value: verified ? 'true' : 'false');
    notifyListeners();
  }

  Future<void> _persistIdentity(String merchantId, String name, String email,
      String walletId, String env, bool verified, String pin) async {
    await _store.write(key: _kMerchantId,    value: merchantId);
    await _store.write(key: _kMerchantName,  value: name);
    await _store.write(key: _kMerchantEmail, value: email);
    await _store.write(key: _kWalletId,      value: walletId);
    await _store.write(key: _kEnvironment,   value: env);
    await _store.write(key: _kVerified,      value: verified ? 'true' : 'false');
    await _store.write(key: _kPinHash,       value: _hash(pin));
  }

  /// The refresh token is written BEFORE the access token: the presented one
  /// is already spent on the server, so if the app dies between the two
  /// writes, the device must hold the new refresh token (an old access token
  /// merely renews once more), never the spent one (which would end the
  /// sign-in on its next use).
  Future<void> _persistTokens(String jwt, DateTime jwtExpiresAt,
      String? refreshToken, DateTime? refreshExpiresAt) async {
    if (refreshToken != null) {
      await _store.write(key: _kRefreshToken, value: refreshToken);
    } else {
      await _store.delete(key: _kRefreshToken);
    }
    if (refreshExpiresAt != null) {
      await _store.write(key: _kRefreshExpiry, value: refreshExpiresAt.toIso8601String());
    } else {
      await _store.delete(key: _kRefreshExpiry);
    }
    await _store.write(key: _kJwt,       value: jwt);
    await _store.write(key: _kJwtExpiry, value: jwtExpiresAt.toIso8601String());
  }

  // ---------------------------------------------------------------------------
  // Renewal — the refresh token renews the access token; the PIN never leaves
  // the device for it
  // ---------------------------------------------------------------------------

  /// Runs [renew] unless a renewal is already in flight, in which case its
  /// result is shared.
  Future<RenewedSession?> renewOnce(Future<RenewedSession?> Function() renew) =>
      _renewing ??= renew().whenComplete(() => _renewing = null);

  /// Stores the tokens a renewal of [renewed] returned (refresh token first).
  /// Returns false — and stores nothing — when that sign-in is no longer the
  /// current one (it ended, or another sign-in replaced it while the renewal
  /// was in flight): renewed tokens never resurrect an ended session.
  Future<bool> applyRenewedTokens(MerchantSession renewed, MerchantAuthTokens t) {
    // The same sign-in: same Business, still holding the refresh token that
    // was just spent (a biometrics or KYB update in between does not matter).
    bool current() {
      final cur = _session;
      return cur != null &&
          cur.isHandleLogin &&
          cur.merchantId == renewed.merchantId &&
          cur.refreshToken == renewed.refreshToken;
    }

    return _serial(() async {
      if (!current()) return false;
      await _persistTokens(t.token, t.expiresAt, t.refreshToken, t.refreshExpiresAt);
      if (!current()) {
        // Ended during the writes: its wipe is queued behind us and removes them.
        return false;
      }
      // No notify: nothing visible changed, and the client already holds the
      // token (MerchantSession.clientKey keeps it in place).
      _session = _session!.copyWith(
        jwt:               t.token,
        jwtExpiresAt:      t.expiresAt,
        refreshToken:      t.refreshToken,
        refreshExpiresAt:  t.refreshExpiresAt,
        clearRefreshToken: t.refreshToken == null,
      );
      return true;
    });
  }

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  Future<bool> verifyPin(String pin) async {
    final stored = await _store.read(key: _kPinHash);
    return stored != null && _hash(pin) == stored;
  }

  void unlock() {
    if (_session == null) return; // an ended session is signed in, not unlocked
    _locked = false;
    notifyListeners();
  }

  void lock() {
    _locked = true;
    notifyListeners();
  }

  /// Called when Banzami refuses the session for good (the client's
  /// onUnauthorized: the renewal was refused, or the renewed token was
  /// refused too). Idempotent: however many requests fail together, the app
  /// transitions once — no retry loop, no refresh storm.
  ///
  /// A Business (handle) session ENDS here: the tokens and everything the
  /// device remembered about the Business (identity, wallet, verification)
  /// are cleared at once, and the app shows sign-in for the @handle — never a
  /// profile that looks signed in over calls that can only fail. Balance and
  /// history live in the main screens, which are left and disposed.
  void markExpired() {
    final s = _session;
    if (s == null) return; // nothing signed in, or already ended
    if (!s.isHandleLogin) {
      // An API-key session re-exchanges its own key; a refusal locks it.
      if (_expired && _locked) return;
      _expired = true;
      _locked  = true;
      notifyListeners();
      return;
    }
    _enterSignIn(s.handle);
    notifyListeners();
    unawaited(_serial(_wipeSessionState).catchError((Object e) {
      // The session is over in memory either way. Tokens a failed wipe left
      // behind are refused again at the next start, which ends it again.
      debugPrint('[session] could not clear the ended session: ${e.runtimeType}');
    }));
  }

  /// Signs out of this device ("Terminar sessão"). For a Business session the
  /// session ends exactly as [markExpired] does, and the refresh token it
  /// held is returned so the caller can revoke it server-side. An API-key
  /// session has no server session: it is locked, as before.
  Future<String?> endSession() async {
    final s = _session;
    if (s == null) return null;
    if (!s.isHandleLogin) {
      lock();
      return null;
    }
    final refresh = s.refreshToken;
    markExpired();
    await settled;
    return refresh;
  }

  /// A fresh server session from handle + PIN: re-signs an ended session in,
  /// or replaces a live one. The identity is re-read from the server with it:
  /// if the handle now belongs to a different Business Account than the one
  /// this device remembered (a handle moved, a credential reassigned), the
  /// stored merchant and wallet are replaced — never kept and silently mixed
  /// with the new token.
  Future<void> applyReauthentication({
    required String jwt,
    required DateTime jwtExpiresAt,
    required String merchantId,
    required String merchantName,
    required String merchantEmail,
    required String walletId,
    required bool   verified,
    String?   refreshToken,
    DateTime? refreshExpiresAt,
    String?   environment,
  }) async {
    final prev   = _session;
    final handle = prev?.handle ?? _signInHandle;
    if (handle == null) return;
    late final String env;
    late final bool bio;
    await _serial(() async {
      env = environment ?? prev?.environment ?? (await _store.read(key: _kEnvironment)) ?? 'LIVE';
      bio = prev?.biometricsEnabled ?? (await _store.read(key: _kBioEnabled)) == 'true';
      await _persistTokens(jwt, jwtExpiresAt, refreshToken, refreshExpiresAt);
      await _store.write(key: _kMerchantId,    value: merchantId);
      await _store.write(key: _kMerchantName,  value: merchantName);
      await _store.write(key: _kMerchantEmail, value: merchantEmail);
      await _store.write(key: _kWalletId,      value: walletId);
      await _store.write(key: _kVerified,      value: verified ? 'true' : 'false');
      await _store.write(key: _kEnvironment,   value: env);
      await _store.write(key: _kLoginMethod,   value: 'handle_pin');
      await _store.write(key: _kHandle,        value: handle);
    });
    _session = MerchantSession(
      merchantId:        merchantId,
      merchantName:      merchantName,
      merchantEmail:     merchantEmail,
      walletId:          walletId,
      loginMethod:       MerchantLoginMethod.handlePin,
      environment:       env,
      jwt:               jwt,
      jwtExpiresAt:      jwtExpiresAt,
      refreshToken:      refreshToken,
      refreshExpiresAt:  refreshExpiresAt,
      handle:            handle,
      biometricsEnabled: bio,
      verified:          verified,
    );
    _expired      = false;
    _signInHandle = null;
    _locked       = false;
    notifyListeners();
  }

  Future<bool> canUseBiometrics() async {
    try {
      return await _bio.canCheckBiometrics && await _bio.isDeviceSupported();
    } catch (_) { return false; }
  }

  Future<bool> authenticateWithBiometrics() async {
    try {
      return await _bio.authenticate(
        localizedReason: 'Autentique para aceder ao painel Banzami Business',
        options: const AuthenticationOptions(biometricOnly: true, stickyAuth: true),
      );
    } catch (_) { return false; }
  }

  Future<void> enableBiometrics() async {
    await _store.write(key: _kBioEnabled, value: 'true');
    if (_session != null) {
      _session = _session!.copyWith(biometricsEnabled: true);
      notifyListeners();
    }
  }

  Future<void> disableBiometrics() async {
    await _store.write(key: _kBioEnabled, value: 'false');
    if (_session != null) {
      _session = _session!.copyWith(biometricsEnabled: false);
      notifyListeners();
    }
  }

  // ---------------------------------------------------------------------------
  // Session control
  // ---------------------------------------------------------------------------

  /// Fully wipes all stored data. Use only for "switch account" / "remove account".
  Future<void> clearAccount() async {
    _session      = null;
    _signInHandle = null;
    _locked       = true;
    _expired      = false;
    notifyListeners();
    await _serial(_store.deleteAll);
  }

  // ---------------------------------------------------------------------------
  // PIN hashing — SHA-256 with app-specific salt
  // ---------------------------------------------------------------------------

  static String _hash(String pin) {
    final bytes = utf8.encode('banzami:merchant:$pin:ao');
    return sha256.convert(bytes).toString();
  }
}
