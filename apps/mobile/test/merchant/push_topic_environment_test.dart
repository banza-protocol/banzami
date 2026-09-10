import 'dart:io';

import 'package:banzami_mobile/services/push_notification_service.dart';
import 'package:flutter_test/flutter_test.dart';

/// A Business's payment notifications follow the environment it signed in
/// to, as the gateway named it in the token — never the build's setting.
void main() {
  test('a Sandbox session subscribes to the Sandbox topic', () {
    expect(PushNotificationService.merchantTopicForSession('m1', 'SANDBOX'), 'sandbox_merchant_m1');
  });

  test('a Live session subscribes to the Live topic', () {
    expect(PushNotificationService.merchantTopicForSession('m1', 'LIVE'), 'merchant_m1');
  });

  test('an environment that is not LIVE never lands on a Live topic', () {
    for (final env in ['', 'sandbox', 'PRODUCTION?', 'unknown']) {
      expect(PushNotificationService.merchantTopicForSession('m1', env), 'sandbox_merchant_m1', reason: env);
    }
  });

  test('the Business App subscribes with the session environment, not AppConfig', () {
    final push = File('lib/services/push_notification_service.dart').readAsStringSync();
    final start = push.indexOf('static Future<void> subscribeMerchant(');
    final body = push.substring(start, push.indexOf('\n  }', start));
    expect(body, contains('required String environment'));
    expect(body, isNot(contains('AppConfig')));
    final main = File('lib/merchant/screens/main_screen.dart').readAsStringSync();
    expect(main, contains('svc.session!.environment'));
    expect(main, contains('environment: environment'));
  });
}
