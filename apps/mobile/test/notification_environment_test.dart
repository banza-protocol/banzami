import 'package:banzami_mobile/services/notification_router.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('a Live push says LIVE (the canonical wire value) — accepted by a Live build', () {
    expect(notificationIsForThisEnvironment('LIVE', appIsSandbox: false), isTrue);
    expect(notificationIsForThisEnvironment('live', appIsSandbox: false), isTrue);
    expect(notificationIsForThisEnvironment('PRODUCTION', appIsSandbox: false), isTrue);
  });

  test('environments never cross; unknown values open nothing', () {
    expect(notificationIsForThisEnvironment('SANDBOX', appIsSandbox: false), isFalse);
    expect(notificationIsForThisEnvironment('LIVE', appIsSandbox: true), isFalse);
    expect(notificationIsForThisEnvironment('SANDBOX', appIsSandbox: true), isTrue);
    expect(notificationIsForThisEnvironment('STAGING', appIsSandbox: false), isFalse);
    expect(notificationIsForThisEnvironment('STAGING', appIsSandbox: true), isFalse);
  });
}
