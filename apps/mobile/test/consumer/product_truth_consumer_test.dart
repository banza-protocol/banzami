import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Consumer product-truth (source contract). Environment-gated copy is a
/// compile-time policy (AppConfig.isSandbox), so these assert the source wiring
/// rather than flipping a const at runtime.
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
      // The Sandbox shows a truthful capability instead.
      expect(welcome.contains('Dinheiro de teste para experimentar'), isTrue);
    });

    test('the "Multicaixa Express" notification toggle is hidden in the Sandbox', () {
      final gate = notif.indexOf('if (!AppConfig.isSandbox)');
      final toggle = notif.indexOf("'Multicaixa Express'");
      expect(gate, isNonNegative, reason: 'the Multicaixa toggle must be behind an env gate');
      expect(toggle, isNonNegative);
      expect(toggle, greaterThan(gate),
          reason: 'the Multicaixa toggle must live inside the !isSandbox gate');
    });
  });

  group('No dead CTAs on Home', () {
    test('the "Ver tudo" activity action is wired to the history tab', () {
      // The host provides the handler; the SDK hides the affordance when null,
      // so wiring it here is what turns "Ver tudo" from inert into a real action.
      expect(mainS.contains('onSeeAllActivity:'), isTrue);
    });
  });
}
