import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

// ---------------------------------------------------------------------------
// Session model
// ---------------------------------------------------------------------------

class Session {
  final String  consumerId;
  final String  walletId;
  final String  handle;
  final String? displayName;
  final String  token;
  final bool    biometricsEnabled;

  const Session({
    required this.consumerId,
    required this.walletId,
    required this.handle,
    this.displayName,
    required this.token,
    this.biometricsEnabled = false,
  });

  Session copyWith({ bool? biometricsEnabled, String? token }) => Session(
    consumerId:        consumerId,
    walletId:          walletId,
    handle:            handle,
    displayName:       displayName,
    token:             token ?? this.token,
    biometricsEnabled: biometricsEnabled ?? this.biometricsEnabled,
  );
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class SessionService extends ChangeNotifier {
  static const _store = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );
  static final _bio = LocalAuthentication();

  static const _kConsumerId  = 'consumer_id';
  static const _kWalletId    = 'wallet_id';
  static const _kHandle      = 'handle';
  static const _kDisplayName = 'display_name';
  static const _kPinHash     = 'pin_hash';
  static const _kToken       = 'token';
  static const _kBioEnabled  = 'biometrics_enabled';

  Session? _session;
  bool     _locked      = true;
  bool     _initialized = false;

  Session? get session     => _session;
  bool     get isLocked    => _locked;
  bool     get hasSession  => _session != null;
  bool     get initialized => _initialized;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  Future<void> initialize() async {
    final consumerId  = await _store.read(key: _kConsumerId);
    final walletId    = await _store.read(key: _kWalletId);
    final handle      = await _store.read(key: _kHandle);
    final displayName = await _store.read(key: _kDisplayName);
    final token       = await _store.read(key: _kToken);
    final bioEnabled  = await _store.read(key: _kBioEnabled);

    if (consumerId != null && walletId != null && handle != null && token != null) {
      _session = Session(
        consumerId:        consumerId,
        walletId:          walletId,
        handle:            handle,
        displayName:       displayName,
        token:             token,
        biometricsEnabled: bioEnabled == 'true',
      );
    }
    _initialized = true;
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Registration / login
  // ---------------------------------------------------------------------------

  Future<void> createSession({
    required String consumerId,
    required String walletId,
    required String handle,
    String?         displayName,
    required String pin,
    required String token,
  }) async {
    await _store.write(key: _kConsumerId,  value: consumerId);
    await _store.write(key: _kWalletId,    value: walletId);
    await _store.write(key: _kHandle,      value: handle);
    await _store.write(key: _kPinHash,     value: _hash(pin));
    await _store.write(key: _kToken,       value: token);
    if (displayName != null) {
      await _store.write(key: _kDisplayName, value: displayName);
    }
    _session = Session(
      consumerId:  consumerId,
      walletId:    walletId,
      handle:      handle,
      displayName: displayName,
      token:       token,
    );
    _locked = false;
    notifyListeners();
  }

  /// Called after a server-side re-login (e.g. expired JWT) to refresh the
  /// stored token without requiring a full session rebuild.
  Future<void> updateToken(String token) async {
    await _store.write(key: _kToken, value: token);
    if (_session != null) {
      _session = _session!.copyWith(token: token);
      notifyListeners();
    }
  }

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  /// Verifies the PIN locally using the stored hash — used by the lock screen
  /// so the app can unlock without a network round-trip.
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
        localizedReason: 'Autentique para entrar na Banzami',
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
  // PIN hashing — SHA-256 with app-specific salt (for local lock screen)
  // ---------------------------------------------------------------------------

  static String _hash(String pin) {
    final bytes = utf8.encode('banzami:$pin:ao');
    return sha256.convert(bytes).toString();
  }
}
