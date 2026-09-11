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

    test('a late subscription is skipped once the account signed out', () async {
      final svc = await signedIn(_FakePush());
      expect(svc.isSignedInAs('c-A'), isTrue);
      await svc.logout();
      expect(svc.isSignedInAs('c-A'), isFalse);
    });
  });
}
