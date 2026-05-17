import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

// ---------------------------------------------------------------------------
// Session model
// ---------------------------------------------------------------------------

class MerchantSession {
  final String merchantId;
  final String merchantName;
  final String merchantEmail;
  final String walletId;
  final String apiKey;
  final bool   biometricsEnabled;
  final bool   verified;

  const MerchantSession({
    required this.merchantId,
    required this.merchantName,
    required this.merchantEmail,
    required this.walletId,
    required this.apiKey,
    this.biometricsEnabled = false,
    this.verified          = false,
  });

  MerchantSession copyWith({bool? biometricsEnabled, bool? verified}) => MerchantSession(
        merchantId:        merchantId,
        merchantName:      merchantName,
        merchantEmail:     merchantEmail,
        walletId:          walletId,
        apiKey:            apiKey,
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
  static const _kPinHash       = 'merchant_pin_hash';
  static const _kBioEnabled    = 'merchant_bio_enabled';
  static const _kVerified      = 'merchant_verified';

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
    final bioEnabled    = await _store.read(key: _kBioEnabled);
    final verified      = await _store.read(key: _kVerified);

    if (merchantId != null && merchantName != null &&
        merchantEmail != null && walletId != null && apiKey != null) {
      _session = MerchantSession(
        merchantId:        merchantId,
        merchantName:      merchantName,
        merchantEmail:     merchantEmail,
        walletId:          walletId,
        apiKey:            apiKey,
        biometricsEnabled: bioEnabled == 'true',
        verified:          verified   == 'true',
      );
    }
    _initialized = true;
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Setup — called after verifying credentials during onboarding
  // ---------------------------------------------------------------------------

  Future<void> createSession({
    required String merchantId,
    required String merchantName,
    required String merchantEmail,
    required String walletId,
    required String apiKey,
    required String pin,
  }) async {
    await _store.write(key: _kMerchantId,    value: merchantId);
    await _store.write(key: _kMerchantName,  value: merchantName);
    await _store.write(key: _kMerchantEmail, value: merchantEmail);
    await _store.write(key: _kWalletId,      value: walletId);
    await _store.write(key: _kApiKey,        value: apiKey);
    await _store.write(key: _kPinHash,       value: _hash(pin));
    await _store.write(key: _kVerified,      value: 'false');
    _session = MerchantSession(
      merchantId:    merchantId,
      merchantName:  merchantName,
      merchantEmail: merchantEmail,
      walletId:      walletId,
      apiKey:        apiKey,
    );
    _locked = false;
    notifyListeners();
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
        localizedReason: 'Autentique para aceder ao painel Banzami',
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
  // Logout
  // ---------------------------------------------------------------------------

  Future<void> logout() async {
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
