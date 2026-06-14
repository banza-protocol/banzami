import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

// ---------------------------------------------------------------------------
// Session model
// ---------------------------------------------------------------------------

/// Admin-assigned verification badge type.
/// Matches the `verification_badge` field returned by the core API.
enum VerificationBadgeType {
  consumer, // gold — verified individual
  merchant, // blue — verified business / merchant account
}

VerificationBadgeType? _parseBadge(String? raw) {
  switch (raw) {
    case 'CONSUMER': return VerificationBadgeType.consumer;
    case 'MERCHANT': return VerificationBadgeType.merchant;
    default:         return null;
  }
}

String? _badgeToString(VerificationBadgeType? badge) {
  switch (badge) {
    case VerificationBadgeType.consumer: return 'CONSUMER';
    case VerificationBadgeType.merchant: return 'MERCHANT';
    case null:                           return null;
  }
}

class Session {
  final String               consumerId;
  final String               walletId;
  final String               handle;
  final String?              displayName;
  final String               token;
  final bool                 biometricsEnabled;
  final VerificationBadgeType? verificationBadge;

  const Session({
    required this.consumerId,
    required this.walletId,
    required this.handle,
    this.displayName,
    required this.token,
    this.biometricsEnabled  = false,
    this.verificationBadge,
  });

  Session copyWith({
    bool?                  biometricsEnabled,
    String?                token,
    VerificationBadgeType? verificationBadge,
    bool                   clearBadge = false,
  }) => Session(
    consumerId:        consumerId,
    walletId:          walletId,
    handle:            handle,
    displayName:       displayName,
    token:             token ?? this.token,
    biometricsEnabled: biometricsEnabled ?? this.biometricsEnabled,
    verificationBadge: clearBadge ? null : (verificationBadge ?? this.verificationBadge),
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

  static const _kConsumerId         = 'consumer_id';
  static const _kWalletId           = 'wallet_id';
  static const _kHandle             = 'handle';
  static const _kDisplayName        = 'display_name';
  static const _kPinHash            = 'pin_hash';
  static const _kToken              = 'token';
  static const _kBioEnabled         = 'biometrics_enabled';
  static const _kVerificationBadge  = 'verification_badge';

  Session? _session;
  bool     _locked      = true;
  bool     _initialized = false;

  Session? get session     => _session;
  bool     get isLocked    => _locked;
  bool     get hasSession  => _session != null;
  bool     get initialized => _initialized;

  /// True when the stored JWT has passed its exp claim.
  /// Used to skip biometric unlock and force PIN re-entry (which refreshes the token).
  bool get isTokenExpired {
    final token = _session?.token;
    if (token == null) return true;
    try {
      final parts = token.split('.');
      if (parts.length != 3) return true;
      final padded  = base64Url.normalize(parts[1]);
      final payload = utf8.decode(base64Url.decode(padded));
      final exp     = (jsonDecode(payload) as Map<String, dynamic>)['exp'] as int?;
      if (exp == null) return false;
      return DateTime.now().millisecondsSinceEpoch ~/ 1000 >= exp;
    } catch (_) {
      return true;
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  Future<void> initialize() async {
    try {
      await _loadFromKeychain().timeout(const Duration(seconds: 8));
    } catch (e) {
      debugPrint('SessionService.initialize: $e');
    }
    _initialized = true;
    notifyListeners();
  }

  Future<void> _loadFromKeychain() async {
    final consumerId  = await _store.read(key: _kConsumerId);
    final walletId    = await _store.read(key: _kWalletId);
    final handle      = await _store.read(key: _kHandle);
    final displayName = await _store.read(key: _kDisplayName);
    final token       = await _store.read(key: _kToken);
    final bioEnabled  = await _store.read(key: _kBioEnabled);
    final badgeRaw    = await _store.read(key: _kVerificationBadge);

    if (consumerId != null && walletId != null && handle != null && token != null) {
      _session = Session(
        consumerId:        consumerId,
        walletId:          walletId,
        handle:            handle,
        displayName:       displayName,
        token:             token,
        biometricsEnabled: bioEnabled == 'true',
        verificationBadge: _parseBadge(badgeRaw),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Registration / login
  // ---------------------------------------------------------------------------

  Future<void> createSession({
    required String consumerId,
    required String walletId,
    required String handle,
    String?                displayName,
    required String        pin,
    required String        token,
    VerificationBadgeType? verificationBadge,
  }) async {
    await _store.write(key: _kConsumerId,  value: consumerId);
    await _store.write(key: _kWalletId,    value: walletId);
    await _store.write(key: _kHandle,      value: handle);
    await _store.write(key: _kPinHash,     value: _hash(pin));
    await _store.write(key: _kToken,       value: token);
    if (displayName != null) {
      await _store.write(key: _kDisplayName, value: displayName);
    }
    final badgeStr = _badgeToString(verificationBadge);
    if (badgeStr != null) {
      await _store.write(key: _kVerificationBadge, value: badgeStr);
    }
    _session = Session(
      consumerId:        consumerId,
      walletId:          walletId,
      handle:            handle,
      displayName:       displayName,
      token:             token,
      verificationBadge: verificationBadge,
    );
    _locked = false;
    notifyListeners();
  }

  /// Called when the app refreshes the consumer profile from the server,
  /// so the badge stays current without requiring a full re-login.
  Future<void> updateVerificationBadge(VerificationBadgeType? badge) async {
    final badgeStr = _badgeToString(badge);
    if (badgeStr != null) {
      await _store.write(key: _kVerificationBadge, value: badgeStr);
    } else {
      await _store.delete(key: _kVerificationBadge);
    }
    if (_session != null) {
      _session = badge != null
          ? _session!.copyWith(verificationBadge: badge)
          : _session!.copyWith(clearBadge: true);
      notifyListeners();
    }
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
        localizedReason: 'Autentique para entrar no Banzami',
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

  /// Clears all stored credentials and returns to the welcome screen.
  Future<void> logout() async {
    await _store.deleteAll();
    _session = null;
    _locked  = true;
    notifyListeners();
  }

  /// Alias for logout — kept for the "Remover conta" flow in the profile screen.
  Future<void> clearAccount() => logout();

  // ---------------------------------------------------------------------------
  // PIN hashing — SHA-256 with app-specific salt (for local lock screen)
  // ---------------------------------------------------------------------------

  static String _hash(String pin) {
    final bytes = utf8.encode('banzami:$pin:ao');
    return sha256.convert(bytes).toString();
  }
}
