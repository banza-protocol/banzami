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
}
