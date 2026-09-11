import 'dart:async';

import 'package:banzami_flutter/banzami_flutter.dart' show MerchantAuthTokens, RenewedSession;
import 'package:flutter/foundation.dart';
import 'package:local_auth/local_auth.dart';

import '../../services/banzami_keychain.dart';
import '../../services/pin_hasher.dart';
import '../../services/push_notification_service.dart';
import 'merchant_push_registration.dart';

// ---------------------------------------------------------------------------
// Session model
// ---------------------------------------------------------------------------

/// How the current session was authenticated. The Business App signs in with
/// @banza + PIN only: the old "credenciais de integração" path asked for a
/// secret API key, and a secret key never lives in a mobile app (CLAUDE.md §6,
/// §13). A device that still holds one is wiped on upgrade (see [initialize]).
enum MerchantLoginMethod { handlePin }

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

/// The Business session: [jwt] (+[jwtExpiresAt], from @handle + PIN login)
/// with the rotating [refreshToken] that renews it.
class MerchantSession {
  final String merchantId;
  final String merchantName;
  final String merchantEmail;
  final String walletId;

  final MerchantLoginMethod loginMethod;
  final String environment; // 'LIVE' | 'SANDBOX'

  final String?   jwt;
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
  /// handle isn't known. This is the primary public
  /// identifier — the merchant UUID is internal and never the display identity.
  String? get banzaAddress =>
      (handle != null && handle!.trim().isNotEmpty) ? '@${handle!.trim()}' : null;

  /// The credential in use — the current JWT. Never for display.
  String get authIdentity => jwt ?? '';

  /// Decides whether a cached BanzamiClient can be reused: the same Business
  /// signed in the same way. Stable across access-token renewals — a renewal
  /// must not replace the client (and its single in-flight renewal) mid-burst.
  String get clientKey => 'handle:$merchantId:$environment';

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
  /// [push] takes the device off a Business's payment notifications when its
  /// session ends; Firebase unless a test passes its own.
  MerchantSessionService({MerchantPushRegistration? push})
      : _push = push ?? const FirebaseMerchantPushRegistration();

  final MerchantPushRegistration _push;

  // This device only: the Business session never travels in an iCloud
  // keychain or a device backup restored onto another phone.
  static const _store = BanzamiKeychain.store;
  /// What older versions wrote with — still readable, rewritten once by
  /// [_migrateKeychainOnce], and included when the account is wiped.
  static const _legacyIOptions = BanzamiKeychain.legacyIOptions;
  /// Bumped when the list below grows: an install that already ran v2 has
  /// items (the push topic) that v2 never moved, so the pass must run again.
  static const _kKeychainV2   = 'merchant_keychain_this_device_v3';
  static const _legacyPinSalt = 'banzami:merchant:{pin}:ao';
  static final _bio = LocalAuthentication();

  static const _kMerchantId    = 'merchant_id';
  static const _kMerchantName  = 'merchant_name';
  static const _kMerchantEmail = 'merchant_email';
  static const _kWalletId      = 'merchant_wallet_id';
  /// Legacy only: read once to wipe a device that still holds a secret key.
  static const _kLegacyApiKey  = 'merchant_api_key';
  static const _kJwt           = 'merchant_jwt';
  static const _kJwtExpiry     = 'merchant_jwt_expiry';
  static const _kRefreshToken  = 'merchant_refresh_token';
  static const _kRefreshExpiry = 'merchant_refresh_expiry';
  static const _kHandle        = 'merchant_handle';
  static const _kLoginMethod   = 'merchant_login_method'; // 'handle_pin'
  static const _kEnvironment   = 'merchant_environment';  // 'LIVE' | 'SANDBOX'
  static const _kPinHash       = 'merchant_pin_hash';
  static const _kBioEnabled    = 'merchant_bio_enabled';
  static const _kVerified      = 'merchant_verified';
  static const _kNotifSound    = 'merchant_notif_sound';
  /// The FCM topic the gateway named for the signed-in Business (A6-06), so
  /// ending the session leaves it even before the app has asked again.
  static const _kPushTopic     = 'merchant_push_topic';

  /// What an ended Business session leaves behind: the tokens first (so an
  /// interrupted wipe can never leave a renewable session), then everything
  /// the device remembered about the Business. Kept: the @handle (to sign in
  /// again), the login method + environment, the PIN hash (the device lock,
  /// checked before a server attempt is spent) and the device preferences.
  static const _sessionKeys = [
    _kRefreshToken, _kRefreshExpiry, _kJwt, _kJwtExpiry,
    _kMerchantId, _kMerchantName, _kMerchantEmail, _kWalletId, _kVerified,
    _kPushTopic,
  ];

