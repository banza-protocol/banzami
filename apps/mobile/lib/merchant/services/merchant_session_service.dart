import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

// ---------------------------------------------------------------------------
// Session model
// ---------------------------------------------------------------------------

/// How the current session was authenticated.
enum MerchantLoginMethod { apiKey, handlePin }

/// Unified merchant session. The rest of the app uses this abstraction and
/// never needs to know whether the JWT came from an API key or @handle + PIN.
///
/// Exactly one auth credential is held: [apiKey] (legacy integration login) OR
/// [jwt] (+[jwtExpiresAt], from @handle + PIN login).
class MerchantSession {
  final String merchantId;
  final String merchantName;
  final String merchantEmail;
  final String walletId;

  final MerchantLoginMethod loginMethod;
  final String environment; // 'LIVE' | 'SANDBOX'

  final String?   apiKey;        // set only for apiKey login
  final String?   jwt;           // set only for handlePin login
  final DateTime? jwtExpiresAt;
  final String?   handle;        // set only for handlePin login

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
    this.handle,
    this.biometricsEnabled = false,
    this.verified          = false,
  });

  bool get isSandbox     => environment == 'SANDBOX';
  bool get isHandleLogin => loginMethod == MerchantLoginMethod.handlePin;

  /// Identity used to decide if a cached BanzamiClient can be reused — never for
  /// display. The API key (legacy) or the JWT (handle login).
  String get authIdentity => apiKey ?? jwt ?? '';

  MerchantSession copyWith({bool? biometricsEnabled, bool? verified}) => MerchantSession(
        merchantId:        merchantId,
        merchantName:      merchantName,
        merchantEmail:     merchantEmail,
        walletId:          walletId,
        loginMethod:       loginMethod,
        environment:       environment,
        apiKey:            apiKey,
        jwt:               jwt,
        jwtExpiresAt:      jwtExpiresAt,
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
  static const _kHandle        = 'merchant_handle';
  static const _kLoginMethod   = 'merchant_login_method'; // 'api_key' | 'handle_pin'
  static const _kEnvironment   = 'merchant_environment';  // 'LIVE' | 'SANDBOX'
  static const _kPinHash       = 'merchant_pin_hash';
  static const _kBioEnabled    = 'merchant_bio_enabled';
  static const _kVerified      = 'merchant_verified';
  static const _kNotifSound    = 'merchant_notif_sound';

  /// Whether to play a confirmation sound on incoming payment notifications.
  /// Defaults to on. Background notifications also follow the OS sound settings.
  static Future<bool> isNotifSoundEnabled() async =>
      (await _store.read(key: _kNotifSound)) != '0';
  static Future<void> setNotifSoundEnabled(bool on) async =>
      _store.write(key: _kNotifSound, value: on ? '1' : '0');

  MerchantSession? _session;
  bool             _locked      = true;
  bool             _initialized = false;

  MerchantSession? get session     => _session;
  bool             get isLocked    => _locked;
  bool             get hasSession  => _session != null;
  bool             get initialized => _initialized;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  Future<void> initialize() async {
    final merchantId    = await _store.read(key: _kMerchantId);
    final merchantName  = await _store.read(key: _kMerchantName);
    final merchantEmail = await _store.read(key: _kMerchantEmail);
    final walletId      = await _store.read(key: _kWalletId);
    final apiKey        = await _store.read(key: _kApiKey);
    final jwt           = await _store.read(key: _kJwt);
    final jwtExpiry     = await _store.read(key: _kJwtExpiry);
    final handle        = await _store.read(key: _kHandle);
    final method        = await _store.read(key: _kLoginMethod);
    final environment   = await _store.read(key: _kEnvironment);
    final bioEnabled    = await _store.read(key: _kBioEnabled);
    final verified      = await _store.read(key: _kVerified);

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
        handle:            handle,
        biometricsEnabled: bioEnabled == 'true',
        verified:          verified   == 'true',
      );
    }
    _initialized = true;
    notifyListeners();
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
    await _persistIdentity(merchantId, merchantName, merchantEmail, walletId, env, verified, pin);
    await _store.write(key: _kLoginMethod, value: 'api_key');
    await _store.write(key: _kApiKey, value: apiKey);
    await _store.delete(key: _kJwt);
    await _store.delete(key: _kJwtExpiry);
    await _store.delete(key: _kHandle);
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
    _locked = false;
    notifyListeners();
  }

  /// @handle + PIN login. The caller has already exchanged handle+PIN for a JWT
  /// (BanzamiClient.loginMerchantHandlePin) and fetched the merchant + wallet.
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
    bool verified = false,
  }) async {
    await _persistIdentity(merchantId, merchantName, merchantEmail, walletId, environment, verified, pin);
    await _store.write(key: _kLoginMethod, value: 'handle_pin');
    await _store.write(key: _kJwt,       value: jwt);
    await _store.write(key: _kJwtExpiry, value: jwtExpiresAt.toIso8601String());
    await _store.write(key: _kHandle,    value: handle);
    await _store.delete(key: _kApiKey);
    _session = MerchantSession(
      merchantId:    merchantId,
      merchantName:  merchantName,
      merchantEmail: merchantEmail,
      walletId:      walletId,
      loginMethod:   MerchantLoginMethod.handlePin,
      environment:   environment,
      jwt:           jwt,
      jwtExpiresAt:  jwtExpiresAt,
      handle:        handle,
      verified:      verified,
    );
    _locked = false;
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

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  Future<bool> verifyPin(String pin) async {
    final stored = await _store.read(key: _kPinHash);
    return stored != null && _hash(pin) == stored;
  }

  void unlock() {
    _locked = false;
    notifyListeners();
  }

  void lock() {
    _locked = true;
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

  /// Locks the session — credentials stay in storage, PIN screen is shown.
  /// This is the standard "log out" action for a merchant POS device.
  Future<void> logout() async {
    _locked = true;
    notifyListeners();
  }

  /// Fully wipes all stored data. Use only for "switch account" / "remove account".
  Future<void> clearAccount() async {
    await _store.deleteAll();
    _session = null;
    _locked  = true;
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // PIN hashing — SHA-256 with app-specific salt
  // ---------------------------------------------------------------------------

  static String _hash(String pin) {
    final bytes = utf8.encode('banzami:merchant:$pin:ao');
    return sha256.convert(bytes).toString();
  }
}
