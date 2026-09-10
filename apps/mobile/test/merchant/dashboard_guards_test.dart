import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

// Source-text guards (run from apps/mobile, cwd = package root). They lock the
// P0 fixes and the "no mocked data / no legacy naming" rules against regression.
String _read(String p) => File(p).readAsStringSync();

void main() {
  final dash = _read('lib/merchant/screens/dashboard_screen.dart');
  final qr = _read('lib/merchant/screens/qr_screen.dart');
  final profile = _read('lib/merchant/screens/profile_screen.dart');
  final mainScreen = _read('lib/merchant/screens/main_screen.dart');

  group('P0 security / tech-debt fixes', () {
    test('QR uses app-private storage, never world-readable systemTemp', () {
      expect(qr.contains('getTemporaryDirectory'), isTrue);
      expect(qr.contains('Directory.systemTemp'), isFalse);
    });

    test('app version is dynamic (PackageInfo), not hardcoded', () {
      expect(profile.contains('PackageInfo.fromPlatform'), isTrue);
      expect(profile.contains('Banzami Business v1.0'), isFalse);
    });

    test('verified badge uses design tokens, not hardcoded hex blue', () {
      expect(profile.contains('MerchantStatusBadge'), isTrue);
      expect(profile.contains('0xFF1D4ED8'), isFalse);
      expect(profile.contains('0xFFBFDBFE'), isFalse);
    });

    test('profile: "Empresa verificada" only from the server-verified flag; no session internals', () {
      expect(profile.contains("'Empresa verificada'"), isTrue);
      expect(profile.contains('if (session.verified)'), isTrue,
          reason: 'shown only when Banzami says the KYB is approved');
      expect(profile.contains("'Verificado'"), isFalse);
      // Account classification is not verification, and a token is not UI.
      for (final leak in const [
        'MERCHANT', 'APPLICATION', 'Sessão API', 'jwtExpiresAt', 'refreshExpiresAt',
        'sessionExpiresAt', 'refreshToken', '.jwt',
      ]) {
        expect(profile.contains(leak), isFalse, reason: leak);
      }
    });

    test('lifecycle debug logging removed from main_screen', () {
      expect(mainScreen.contains("debugPrint('[APP-LOCK]"), isFalse);
    });
  });

  group('dashboard renders real data only', () {
    test('wires the real merchant name and balance', () {
      expect(dash.contains('session.merchantName'), isTrue);
      expect(dash.contains('balance!.availableMinor'), isTrue);
    });

    test('no mocked / fake data markers', () {
      for (final marker in const ['mockdata', 'fakedata', 'dummydata', 'lorem ipsum']) {
        expect(dash.toLowerCase().contains(marker), isFalse, reason: marker);
      }
    });
  });

  group('no legacy "Banza" naming in the new merchant surfaces', () {
    const files = {
      'dashboard': 'lib/merchant/screens/dashboard_screen.dart',
      'stats': 'lib/merchant/widgets/merchant_dashboard_stats.dart',
      'kpi': 'lib/merchant/widgets/merchant_kpi_grid.dart',
      'chart': 'lib/merchant/widgets/merchant_volume_chart.dart',
      'badge': 'lib/merchant/widgets/merchant_status_badge.dart',
    };
    final bareBanza = RegExp(r'Banza(?!mi)'); // "Banza" not followed by "mi"
    for (final e in files.entries) {
      test('${e.key} uses Banzami, never bare "Banza"', () {
        expect(bareBanza.hasMatch(_read(e.value)), isFalse);
      });
    }
  });
}
