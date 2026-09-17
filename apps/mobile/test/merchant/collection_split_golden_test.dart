import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import 'package:banzami_mobile/merchant/screens/charge_screen.dart';
import 'package:banzami_mobile/merchant/screens/split_track_screen.dart';
import 'package:banzami_mobile/merchant/services/merchant_session_service.dart';

// COLLECTIONS-PROTOCOL-AND-PRODUCT-001 §5/§6 — deterministic native goldens for the
// Business "Cobrança dividida" flow. Rendered entirely in the widget tester (no
// device, no sudo). Regenerate with:
//   flutter test --update-goldens test/merchant/collection_split_golden_test.dart
// The exact reported case (452 Kz / 2 → 226 + 226) is a permanent visual regression.

const _size390 = Size(390, 1200); // tall so the whole split form is captured
const _topInset = 59.0;
const _now = '2026-09-17T09:00:00Z';

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
  // Money amounts use BanzamiTextStyles.moneyFontFamily = 'JetBrains Mono' on
  // native (Inter on Web). It is not bundled, so register the family with Inter
  // glyphs — the readable digits Web actually shows — otherwise the amounts render
  // as tofu boxes and the golden would silently hide the 226+226 values.
  final money = FontLoader('JetBrains Mono');
  for (final f in const ['assets/fonts/Inter-Regular.ttf', 'assets/fonts/Inter-SemiBold.ttf', 'assets/fonts/Inter-Bold.ttf']) {
    money.addFont(Future.value(File(f).readAsBytesSync().buffer.asByteData()));
  }
  await money.load();
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

void _mockSecureStorage() {
  final store = <String, String>{};
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(
    const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
    (call) async {
      final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
      switch (call.method) {
        case 'write': store[args['key'] as String] = args['value'] as String; return null;
        case 'read': return store[args['key'] as String];
        case 'delete': store.remove(args['key']); return null;
        case 'readAll': return Map<String, String>.from(store);
        case 'containsKey': return store.containsKey(args['key']);
        default: return null;
      }
    },
  );
}

Future<MerchantSessionService> _session() async {
  final svc = MerchantSessionService();
  await svc.createHandleSession(
    merchantId: 'm1', merchantName: 'Loja', merchantEmail: 'e@x',
    walletId: 'w1', jwt: 't', handle: 'loja', environment: 'SANDBOX',
    pin: '123456', verified: true,
    jwtExpiresAt: DateTime.now().add(const Duration(hours: 1)),
  );
  return svc;
}

BanzamiClient _client(MockClient mc) => BanzamiClient(
      jwt: 't', jwtExpiresAt: DateTime.now().add(const Duration(hours: 1)),
      baseUrl: 'https://api.test', maxRetries: 0, httpClient: mc,
    );

Future<void> _pump(WidgetTester t, Widget home) async {
  t.view.physicalSize = _size390;
  t.view.devicePixelRatio = 1.0;
  addTearDown(t.view.resetPhysicalSize);
  addTearDown(t.view.resetDevicePixelRatio);
  await t.pumpWidget(MaterialApp(
    debugShowCheckedModeBanner: false,
    // Match the real app: Inter is the default family. MoneyAmount sets no
    // fontFamily of its own, so it inherits this — without it the tester falls back
    // to the box font and the amounts render as tofu.
    theme: ThemeData(useMaterial3: true, fontFamily: 'Inter'),
    home: home,
    builder: (ctx, child) => MediaQuery(
      data: MediaQuery.of(ctx).copyWith(
        padding: const EdgeInsets.only(top: _topInset),
        viewPadding: const EdgeInsets.only(top: _topInset),
      ),
      child: child!,
    ),
  ));
  await t.pumpAndSettle();
}

Widget _charge(MockClient mc, MerchantSessionService svc) => MultiProvider(
      providers: [
        Provider<BanzamiClient>.value(value: _client(mc)),
        ChangeNotifierProvider<MerchantSessionService>.value(value: svc),
      ],
      child: const ChargeScreen(),
    );

Map<String, dynamic> _collection(String status) => {
      'id': 'c1', 'merchant_id': 'm1', 'wallet_id': 'w1', 'title': 'Jantar',
      'currency': 'AOA', 'total_amount_minor': 500000, 'status': status,
      'rule': {'type': 'FIXED_AMOUNTS'}, 'environment': 'SANDBOX',
      'collected_amount_minor': status == 'COMPLETED' ? 500000 : 166666,
      'remaining_amount_minor': status == 'COMPLETED' ? 0 : 333334,
      'created_at': _now, 'updated_at': _now,
    };
Map<String, dynamic> _share(String id, int amount, String status) => {
      'id': id, 'collection_id': 'c1', 'merchant_id': 'm1', 'amount_minor': amount,
      'currency': 'AOA', 'status': status, 'created_at': _now, 'updated_at': _now,
      if (status != 'PENDING') 'payment_intent_id': 'pi-$id',
    };

