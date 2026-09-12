import 'dart:io';

import 'package:banzami_mobile/services/push_notification_service.dart';
import 'package:flutter_test/flutter_test.dart';

/// What the device would do with FCM topics.
class _Ops implements PushTopicOps {
  final joined = <String>[];
  final left = <String>[];
  @override
  Future<void> subscribe(String topic, {bool Function()? stillWanted}) async {
    if (stillWanted != null && !stillWanted()) return;
    joined.add(topic);
  }

  @override
  Future<void> unsubscribe(String topic) async => left.add(topic);
}

/// A6-06: FCM does not authenticate topic subscribers and Banzami's Firebase
/// client configuration is public, so a topic named after an account id let
/// anyone who knew the id receive that account's payment notifications. The
/// device now joins exactly the topic the server names for the signed-in
/// session — a keyed name — and never derives one from an id.
void main() {
  const serverTopic = 'sandbox_c_60fb69fab79d6d3c7a3ac844cc4712f7';
  const consumerId = '3f0c9a52-1b2d-4e6f-8a9b-0c1d2e3f4a5b';

  test('the device joins the topic the server named, exactly', () async {
    final ops = _Ops();
    final remembered = <String>[];
    final joined = await PushNotificationService.joinServerTopic(
      fetchTopic: () async => serverTopic,
      legacyTopics: PushNotificationService.legacyConsumerTopics(consumerId),
      remember: remembered.add,
      ops: ops,
    );
    await Future<void>.delayed(Duration.zero);
    expect(joined, serverTopic);
    expect(ops.joined, [serverTopic]);
    expect(remembered, [serverTopic], reason: 'remembered before subscribing, so sign-out leaves it');
  });

  test('the legacy id-derived topics are left, never joined', () async {
    final ops = _Ops();
    await PushNotificationService.joinServerTopic(
      fetchTopic: () async => serverTopic,
      legacyTopics: PushNotificationService.legacyConsumerTopics(consumerId),
      ops: ops,
    );
    await Future<void>.delayed(Duration.zero);
    expect(ops.left, ['consumer_$consumerId', 'sandbox_consumer_$consumerId']);
    for (final t in ops.joined) {
      expect(t, isNot(contains(consumerId)));
    }
  });

  test('no topic from the server: the device joins nothing', () async {
    for (final fetch in <Future<String?> Function()>[
      () async => null,
      () async => '',
      () => Future<String?>.error(Exception('offline')),
      // A server that answered with the guessable name is not obeyed.
      () async => 'consumer_$consumerId',
    ]) {
      final ops = _Ops();
      final joined = await PushNotificationService.joinServerTopic(
        fetchTopic: fetch,
        legacyTopics: PushNotificationService.legacyConsumerTopics(consumerId),
        ops: ops,
      );
      expect(joined, isNull);
      expect(ops.joined, isEmpty);
    }
  });

  test('a session that ended before the answer joins nothing', () async {
    final ops = _Ops();
    final remembered = <String>[];
    await PushNotificationService.joinServerTopic(
      fetchTopic: () async => serverTopic,
      legacyTopics: PushNotificationService.legacyMerchantTopics('m1'),
      remember: remembered.add,
      stillWanted: () => false,
      ops: ops,
    );
    expect(ops.joined, isEmpty);
    expect(remembered, isEmpty);
  });

  test('the legacy Business topics are the pre-A6-06 gateway names', () {
    expect(PushNotificationService.legacyMerchantTopics('m1'), ['merchant_m1', 'sandbox_merchant_m1']);
  });

  test('both apps take their topic from their own session, not from an id', () {
    final consumer = File('lib/screens/main_screen.dart').readAsStringSync();
    expect(consumer, contains('fetchTopic:   client.getPushTopic'));
    final business = File('lib/merchant/screens/main_screen.dart').readAsStringSync();
    expect(business, contains('fetchTopic:   client.getMerchantPushTopic'));

    // Nothing in the app composes a topic to JOIN from an id: the only
    // id-derived names are the legacy ones, and those are only ever left.
    final push = File('lib/services/push_notification_service.dart').readAsStringSync();
    expect(push, isNot(contains('static Future<void> subscribeConsumer(')));
    expect(push, isNot(contains('static Future<void> subscribeMerchant(')));
    expect(push, isNot(contains('static Future<void> subscribeToTopic(')));
    for (final f in Directory('lib').listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart')) continue;
      final src = f.readAsStringSync();
      expect(RegExp(r"_messaging\.subscribeToTopic\(").allMatches(src).length,
          f.path.endsWith('push_notification_service.dart') ? 1 : 0,
          reason: '${f.path}: FCM subscribe only in PushNotificationService._subscribeTopic');
    }
  });
}
