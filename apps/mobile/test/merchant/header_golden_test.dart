import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import 'package:banzami_mobile/services/session_service.dart';
import 'package:banzami_mobile/screens/onboarding/login_screen.dart' as consumer;
import 'package:banzami_mobile/merchant/services/merchant_session_service.dart';
import 'package:banzami_mobile/merchant/screens/onboarding/login_screen.dart' as business;

// BUSINESS-HEADER-CONSISTENCY-001 — deterministic visual evidence.
//
// Golden baselines rendered entirely in the widget tester (no simulator, no
// device, no sudo). They prove the Business app now shares the Consumer app's
// one page-header system (AppScreenHeader + BanzamiTextStyles.pageTitle) and
// that the Business login carries a single title ("Entrar"), never the old
// duplicate "Entrar na sua conta Business". Regenerate with:
//   flutter test --update-goldens test/merchant/header_golden_test.dart
// Fonts are loaded so glyphs render as real Inter, not placeholder boxes.

const _size390 = Size(390, 844);
const _size430 = Size(430, 932);
const _topInset = 59.0; // Dynamic Island safe-area top (deterministic).

Future<void> _loadFonts() async {
  final loader = FontLoader('Inter');
  for (final f in const [
    'assets/fonts/Inter-Regular.ttf',
    'assets/fonts/Inter-Medium.ttf',
    'assets/fonts/Inter-SemiBold.ttf',
    'assets/fonts/Inter-Bold.ttf',
    'assets/fonts/Inter-ExtraBold.ttf',
  ]) {
    loader.addFont(Future.value(File(f).readAsBytesSync().buffer.asByteData()));
  }
  await loader.load();

  // Material icon glyphs (the back affordance) — loaded from the Flutter SDK so
  // the icon renders as a real chevron, not a placeholder box. Skipped gracefully
  // where the SDK path is unavailable, so the test never depends on it.
  final root = Platform.environment['FLUTTER_ROOT'];
  if (root != null) {
    final icons = File('$root/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
    if (icons.existsSync()) {
      await (FontLoader('MaterialIcons')
            ..addFont(Future.value(icons.readAsBytesSync().buffer.asByteData())))
          .load();
    }
  }
}

Future<void> _pump(
  WidgetTester t, {
  required Size size,
  required Widget home,
  double textScale = 1.0,
}) async {
  t.view.physicalSize = size;
  t.view.devicePixelRatio = 1.0;
  addTearDown(t.view.resetPhysicalSize);
  addTearDown(t.view.resetDevicePixelRatio);
  await t.pumpWidget(MaterialApp(
    debugShowCheckedModeBanner: false,
    home: home,
    builder: (ctx, child) => MediaQuery(
      data: MediaQuery.of(ctx).copyWith(
        textScaler: TextScaler.linear(textScale),
        padding: const EdgeInsets.only(top: _topInset),
        viewPadding: const EdgeInsets.only(top: _topInset),
      ),
      child: child!,
    ),
  ));
  await t.pumpAndSettle();
}

/// A real screen shell around the shared header (SafeArea + scaffold), the way
/// every migrated screen composes it.
Widget _headerShell(Widget header, {Widget? body}) => Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [header, if (body != null) Expanded(child: body)],
        ),
      ),
    );

Widget _businessLogin() => MultiProvider(
      providers: [
        ChangeNotifierProvider<MerchantSessionService>.value(value: MerchantSessionService()),
        Provider<BanzamiClient>.value(value: BanzamiClient(baseUrl: 'https://example.test')),
      ],
      child: const business.MerchantLoginScreen(),
    );

Widget _consumerLogin() => MultiProvider(
      providers: [
        ChangeNotifierProvider<SessionService>.value(value: SessionService()),
        Provider<ConsumerPublicClient>.value(value: ConsumerPublicClient(baseUrl: 'https://example.test')),
      ],
      child: const consumer.LoginScreen(),
    );

void main() {
  setUpAll(_loadFonts);

  group('AppScreenHeader — the one shared header (Consumer + Business)', () {
    testWidgets('pushed header @390', (t) async {
      await _pump(t, size: _size390, home: _headerShell(
        AppScreenHeader(title: 'Entrar', onBack: () {}),
      ));
      await expectLater(find.byType(Scaffold), matchesGoldenFile('goldens/appheader_pushed_390.png'));
    });

    testWidgets('pushed header @430', (t) async {
      await _pump(t, size: _size430, home: _headerShell(
        AppScreenHeader(title: 'Entrar', onBack: () {}),
      ));
      await expectLater(find.byType(Scaffold), matchesGoldenFile('goldens/appheader_pushed_430.png'));
    });

    testWidgets('root header + subtitle + trailing @390', (t) async {
      await _pump(t, size: _size390, home: _headerShell(
        AppScreenHeader(
          title: 'Receber',
          subtitle: 'Cobranças por link e QR',
          trailing: IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: () {}),
        ),
      ));
      await expectLater(find.byType(Scaffold), matchesGoldenFile('goldens/appheader_root_390.png'));
    });

    testWidgets('pushed header @390, large text (1.6×) — no clip/overflow', (t) async {
      await _pump(t, size: _size390, textScale: 1.6, home: _headerShell(
        AppScreenHeader(title: 'Verificação do negócio', onBack: () {}),
      ));
      expect(t.takeException(), isNull); // no overflow thrown
      await expectLater(find.byType(Scaffold), matchesGoldenFile('goldens/appheader_pushed_large_390.png'));
    });
  });

  group('Login parity — Business vs Consumer', () {
    testWidgets('Business login @390 (single "Entrar" title, no duplicate)', (t) async {
      await _pump(t, size: _size390, home: _businessLogin());
      expect(find.text('Entrar'), findsOneWidget);
      expect(find.text('Entrar na sua conta Business'), findsNothing);
      await expectLater(find.byType(business.MerchantLoginScreen), matchesGoldenFile('goldens/business_login_390.png'));
    });

    testWidgets('Business login @430', (t) async {
      await _pump(t, size: _size430, home: _businessLogin());
      await expectLater(find.byType(business.MerchantLoginScreen), matchesGoldenFile('goldens/business_login_430.png'));
    });

    testWidgets('Consumer login @390 (visual counterpart)', (t) async {
      await _pump(t, size: _size390, home: _consumerLogin());
      expect(find.text('Entrar'), findsOneWidget);
      await expectLater(find.byType(consumer.LoginScreen), matchesGoldenFile('goldens/consumer_login_390.png'));
    });

    testWidgets('Business login @390, large text (1.6×) — no overflow', (t) async {
      await _pump(t, size: _size390, textScale: 1.6, home: _businessLogin());
      expect(t.takeException(), isNull);
      await expectLater(find.byType(business.MerchantLoginScreen), matchesGoldenFile('goldens/business_login_large_390.png'));
    });
  });
}
