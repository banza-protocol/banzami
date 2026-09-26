import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:banzami_mobile/merchant/config.dart';
import 'package:banzami_mobile/merchant/screens/onboarding/welcome_screen.dart';
import 'package:banzami_mobile/merchant/screens/onboarding/login_screen.dart';

/// Banzami Business welcome screen — the two explicit CTAs.
///
/// NEW BUSINESS  → "Criar conta Business" → the canonical website candidatura
///                 (Business Sandbox application), opened as an external link.
/// EXISTING      → "Conectar conta existente" → the unchanged MerchantLoginScreen.
///
/// Arrival is the oracle: the create control must actually launch the canonical
/// URL, and the connect control must actually mount the login screen. Neither is
/// proven by "the tap resolved".
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // Render with the real bundled Inter font so text widths match production.
  // Without it, flutter_test's fallback font makes every glyph ~1em wide, which
  // reports overflow that never happens on a device — a false failure. Overflow
  // here therefore means a real layout problem, not a test-font artifact.
  setUpAll(() async {
    final loader = FontLoader('Inter');
    for (final f in [
      'Inter-Regular.ttf',
      'Inter-Medium.ttf',
      'Inter-SemiBold.ttf',
      'Inter-Bold.ttf',
      'Inter-ExtraBold.ttf',
    ]) {
      final file = File('assets/fonts/$f');
      if (file.existsSync()) {
        final bytes = file.readAsBytesSync();
        loader.addFont(Future.value(ByteData.view(bytes.buffer)));
      }
    }
    await loader.load();
  });

  // Capture what url_launcher is asked to open (native path: external_link_stub
  // → launchUrl → this method channel). No real browser is launched in a test.
  final launched = <String>[];
  setUp(() {
    launched.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/url_launcher'),
      (call) async {
        if (call.method == 'launchUrl' || call.method == 'launch') {
          final args = (call.arguments as Map).cast<String, dynamic>();
          launched.add(args['url'] as String);
          return true;
        }
        if (call.method == 'canLaunch') return true;
        return null;
      },
    );
  });
  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
            const MethodChannel('plugins.flutter.io/url_launcher'), null);
  });

  /// A phone-sized surface at the given text scale.
  Future<void> pumpWelcome(WidgetTester t,
      {double textScale = 1.0, Size size = const Size(390, 844)}) async {
    t.view.physicalSize = size;
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      home: MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
        child: const MerchantWelcomeScreen(),
      ),
    ));
    await t.pumpAndSettle();
  }

  Future<void> activate(WidgetTester t, String label) async {
    final handle = t.ensureSemantics();
    final node = t.getSemantics(find.bySemanticsLabel(label));
    t.binding.pipelineOwner.semanticsOwner!
        .performAction(node.id, SemanticsAction.tap);
    await t.pumpAndSettle();
    handle.dispose();
  }

  group('Welcome CTAs — visibility', () {
    testWidgets('both the create and connect actions are visible', (t) async {
      await pumpWelcome(t);
      expect(find.text('Criar conta Business'), findsOneWidget);
      expect(find.text('Conectar conta existente'), findsOneWidget);
      // No fabricated availability: the screen never implies real money.
      expect(find.textContaining('Financial Live'), findsNothing);
    });
  });

  group('Welcome CTAs — semantic activation drives the real destination', () {
    testWidgets('Criar conta Business launches the canonical candidatura URL',
        (t) async {
      await pumpWelcome(t);
      await activate(t, 'Criar conta Business');
      expect(launched, contains('https://banzami.com/candidatura'));
      expect(launched.single, AppConfig.businessApplicationUrl);
    });

    testWidgets('Conectar conta existente navigates to the login screen',
        (t) async {
      await pumpWelcome(t);
      expect(find.byType(MerchantLoginScreen), findsNothing);
      await activate(t, 'Conectar conta existente');
      // Destination reached — the existing connection flow is mounted.
      expect(find.byType(MerchantLoginScreen), findsOneWidget);
      // The connect path never launches an external URL.
      expect(launched, isEmpty);
    });
  });

  group('Welcome CTAs — 1.50x text scale (S18-style regression)', () {
    testWidgets('both controls remain visible and no layout overflows',
        (t) async {
      await pumpWelcome(t, textScale: 1.5);
      expect(t.takeException(), isNull);
      expect(find.text('Criar conta Business'), findsOneWidget);
      expect(find.text('Conectar conta existente'), findsOneWidget);
    });

    testWidgets('create still launches the canonical URL at 1.50x', (t) async {
      await pumpWelcome(t, textScale: 1.5);
      await activate(t, 'Criar conta Business');
      expect(launched, contains('https://banzami.com/candidatura'));
    });
  });

  group('Welcome CTAs — no horizontal overflow on small phones', () {
    for (final w in <double>[320, 360, 375, 390, 412, 430]) {
      testWidgets('width ${w.toInt()} lays out without overflow', (t) async {
        await pumpWelcome(t, size: Size(w, 780));
        expect(t.takeException(), isNull);
      });
    }
  });

  group('Welcome wiring — the real flow, no fake onboarding', () {
    final welcome =
        File('lib/merchant/screens/onboarding/welcome_screen.dart').readAsStringSync();
    final config = File('lib/merchant/config.dart').readAsStringSync();

    test('create opens the canonical application URL via config (not a new form)',
        () {
      expect(welcome.contains('AppConfig.businessApplicationUrl'), isTrue);
      expect(welcome.contains('openExternalUrl'), isTrue);
      expect(config.contains("/candidatura"), isTrue);
      expect(config.contains('siteBaseUrl'), isTrue);
    });

    test('no client-fabricated application reference or fake success', () {
      expect(welcome.contains('BZB'), isFalse);
      expect(welcome.toLowerCase().contains('application_id'), isFalse);
    });

    test('connect still targets the existing login (not the API-key setup)', () {
      expect(welcome.contains('MerchantLoginScreen'), isTrue);
      expect(welcome.contains('MerchantSetupScreen'), isFalse);
    });
  });
}