MockClient _trackMock(String collStatus, List<Map<String, dynamic>> shares) =>
    MockClient((req) async {
      final p = req.url.path;
      if (p.endsWith('/auth/token')) return http.Response('{"token":"t"}', 200);
      if (p.contains('/shares')) return http.Response(jsonEncode({'data': shares}), 200);
      if (p.contains('/collections/c1')) {
        final paid = shares.where((s) => s['status'] == 'PAID').fold<int>(0, (a, s) => a + (s['amount_minor'] as int));
        final total = shares.fold<int>(0, (a, s) => a + (s['amount_minor'] as int));
        return http.Response(jsonEncode({
          'collection': _collection(collStatus),
          'collected_amount_minor': paid,
          'remaining_amount_minor': total - paid,
        }), 200);
      }
      return http.Response('{}', 200);
    });

void main() {
  setUpAll(_loadFonts);
  setUp(_mockSecureStorage);

  group('Cobrança dividida — form goldens', () {
    testWidgets('Dividida initial (no amount)', (t) async {
      final svc = await _session();
      await _pump(t, _charge(MockClient((_) async => http.Response('{}', 200)), svc));
      await t.tap(find.text('Dividida'));
      await t.pumpAndSettle();
      await expectLater(find.byType(ChargeScreen),
          matchesGoldenFile('goldens/collection_split_initial_390.png'));
    });

    testWidgets('Dividida 452 Kz / 2 → 226 + 226 (reported case)', (t) async {
      final svc = await _session();
      await _pump(t, _charge(MockClient((_) async => http.Response('{}', 200)), svc));
      await t.tap(find.text('Dividida'));
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextField).first, '452');
      await t.pumpAndSettle();
      expect(find.text('Pessoa 1'), findsOneWidget);
      expect(find.text('Pessoa 2'), findsOneWidget);
      await expectLater(find.byType(ChargeScreen),
          matchesGoldenFile('goldens/collection_split_452_2_390.png'));
    });

    testWidgets('Dividida 453 Kz / 2 → remainder distributed', (t) async {
      final svc = await _session();
      await _pump(t, _charge(MockClient((_) async => http.Response('{}', 200)), svc));
      await t.tap(find.text('Dividida'));
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextField).first, '453');
      await t.pumpAndSettle();
      await expectLater(find.byType(ChargeScreen),
          matchesGoldenFile('goldens/collection_split_453_2_390.png'));
    });

    testWidgets('Dividida create error', (t) async {
      final svc = await _session();
      final mc = MockClient((req) async {
        if (req.url.path.endsWith('/auth/token')) return http.Response('{"token":"t"}', 200);
        if (req.method == 'POST' && req.url.path.endsWith('/v1/collections')) {
          return http.Response('{"code":"INTERNAL"}', 500);
        }
        return http.Response('{}', 200);
      });
      await _pump(t, _charge(mc, svc));
      await t.tap(find.text('Dividida'));
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextField).first, '452');
      await t.pumpAndSettle();
      await t.tap(find.widgetWithText(BanzamiPrimaryButton, 'Gerar cobrança dividida'));
      for (var i = 0; i < 12; i++) { await t.pump(const Duration(milliseconds: 60)); }
      await expectLater(find.byType(ChargeScreen),
          matchesGoldenFile('goldens/collection_split_error_390.png'));
    });
  });

  group('Cobrança dividida — tracking goldens', () {
    testWidgets('partial (1 of 2 paid)', (t) async {
      await _pump(t, MultiProvider(
        providers: [
          Provider<BanzamiClient>.value(value: _client(_trackMock('PARTIALLY_COMPLETED', [
            _share('s1', 166666, 'PAID'),
            _share('s2', 166667, 'PENDING'),
            _share('s3', 166667, 'PENDING'),
          ]))),
        ],
        child: const SplitTrackScreen(collectionId: 'c1'),
      ));
      await t.pump(const Duration(milliseconds: 600));
      await expectLater(find.byType(SplitTrackScreen),
          matchesGoldenFile('goldens/collection_split_partial_390.png'));
      await t.pumpWidget(const SizedBox());
    });

    testWidgets('completed (all paid)', (t) async {
      await _pump(t, MultiProvider(
        providers: [
          Provider<BanzamiClient>.value(value: _client(_trackMock('COMPLETED', [
            _share('s1', 166666, 'PAID'),
            _share('s2', 166667, 'PAID'),
            _share('s3', 166667, 'PAID'),
          ]))),
        ],
        child: const SplitTrackScreen(collectionId: 'c1'),
      ));
      await t.pump(const Duration(milliseconds: 600));
      await expectLater(find.byType(SplitTrackScreen),
          matchesGoldenFile('goldens/collection_split_completed_390.png'));
      await t.pumpWidget(const SizedBox());
    });
  });
}
