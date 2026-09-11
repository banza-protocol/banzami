// A6-15 — what the Banzami apps put in the keychain must not leave the phone.
//
// Items written `first_unlock` (or the plugin's default, `unlocked`) travel in
// an encrypted iCloud backup and in a device-to-device transfer: a restored
// phone came up holding the original device's session token, refresh token and
// risk identity. Everything is written `first_unlock_this_device` now, and an
// install that already holds older items is moved across once.

import 'dart:io';

import 'package:banzami_mobile/services/banzami_keychain.dart';
import 'package:banzami_mobile/services/device_identity.dart';
import 'package:banzami_mobile/services/pin_hasher.dart';
import 'package:banzami_mobile/services/session_service.dart';
import 'package:banzami_mobile/merchant/services/merchant_session_service.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// The keychain, plus a record of every write — [writes] is in order, so a
/// one-time migration is visible as a rewrite of a key that was already there.
class _Keychain {
  final Map<String, String> items = {};
  final List<String> writes = [];

  void install() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
      (call) async {
        final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
        switch (call.method) {
          case 'write':
            final k = args['key'] as String;
            writes.add(k);
            items[k] = args['value'] as String;
            return null;
          case 'read':
            // Reads ignore accessibility on iOS, so an older item is found.
            return items[args['key'] as String];
          case 'delete':
            items.remove(args['key']);
            return null;
          case 'deleteAll':
            items.clear();
            return null;
          case 'readAll':
            return Map<String, String>.from(items);
          case 'containsKey':
            return items.containsKey(args['key']);
          default:
            return null;
        }
      },
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Keychain keychain;

  setUp(() {
    keychain = _Keychain()..install();
  });

  group('the policy itself', () {
    test('every item is written ThisDeviceOnly, and encrypted on Android', () {
      expect(BanzamiKeychain.iOptions.params['accessibility'],
          'first_unlock_this_device');
      expect(BanzamiKeychain.aOptions.params['encryptedSharedPreferences'],
          'true');
      // Never synchronised to iCloud either.
      expect(BanzamiKeychain.iOptions.params['synchronizable'], 'false');
    });

    test('nothing in the app builds its own secure storage', () {
      final offenders = <String>[];
      for (final f in Directory('lib')
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))) {
        if (f.path.endsWith('services/banzami_keychain.dart')) continue;
        if (f.readAsStringSync().contains('FlutterSecureStorage(')) {
          offenders.add(f.path);
        }
      }
      expect(offenders, isEmpty,
          reason: 'use BanzamiKeychain.store — a bare constructor silently '
              'takes the plugin default (unlocked, backed up)');
    });
  });

  group('an install written by an older version', () {
    test('the consumer session moves every item, the push topic included',
        () async {
      keychain.items.addAll({
        'consumer_id': 'c1',
        'wallet_id': 'w1',
        'handle': 'ana',
        'token': 'jwt',
        'pin_hash': PinHasher.legacyHash('123456', 'banzami:{pin}:ao'),
        'push_topic': 'consumer_c1',
        // This install already ran the earlier pass, which never moved the
        // push topic: the pass has to run again.
        'keychain_this_device_v2': '1',
      });

      await SessionService().initialize();

      expect(keychain.writes, contains('push_topic'));
      expect(keychain.writes, contains('token'));
      expect(keychain.writes, contains('consumer_id'));
      expect(keychain.items['push_topic'], 'consumer_c1');
      expect(keychain.items['keychain_this_device_v3'], '1');
    });

    test('the Business session moves every item, the push topic included',
        () async {
      keychain.items.addAll({
        'merchant_id': 'm1',
        'merchant_name': 'Loja',
        'merchant_email': 'e@x',
        'merchant_wallet_id': 'w1',
        'merchant_handle': 'loja',
        'merchant_login_method': 'handle_pin',
        'merchant_push_topic': 'merchant_m1',
        'merchant_keychain_this_device_v2': '1',
      });

      await MerchantSessionService().initialize();

      expect(keychain.writes, contains('merchant_push_topic'));
      expect(keychain.items['merchant_push_topic'], 'merchant_m1');
      expect(keychain.items['merchant_keychain_this_device_v3'], '1');
    });

    test('the device id is rewritten once, and keeps its value', () async {
      keychain.items['banzami_device_id'] = 'device-from-an-old-version';

      expect(await DeviceIdentity.getOrCreate(), 'device-from-an-old-version');
      expect(keychain.writes.where((k) => k == 'banzami_device_id'), hasLength(1),
          reason: 'the rewrite is what moves it ThisDeviceOnly');

      // Second call: already moved, nothing rewritten.
      expect(await DeviceIdentity.getOrCreate(), 'device-from-an-old-version');
      expect(keychain.writes.where((k) => k == 'banzami_device_id'), hasLength(1));
    });
  });

  group('the PIN is not recoverable from the device', () {
    test('a consumer sign-in stores no PIN and no fast hash', () async {
      final svc = SessionService();
      await svc.createSession(
        consumerId: 'c1', walletId: 'w1', handle: 'ana',
        token: 'jwt', pin: '123456',
      );

      final stored = keychain.items.values.toList();
      expect(stored, isNot(contains('123456')));
      expect(keychain.items['pin_hash'], startsWith('pbkdf2-sha256\$'));
      expect(PinHasher.isLegacy(keychain.items['pin_hash']!), isFalse);
      // The old fixed-salt hash of this PIN is nowhere on the device.
      expect(stored,
          isNot(contains(PinHasher.legacyHash('123456', 'banzami:{pin}:ao'))));
    });

    test('a Business sign-in stores no PIN and no fast hash', () async {
      final svc = MerchantSessionService();
      await svc.createHandleSession(
        merchantId: 'm1', merchantName: 'Loja', merchantEmail: 'e@x',
        walletId: 'w1', jwt: 'jwt', handle: 'loja', environment: 'SANDBOX',
        pin: '123456',
        jwtExpiresAt: DateTime.now().add(const Duration(hours: 1)),
      );

      final stored = keychain.items.values.toList();
      expect(stored, isNot(contains('123456')));
      expect(keychain.items['merchant_pin_hash'], startsWith('pbkdf2-sha256\$'));
      expect(
          stored,
          isNot(contains(
              PinHasher.legacyHash('123456', 'banzami:merchant:{pin}:ao'))));
    });
  });
}
