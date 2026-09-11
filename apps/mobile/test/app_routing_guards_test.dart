import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

// Source-text guards for the consumer app shell (lib/app.dart), which needs
// Firebase and platform links to run and so is locked by reading its source.
void main() {
  final app = File('lib/app.dart').readAsStringSync();

  String body(String signature) {
    final start = app.indexOf(signature);
    expect(start, isNot(-1), reason: signature);
    final next = app.indexOf('\n  void ', start + signature.length);
    return app.substring(start, next == -1 ? app.length : next);
  }

  group('signed out: nothing of the previous account opens', () {
    test('a notification tap without a session is dropped', () {
      expect(body('void _handleNotificationTap(').contains('!svc.hasSession'), isTrue);
    });

    test('routing a parked tap re-checks the session and the lock', () {
      expect(body('void _routeToNotification(').contains('!svc.hasSession || svc.isLocked'), isTrue);
    });

    test('the client token is cleared when there is no session', () {
      expect(app.contains('client.clearToken()'), isTrue);
    });
  });

  test('a cold-start notification tap waits for the splash, like deep links', () {
    final tap = body('void _handleNotificationTap(');
    expect(tap.indexOf('if (!_splashComplete)'), greaterThan(-1));
    expect(tap.indexOf('if (!_splashComplete)'), lessThan(tap.indexOf('!svc.hasSession')),
        reason: 'parked before the session check — it has not loaded yet');
    expect(body('void _processPendingDeepLink(').contains('_routeToNotification(msg)'), isTrue);
  });

  test('banzami://pay/{slug} (Payment Session DEEP_LINK) opens the payment link', () {
    final scheme = body('void _handleBanzamiScheme(');
    expect(scheme.contains('segs.length == 1 && BanzamiQrParser.isPaymentSlug(segs[0])'), isTrue);
    expect(scheme.contains('_openPaymentLink(segs[0])'), isTrue);
  });

  test('request and @banza deep links are checked against the environment, like the scanner', () {
    final universal = body('void _handleUniversalLink(');
    final scheme = body('void _handleBanzamiScheme(');
    expect(RegExp(r'_refuseOtherEnvironment\(uri\)').allMatches(universal).length, 2);
    expect(RegExp(r'_refuseOtherEnvironment\(uri\)').allMatches(scheme).length, 2);
    expect(app.contains("uri.queryParameters['sandbox'] == '1'"), isTrue);
    expect(app.contains("uri.scheme.endsWith('-sandbox')"), isTrue);
  });

  test('a @banza link with no handle opens nothing; on a cold start it is parked, not dropped', () {
    final open = body('void _openHandlePay(');
    expect(open.contains("RegExp(r'^[A-Za-z0-9_.]{1,64}\$').hasMatch(h)"), isTrue);
    expect(open.contains('_pendingHandleUri = uri'), isTrue);
    expect(body('void _processPendingDeepLink(').contains('_pendingHandleUri'), isTrue);
  });
}