  /// Whether to play a confirmation sound on incoming payment notifications.
  /// Defaults to on. Background notifications also follow the OS sound settings.
  static Future<bool> isNotifSoundEnabled() async =>
      (await _store.read(key: _kNotifSound)) != '0';
  static Future<void> setNotifSoundEnabled(bool on) async =>
      _store.write(key: _kNotifSound, value: on ? '1' : '0');

  MerchantSession? _session;
  /// The topic [rememberPushTopic] recorded for the signed-in Business.
  String? _pushTopic;
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
  /// expired access token is not an ended session while [MerchantSession.canRenew].
  bool isTokenExpired({Duration margin = const Duration(minutes: 2)}) {
    final s = _session;
    if (s == null) return false;
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

  /// Items written before this version are AfterFirstUnlock (they could leave
  /// the device in a backup). Rewriting each moves it to ThisDeviceOnly — the
  /// plugin re-adds an item whose accessibility differs. Once per install.
  Future<void> _migrateKeychainOnce() async {
    try {
      if (await _store.read(key: _kKeychainV2) != null) return;
      for (final k in const [
        _kMerchantId, _kMerchantName, _kMerchantEmail, _kWalletId, _kJwt,
        _kJwtExpiry, _kRefreshToken, _kRefreshExpiry, _kHandle, _kLoginMethod,
        _kEnvironment, _kPinHash, _kBioEnabled, _kVerified, _kNotifSound,
        _kPushTopic,
      ]) {
        final v = await _store.read(key: k);
        if (v != null) await _store.write(key: k, value: v);
      }
      await _store.write(key: _kKeychainV2, value: '1');
    } catch (e) {
      debugPrint('[session] keychain migration deferred: ${e.runtimeType}');
    }
  }

  Future<void> _wipeEverything() async {
    await _store.deleteAll();
    // deleteAll only matches items of its own accessibility: also remove
    // anything an older version wrote.
    await _store.deleteAll(iOptions: _legacyIOptions);
  }

  Future<void> initialize() async {
    final started = DateTime.now();
    await _migrateKeychainOnce();
    final merchantId    = await _store.read(key: _kMerchantId);
    final merchantName  = await _store.read(key: _kMerchantName);
    final merchantEmail = await _store.read(key: _kMerchantEmail);
    final walletId      = await _store.read(key: _kWalletId);
    final legacyApiKey  = await _store.read(key: _kLegacyApiKey);
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
    _pushTopic          = await _store.read(key: _kPushTopic);

    // Withdrawn API-key sessions: a device that stored a secret API key (or a
    // session signed in any other way than @banza + PIN) keeps nothing of it.
    // The whole account is wiped once, and the Business signs in with its
    // @banza + PIN.
    if (legacyApiKey != null || (merchantId != null && method != 'handle_pin')) {
      _unregisterPush(merchantId);
      try {
        await _serial(_wipeEverything);
      } catch (e) {
        debugPrint('[session] could not wipe a legacy API-key session: ${e.runtimeType}');
      }
      await _finishInitialize(started);
      return;
    }

    final hasIdentity = merchantId != null && merchantName != null &&
        merchantEmail != null && walletId != null;
    const loginMethod = MerchantLoginMethod.handlePin;
    final env = environment ?? 'LIVE';
    final hasAuth = jwt != null;

    if (hasIdentity && hasAuth) {
      _session = MerchantSession(
        merchantId:        merchantId,
        merchantName:      merchantName,
        merchantEmail:     merchantEmail,
        walletId:          walletId,
        loginMethod:       loginMethod,
        environment:       env,
        jwt:               jwt,
        jwtExpiresAt:      jwtExpiry != null ? DateTime.tryParse(jwtExpiry) : null,
        refreshToken:      refreshToken,
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
      _unregisterPush(s.merchantId);
      _enterSignIn(s.handle);
      await _wipeEndedSessionSafely();
    } else if (s == null && method == 'handle_pin' &&
        handle != null && pinHash != null) {
      // A Business session that ended earlier (or whose wipe was interrupted:
      // then the Business it named is still stored, and is unsubscribed again).
      _unregisterPush(merchantId);
      _enterSignIn(handle);
      await _wipeEndedSessionSafely();
    }

    await _finishInitialize(started);
  }

  Future<void> _finishInitialize(DateTime started) async {
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

  /// Takes this device off the payment notifications of [merchantId] — every
  /// topic Banzami could publish them to — when that Business's session ends
  /// here (refused, signed out, removed) or another Business replaces it.
  ///
  /// Called BEFORE the identity that names the topics is cleared, and never
  /// awaited: best effort. An unreachable FCM cannot keep the device signed
  /// in, and the platform SDKs retry a topic operation that could not be sent.
  /// A signed-out device must not keep announcing the Business's payments.
  void _unregisterPush(String? merchantId) {
    // The topic the gateway named (A6-06), and the legacy id-derived ones.
    final topics = [
      if (merchantId != null && merchantId.isNotEmpty)
        ...PushNotificationService.legacyMerchantTopics(merchantId),
      if (_pushTopic != null && _pushTopic!.isNotEmpty) _pushTopic!,
    ];
    _pushTopic = null;
    for (final topic in topics) {
      // Future.sync: the call starts now, while the session is still here.
      unawaited(Future.sync(() => _push.unsubscribe(topic)).catchError((Object e) {
        debugPrint('[session] could not unsubscribe from a Business topic: ${e.runtimeType}');
      }));
    }
  }

  /// Records the FCM topic the gateway named for [merchantId] (A6-06) —
  /// before the device subscribes — so ending the session leaves it. Ignored
  /// once that Business is no longer the one signed in here.
  Future<void> rememberPushTopic(String merchantId, String topic) async {
    if (_session?.merchantId != merchantId || topic.isEmpty) return;
    _pushTopic = topic;
    try {
      await _serial(() => _store.write(key: _kPushTopic, value: topic));
    } catch (e) {
      debugPrint('[session] could not store the push topic: ${e.runtimeType}');
    }
  }

  /// A sign-in for [merchantId] replaces a live session of ANOTHER Business:
  /// that one's notifications stop here.
  void _retireOtherBusiness(String merchantId) {
    final prev = _session;
    if (prev != null && prev.merchantId != merchantId) _unregisterPush(prev.merchantId);
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
  // Sign-in — @banza + PIN is the only way in
  // ---------------------------------------------------------------------------

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
    _retireOtherBusiness(merchantId);
    await _serial(() async {
      await _persistIdentity(merchantId, merchantName, merchantEmail, walletId, environment, verified, pin);
      await _store.write(key: _kLoginMethod, value: 'handle_pin');
      await _persistTokens(jwt, jwtExpiresAt, refreshToken, refreshExpiresAt);
      await _store.write(key: _kHandle, value: handle);
      await _store.delete(key: _kLegacyApiKey);
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
    await _store.write(key: _kPinHash,       value: PinHasher.hash(pin));
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
    if (stored == null) return false;
    final ok = PinHasher.verify(pin, stored, legacySalt: _legacyPinSalt);
    // A hash from an older version is replaced by a slow, salted one the
    // first time the right PIN is entered.
    if (ok && PinHasher.isLegacy(stored)) {
      await _serial(() => _store.write(key: _kPinHash, value: PinHasher.hash(pin)));
    }
    return ok;
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
  /// A Business (handle) session ENDS here: the device is taken off the
  /// Business's payment notifications (first, while its id is still known),
  /// the tokens and everything the device remembered about the Business
  /// (identity, wallet, verification) are cleared at once, and the app shows
  /// sign-in for the @handle — never a profile that looks signed in over calls
  /// that can only fail. Balance and history live in the main screens, which
  /// are left and disposed.
  void markExpired() {
    final s = _session;
    if (s == null) return; // nothing signed in, or already ended
    _unregisterPush(s.merchantId);
    _enterSignIn(s.handle);
    notifyListeners();
    unawaited(_serial(_wipeSessionState).catchError((Object e) {
      // The session is over in memory either way. Tokens a failed wipe left
      // behind are refused again at the next start, which ends it again.
      debugPrint('[session] could not clear the ended session: ${e.runtimeType}');
    }));
  }

  /// Signs out of this device ("Terminar sessão"). For a Business session the
  /// session ends exactly as [markExpired] does (payment notifications
  /// included), and the refresh token it
  /// held is returned so the caller can revoke it server-side.
  Future<String?> endSession() async {
    final s = _session;
    if (s == null) return null;
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
    // The handle may now name another Business: the one this device followed
    // is then no longer signed in here.
    _retireOtherBusiness(merchantId);
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
  /// The device is taken off the Business's payment notifications first.
  Future<void> clearAccount() async {
    _unregisterPush(_session?.merchantId);
    _session      = null;
    _signInHandle = null;
    _locked       = true;
    _expired      = false;
    notifyListeners();
    await _serial(_wipeEverything);
  }
}
