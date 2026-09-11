import 'package:banzami_mobile/merchant/services/merchant_notification_router.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('MerchantNotificationRouter', () {
    test('both Business push types open the history', () {
      for (final type in ['payment_received', 'payment_link_paid']) {
        expect(
          MerchantNotificationRouter.opensHistory({'type': type, 'environment': 'LIVE'}, 'LIVE'),
          isTrue,
          reason: type,
        );
      }
      expect(MerchantNotificationRouter.opensHistory({'type': 'marketing'}, 'LIVE'), isFalse);
    });

    test('environments never cross', () {
      final sandbox = {'type': 'payment_link_paid', 'environment': 'SANDBOX'};
      expect(MerchantNotificationRouter.opensHistory(sandbox, 'LIVE'), isFalse);
      expect(MerchantNotificationRouter.opensHistory(sandbox, 'SANDBOX'), isTrue);
      expect(
        MerchantNotificationRouter.opensHistory(
            {'type': 'payment_received', 'environment': 'STAGING'}, 'LIVE'),
        isFalse,
      );
    });

    test('a tap is parked until the main screen consumes it', () {
      MerchantNotificationRouter.handleTap({'type': 'payment_received', 'amount_minor': 100});
      expect(MerchantNotificationRouter.pendingTap.value, {
        'type': 'payment_received',
        'amount_minor': '100',
      });
      MerchantNotificationRouter.pendingTap.value = null;
    });
  });
}
