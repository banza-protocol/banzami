import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:banzami_mobile/screens/notifications_screen.dart';

/// Consumer product-truth. Environment-gated copy is a compile-time policy
/// (AppConfig.isSandbox), so those assertions check the source wiring; the
/// notification-preference contract is proven by rendering the screen.
void main() {
  final welcome = File('lib/screens/onboarding/welcome_screen.dart').readAsStringSync();
  final notif = File('lib/screens/notifications_screen.dart').readAsStringSync();
  final mainS = File('lib/screens/main_screen.dart').readAsStringSync();

  group('Cash-in truth — no fabricated Multicaixa rail in the Sandbox', () {
    test('onboarding does not promise "Multicaixa Express integrado" in the Sandbox', () {
      final gate = welcome.indexOf('if (AppConfig.isSandbox)');
      final claim = welcome.indexOf('Multicaixa Express integrado');
      expect(gate, isNonNegative, reason: 'the Multicaixa bullet must be behind an env gate');
      expect(claim, isNonNegative);
      expect(claim, greaterThan(gate),
          reason: 'the real-rail claim must be the else-branch of the Sandbox gate');
      expect(welcome.contains('Dinheiro de teste para experimentar'), isTrue);
    });
  });

  group('Notifications — no fake persistent toggles', () {
    test('the screen has no interactive toggle or reset-on-reopen state', () {
      // A Switch implies a saved on/off preference; there is no such store, so
      // none must be present (nor any per-type Multicaixa toggle).
      expect(notif.contains('Switch('), isFalse);
      expect(notif.contains('onChanged'), isFalse);
      expect(notif.contains("'Multicaixa Express'"), isFalse);
    });

    testWidgets('renders informational content with no persistence-implying control', (t) async {
      await t.pumpWidget(const MaterialApp(home: NotificationsScreen()));
      await t.pumpAndSettle();
      expect(find.byType(Switch), findsNothing);
      expect(find.text('Notificações do Banzami'), findsOneWidget);
      expect(find.text('Gerir no dispositivo'), findsOneWidget);
    });

    testWidgets('reopening the screen shows the same content (no state to reset)', (t) async {
      await t.pumpWidget(const MaterialApp(home: NotificationsScreen()));
      await t.pumpAndSettle();
      expect(find.byType(Switch), findsNothing);
      // Re-mount to simulate closing and reopening: identical, nothing lost/reset.
      await t.pumpWidget(const MaterialApp(home: NotificationsScreen()));
      await t.pumpAndSettle();
      expect(find.byType(Switch), findsNothing);
      expect(find.text('Notificações do Banzami'), findsOneWidget);
    });
  });

  group('No dead CTAs on Home', () {
    test('the "Ver tudo" activity action is wired to the history tab', () {
      expect(mainS.contains('onSeeAllActivity:'), isTrue);
    });
  });
}
