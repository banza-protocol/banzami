import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/merchant/screens/onboarding/setup_screen.dart';

// Source-text guards (cwd = apps/mobile when running flutter test) locking the
// Banzami Business UI unification against regression.
String _read(String p) => File(p).readAsStringSync();

const _screensDir = 'lib/merchant/screens';

void main() {
  final welcome = _read('$_screensDir/onboarding/welcome_screen.dart');
  final setup = _read('$_screensDir/onboarding/setup_screen.dart');

  group('Welcome screen is modern (mirrors consumer)', () {
    test('uses the gradient hero + BanzamiPrimaryButton, not a raw button', () {
      expect(welcome.contains('BanzamiGradients.primary'), isTrue);
      expect(welcome.contains('BanzamiPrimaryButton'), isTrue);
      // No legacy isolated raw ElevatedButton.
      expect(welcome.contains('ElevatedButton'), isFalse);
    });
    test('has the consumer-style entry animation + rounded logo', () {
      expect(welcome.contains('SingleTickerProviderStateMixin'), isTrue);
      expect(welcome.contains('FadeTransition'), isTrue);
      expect(welcome.contains('ClipRRect'), isTrue);
    });
  });

  group('Setup screen uses design-system components', () {
    test('BanzamiScaffold + BanzamiAppBar + BanzamiPrimaryButton + BanzamiErrorBanner', () {
      expect(setup.contains('BanzamiScaffold'), isTrue);
      expect(setup.contains('BanzamiAppBar'), isTrue);
      expect(setup.contains('BanzamiPrimaryButton'), isTrue);
      expect(setup.contains('BanzamiErrorBanner'), isTrue);
      expect(setup.contains('BanzamiCard'), isTrue); // help card
    });
  });

  group('No raw Material AppBar left on the pushed/tab merchant screens', () {
    const files = [
      'onboarding/setup_screen.dart',
      'charge_screen.dart',
      'payout_screen.dart',
      'qr_screen.dart',
      'kyb_screen.dart',
      'payment_requests_screen.dart',
      'pin_create_screen.dart',
    ];
    for (final f in files) {
      test('$f uses BanzamiAppBar (no raw "appBar: AppBar(")', () {
        expect(_read('$_screensDir/$f').contains('appBar: AppBar('), isFalse);
      });
    }
  });

  group('No hardcoded radius / colors / legacy markers', () {
    const radiusFiles = [
      'charge_screen.dart',
      'payout_screen.dart',
      'profile_screen.dart',
      'payment_requests_screen.dart',
      'kyb_screen.dart',
    ];
    for (final f in radiusFiles) {
      test('$f has no BorderRadius.circular() literals', () {
        expect(_read('$_screensDir/$f').contains('BorderRadius.circular('), isFalse);
      });
    }

    test('profile badge uses tokens (no hardcoded blue) + no deprecated activeColor', () {
      final profile = _read('$_screensDir/profile_screen.dart');
      expect(profile.contains('0xFF1D4ED8'), isFalse);
      expect(profile.contains('0xFFBFDBFE'), isFalse);
      expect(RegExp(r'\bactiveColor:').hasMatch(profile), isFalse);
    });

    test('no Directory.systemTemp; no [APP-LOCK] debugPrint', () {
      expect(_read('$_screensDir/qr_screen.dart').contains('Directory.systemTemp'), isFalse);
      expect(_read('$_screensDir/main_screen.dart').contains("debugPrint('[APP-LOCK]"), isFalse);
    });

    test('no bare "Banza" legacy + no .org domain across merchant screens', () {
      final bareBanza = RegExp(r'Banza(?!mi)');
      for (final f in Directory(_screensDir).listSync(recursive: true).whereType<File>()) {
        if (!f.path.endsWith('.dart')) continue;
        final src = f.readAsStringSync();
        expect(bareBanza.hasMatch(src), isFalse, reason: '${f.path} contains bare "Banza"');
        expect(src.contains('.org'), isFalse, reason: '${f.path} has a legacy .org domain');
      }
    });
  });

  group('Setup screen renders without overflow', () {
    testWidgets('renders the modern form at phone width', (t) async {
      await t.pumpWidget(MaterialApp(
        theme: BanzamiTheme.light,
        home: const MerchantSetupScreen(),
      ));
      await t.pump();
      expect(find.text('Verificar e continuar'), findsOneWidget); // BanzamiPrimaryButton
      expect(t.takeException(), isNull); // no overflow / build error
    });
  });

  group('API Key advanced mode (Credenciais de integração)', () {
    testWidgets('setup is now the integration-credentials advanced screen', (t) async {
      await t.pumpWidget(MaterialApp(
        theme: BanzamiTheme.light,
        home: const MerchantSetupScreen(),
      ));
      await t.pump();
      expect(find.text('Credenciais de integração'), findsWidgets); // appbar + heading
      // Still exactly Merchant ID + API Key (no @handle field on this screen).
      expect(find.byType(TextFormField), findsNWidgets(2));
      expect(t.takeException(), isNull);
    });

    test('API-key flow intact; the old "em breve" teaser is gone', () {
      expect(setup.contains("labelText:  'Merchant ID'"), isTrue);
      expect(setup.contains("labelText:  'API Key'"), isTrue);
      expect(setup.contains('_verify'), isTrue);
      // The placeholder teaser was replaced by the real handle login.
      expect(setup.contains('_HandleLoginTeaser'), isFalse);
      expect(setup.contains('Em breve'), isFalse);
    });
  });
}
