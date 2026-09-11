import 'package:uuid/uuid.dart';

import 'banzami_keychain.dart';

/// Stable per-install device identifier, persisted in secure storage and sent
/// as the `X-Device-Id` header so the backend risk layer can recognise a known
/// device vs a new one (RSK-001 device signal). It is an opaque random UUID —
/// not tied to any hardware identifier — and the backend only ever stores its
/// SHA-256 hash.
///
/// It is stored ThisDeviceOnly ([BanzamiKeychain]) because it is a statement
/// about THIS phone. Written with the plugin's default accessibility it
/// travelled in an encrypted backup, so a restored or transferred phone
/// presented the original device's id and the risk layer saw a known device
/// where it should have seen a new one (A6-15).
class DeviceIdentity {
  static const _key = 'banzami_device_id';

  /// Set once an existing install's id has been rewritten ThisDeviceOnly.
  static const _kMigrated = 'banzami_device_id_this_device_v1';

  /// Returns the persisted device id, generating and storing one on first call.
  static Future<String> getOrCreate() async {
    final existing = await BanzamiKeychain.store.read(key: _key);
    if (existing != null && existing.isNotEmpty) {
      await _moveThisDeviceOnce(existing);
      return existing;
    }
    final id = const Uuid().v4();
    await BanzamiKeychain.store.write(key: _key, value: id);
    await BanzamiKeychain.store.write(key: _kMigrated, value: '1');
    return id;
  }

  /// An id written by an older version carries the plugin's default
  /// accessibility. Writing it back re-adds the item ThisDeviceOnly (the
  /// plugin deletes the entry at every accessibility, then adds it at the
  /// configured one), so the device keeps its id and stops backing it up.
  static Future<void> _moveThisDeviceOnce(String id) async {
    if (await BanzamiKeychain.store.read(key: _kMigrated) != null) return;
    await BanzamiKeychain.store.write(key: _key, value: id);
    await BanzamiKeychain.store.write(key: _kMigrated, value: '1');
  }
}
