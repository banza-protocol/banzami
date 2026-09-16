import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

// Source-text guards (cwd = apps/mobile when running flutter test) locking the
// Banzami Business UI unification against regression.
String _read(String p) => File(p).readAsStringSync();

const _screensDir = 'lib/merchant/screens';

void main() {
  final welcome = _read('$_screensDir/onboarding/welcome_screen.dart');

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

  // BUSINESS-HEADER-CONSISTENCY-001: one canonical page-header system across the
  // whole product — AppScreenHeader + BanzamiTextStyles.pageTitle. The Business
  // app must not carry a second header system (the retired BanzamiAppBar) or a
  // raw Material AppBar, and every primary/pushed screen carries the shared header.
  group('One canonical header system (AppScreenHeader) on Business screens', () {
    // Primary + pushed screens that must render the shared header.
    const headerScreens = [
      'charge_screen.dart',
      'payout_screen.dart',
      'qr_screen.dart',
      'kyb_screen.dart',
      'history_screen.dart',
      'profile_screen.dart',
      'campaign_accounts_screen.dart',
      'project_link_screen.dart',
      'split_track_screen.dart',
      'onboarding/login_screen.dart',
    ];
    for (final f in headerScreens) {
      test('$f uses AppScreenHeader, no BanzamiAppBar, no raw AppBar', () {
        final src = _read('$_screensDir/$f');
        expect(src.contains('AppScreenHeader'), isTrue, reason: '$f must use the shared AppScreenHeader');
        expect(src.contains('BanzamiAppBar'), isFalse, reason: '$f must not use the retired BanzamiAppBar');
        expect(src.contains('appBar: AppBar('), isFalse, reason: '$f must not use a raw Material AppBar');
      });
    }

    test('the retired BanzamiAppBar no longer appears anywhere under lib/merchant', () {
      final hits = Directory('lib/merchant')
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart') && _read(f.path).contains('BanzamiAppBar'))
          .map((f) => f.path)
          .toList();
      expect(hits, isEmpty, reason: 'BanzamiAppBar is retired: $hits');
    });

    test('login has no duplicate body page-title (only "Entrar" in the header)', () {
      final login = _read('$_screensDir/onboarding/login_screen.dart');
      expect(login.contains('Entrar na sua conta Business'), isFalse);
      // The page title lives in the header, never inlined as a display/heading title.
      expect(login.contains('displayMd'), isFalse);
    });
  });

  group('No hardcoded radius / colors / legacy markers', () {
    const radiusFiles = [
      'charge_screen.dart',
      'payout_screen.dart',
      'profile_screen.dart',
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

  group('no secret API key in the Business App', () {
    test('the "credenciais de integração" setup is gone; @banza + PIN is the only way in', () {
      expect(File('$_screensDir/onboarding/setup_screen.dart').existsSync(), isFalse);
      expect(File('$_screensDir/pin_create_screen.dart').existsSync(), isFalse);
      final login = _read('$_screensDir/onboarding/login_screen.dart');
      expect(login.contains('credenciais de integração'), isFalse);
      expect(login.contains('MerchantSetupScreen'), isFalse);
      for (final f in Directory('lib/merchant').listSync(recursive: true).whereType<File>()) {
        final src = f.readAsStringSync();
        expect(src.contains("'bz_live_"), isFalse, reason: f.path);
        expect(RegExp(r'apiKey:\s*s\?\.apiKey').hasMatch(src), isFalse, reason: f.path);
      }
    });
  });
}
