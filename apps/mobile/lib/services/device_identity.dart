import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

/// Stable per-install device identifier, persisted in secure storage and sent
/// as the `X-Device-Id` header so the backend risk layer can recognise a known
/// device vs a new one (RSK-001 device signal). It is an opaque random UUID —
/// not tied to any hardware identifier — and the backend only ever stores its
/// SHA-256 hash.
class DeviceIdentity {
  static const _key = 'banzami_device_id';
  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  /// Returns the persisted device id, generating and storing one on first call.
  static Future<String> getOrCreate() async {
    final existing = await _storage.read(key: _key);
    if (existing != null && existing.isNotEmpty) return existing;
    final id = const Uuid().v4();
    await _storage.write(key: _key, value: id);
    return id;
  }
}
