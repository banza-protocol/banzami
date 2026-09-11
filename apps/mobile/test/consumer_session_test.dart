import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/screens/pin_screen.dart';
import 'package:banzami_mobile/services/pin_hasher.dart';
import 'package:banzami_mobile/services/push_topic_registration.dart';
import 'package:banzami_mobile/services/session_service.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakePush implements PushTopicRegistration {
  final unsubscribed = <String>[];
  @override
  Future<void> unsubscribe(String topic) async => unsubscribed.add(topic);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final store = <String, String>{};

  setUp(() {
    store.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
      (call) async {
        final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
        switch (call.method) {
          case 'write':
            store[args['key'] as String] = args['value'] as String;
            return null;
          case 'read':
            return store[args['key'] as String];
          case 'delete':
            store.remove(args['key']);
            return null;
          case 'deleteAll':
            store.clear();
            return null;
          case 'readAll':
            return Map<String, String>.from(store);
          case 'containsKey':
            return store.containsKey(args['key']);
          default:
            return null;
        }
      },
    );
  });

  Future<SessionService> signedIn(_FakePush push) async {
    final svc = SessionService(push: push);
    await svc.createSession(
      consumerId: 'c-A', walletId: 'w', handle: 'ana', pin: '123456', token: 'a.b.c',
    );
    return svc;
  }

  group('sign-out takes the device off the account\'s notifications', () {
    test('logout unsubscribes consumer_<id> and sandbox_consumer_<id>', () async {
      final push = _FakePush();
      final svc = await signedIn(push);
      await svc.logout();
      expect(push.unsubscribed, containsAll(['consumer_c-A', 'sandbox_consumer_c-A']));
      expect(svc.hasSession, isFalse);
      expect(store, isEmpty);
    });

    test('"Remover conta" does the same', () async {
      final push = _FakePush();
      final svc = await signedIn(push);
      await svc.clearAccount();
      expect(push.unsubscribed, containsAll(['consumer_c-A', 'sandbox_consumer_c-A']));
    });

    // A6-06: the topic the server named for the session is left too.
    test('logout leaves the topic the server named, even after a restart', () async {
      final push = _FakePush();
      final svc = await signedIn(push);
      await svc.rememberPushTopic('c-A', 'c_60fb69fab79d6d3c7a3ac844cc4712f7');
      expect(store['push_topic'], 'c_60fb69fab79d6d3c7a3ac844cc4712f7');

      final restarted = SessionService(push: push);
      await restarted.initialize();
      await restarted.logout();
      expect(push.unsubscribed,
          ['consumer_c-A', 'sandbox_consumer_c-A', 'c_60fb69fab79d6d3c7a3ac844cc4712f7']);
      expect(store, isEmpty);
    });

    test('a topic named for another account is not recorded', () async {
      final svc = await signedIn(_FakePush());
      await svc.rememberPushTopic('c-B', 'c_other');
      expect(store.containsKey('push_topic'), isFalse);
    });

    test('a late subscription is skipped once the account signed out', () async {
      final svc = await signedIn(_FakePush());
      expect(svc.isSignedInAs('c-A'), isTrue);
      await svc.logout();
      expect(svc.isSignedInAs('c-A'), isFalse);
    });
  });

  group('a refused token is not a refused account', () {
    test('expireToken drops the token, keeps the account, and locks', () async {
      final push = _FakePush();
      final svc = await signedIn(push);
      await svc.expireToken();
      expect(svc.hasSession, isTrue);
      expect(svc.isLocked, isTrue);
      expect(svc.isTokenExpired, isTrue, reason: 'biometrics cannot stand in: the PIN signs in');
      expect(store.containsKey('token'), isFalse);
      expect(store['handle'], 'ana');
      expect(push.unsubscribed, isEmpty, reason: 'still this account on this phone');

      // A restart opens the same account, locked, for the PIN.
      final again = SessionService(push: push);
      await again.initialize();
      expect(again.hasSession, isTrue);
      expect(again.isLocked, isTrue);
      expect(again.session!.handle, 'ana');
    });
  });

  group('consumerUnlockDecision — a PIN that matched on this device', () {
    BanzamiApiException api(int s) => BanzamiApiException(statusCode: s, code: 'X', message: 'x');

    test('signed in again → unlock', () {
      expect(consumerUnlockDecision(loginError: null, tokenExpired: true), ConsumerUnlock.unlock);
    });
    test('a definitive 401 ends the session', () {
      expect(consumerUnlockDecision(loginError: api(401), tokenExpired: false), ConsumerUnlock.signOut);
    });
    test('a lockout keeps the PIN screen', () {
      expect(consumerUnlockDecision(loginError: api(429), tokenExpired: false), ConsumerUnlock.stayLocked);
    });
    test('an outage opens only a still-valid session, flagged as degraded', () {
      for (final e in <Object>[api(503), const BanzamiNetworkException('down')]) {
        expect(consumerUnlockDecision(loginError: e, tokenExpired: false), ConsumerUnlock.unlockDegraded);
        expect(consumerUnlockDecision(loginError: e, tokenExpired: true), ConsumerUnlock.stayLocked);
      }
    });
  });

  group('the device PIN hash', () {
    test('is stored slow and salted, never the old fixed-salt SHA-256', () async {
      await signedIn(_FakePush());
      expect(store['pin_hash'], startsWith('pbkdf2-sha256\$'));
    });

    test('an old install still unlocks and its hash is upgraded on the right PIN', () async {
      store
        ..['consumer_id'] = 'c-A'
        ..['wallet_id'] = 'w'
        ..['handle'] = 'ana'
        ..['token'] = 'a.b.c'
        ..['pin_hash'] = PinHasher.legacyHash('123456', 'banzami:{pin}:ao');
      final svc = SessionService(push: _FakePush());
      await svc.initialize();
      expect(svc.hasSession, isTrue, reason: 'the keychain migration keeps the account');
      expect(await svc.verifyPin('000000'), isFalse);
      expect(PinHasher.isLegacy(store['pin_hash']!), isTrue);
      expect(await svc.verifyPin('123456'), isTrue);
      expect(store['pin_hash'], startsWith('pbkdf2-sha256\$'));
      expect(await svc.verifyPin('123456'), isTrue);
    });
  });
}
