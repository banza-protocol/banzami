import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The ONE keychain policy for everything the Banzami apps store on a device.
///
/// Every item is `first_unlock_this_device`
/// (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`): it is readable after
/// the first unlock following a boot, and it never leaves this phone — not in
/// an encrypted iCloud backup, not in a device-to-device transfer. Anything
/// written with plain `first_unlock` (or the plugin's default, `unlocked`)
/// travels with a backup, so a restored phone would come up holding another
/// device's session token, refresh token and risk identity.
///
/// On Android the equivalent is `encryptedSharedPreferences`, which puts the
/// values behind a Keystore-held key rather than in plain preferences.
///
/// Use [store] instead of constructing a [FlutterSecureStorage]; a bare
/// constructor silently takes the plugin's weaker default, which is how the
/// device id came to be backed up (A6-15). `keychain_policy_test.dart` fails
/// the build if a new one appears.
class BanzamiKeychain {
  BanzamiKeychain._();

  static const aOptions = AndroidOptions(encryptedSharedPreferences: true);

  static const iOptions =
      IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device);

  /// What versions before this policy wrote with. Reads ignore accessibility,
  /// so a legacy item is still readable; `delete`/`deleteAll` do NOT, which is
  /// why a wipe has to be repeated with these options, and why a one-time
  /// rewrite (a write re-adds the item at the new accessibility) is how an
  /// existing install is moved across.
  static const legacyIOptions =
      IOSOptions(accessibility: KeychainAccessibility.first_unlock);

  static const store = FlutterSecureStorage(
    aOptions: aOptions,
    iOptions: iOptions,
  );
}
