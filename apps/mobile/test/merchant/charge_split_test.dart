import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/merchant/screens/charge_screen.dart';
import 'package:banzami_mobile/merchant/screens/split_track_screen.dart';
import 'package:banzami_mobile/merchant/services/merchant_session_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

// Native Business "Nova cobrança → Dividida" split-create flow
// (COLLECTIONS-PROTOCOL-AND-PRODUCT-001 §34/§35). The SAME screen runs on Web
// (dual-app parity), so proving it here proves it for both. The split arithmetic
// itself (452 → 226+226, remainder conservation) is covered by
// sdk/flutter/test/money_format_test.dart; this proves the SCREEN wires it to a
// FIXED_AMOUNTS Collection create with the exact per-person shares.

const _now = '2026-09-17T09:00:00Z';

Map<String, dynamic> _collection() => {
      'id': 'c1', 'merchant_id': 'm1', 'wallet_id': 'w1', 'title': null,
      'currency': 'AOA', 'total_amount_minor': 45200, 'status': 'OPEN',
      'rule': {'type': 'FIXED_AMOUNTS'}, 'environment': 'SANDBOX',
      'created_at': _now, 'updated_at': _now,
    };

Map<String, dynamic> _share(String id, int amount) => {
      'id': id, 'collection_id': 'c1', 'amount_minor': amount, 'currency': 'AOA',
      'status': 'PENDING', 'created_at': _now, 'updated_at': _now,
    };

void _mockSecureStorage() {
  final store = <String, String>{};
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(
    const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
    (call) async {
      final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
      switch (call.method) {
        case 'write':
          store[args['key'] as String] = args['value'] as String;
          return null;
        case 'read':
          return store[args['key'] as String];
        case 'delete':
          store.remove(args['key']);
          return null;
        case 'readAll':
          return Map<String, String>.from(store);
        case 'containsKey':
          return store.containsKey(args['key']);
        default:
          return null;
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

void main() {
  setUp(_mockSecureStorage);

  testWidgets('Dividida: 452 Kz / 2 → creates a FIXED_AMOUNTS Collection of 226+226',
      (t) async {
    // A tall surface so the whole form (incl. the submit button) is on-screen —
    // no scrolling that could rebuild/reset mid-flow.
    t.view.physicalSize = const Size(1000, 2200);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);

    Map<String, dynamic>? postBody;
    final seen = <String>[];
    final svc = await _session();

    await t.pumpWidget(MultiProvider(
      providers: [
        Provider<BanzamiClient>(
          create: (_) => BanzamiClient(
            jwt: 't', jwtExpiresAt: DateTime.now().add(const Duration(hours: 1)),
            baseUrl: 'https://api.test',
            maxRetries: 0,
            httpClient: MockClient((req) async {
              seen.add('${req.method} ${req.url.path}');
              if (req.url.path.endsWith('/auth/token')) {
                return http.Response('{"token":"t"}', 200);
              }
              if (req.method == 'POST' && req.url.path.endsWith('/v1/collections')) {
                postBody = jsonDecode(req.body) as Map<String, dynamic>;
                return http.Response(
                  jsonEncode({
                    'collection': _collection(),
                    'shares': [_share('s1', 22600), _share('s2', 22600)],
                  }),
                  201,
                );
              }
              // SplitTrackScreen's follow-up reads after navigation — benign.
              if (req.url.path.contains('/shares')) {
                return http.Response(jsonEncode({'data': []}), 200);
              }
              return http.Response('{}', 200);
            }),
          ),
        ),
        ChangeNotifierProvider<MerchantSessionService>.value(value: svc),
      ],
      child: const MaterialApp(home: ChargeScreen()),
    ));
    await t.pumpAndSettle();

    // Switch to the split mode.
    await t.tap(find.text('Dividida'));
    await t.pumpAndSettle();

    // Enter the total: "452" = 452,00 Kz = 45 200 minor.
    await t.enterText(find.byType(TextField).first, '452');
    await t.pumpAndSettle();

    // The preview shows two people (default) — 226,00 each.
    expect(find.text('Pessoa 1'), findsOneWidget);
    expect(find.text('Pessoa 2'), findsOneWidget);

    final btn = t.widget<BanzamiPrimaryButton>(
        find.widgetWithText(BanzamiPrimaryButton, 'Gerar cobrança dividida'));
    expect(btn.onPressed, isNotNull, reason: 'submit must be enabled once parts exist');

    // Generate the split charge.
    await t.tap(find.widgetWithText(BanzamiPrimaryButton, 'Gerar cobrança dividida'));
    for (var i = 0; i < 20 && postBody == null; i++) {
      await t.pump(const Duration(milliseconds: 50));
    }

    // The POST carried the canonical FIXED_AMOUNTS rule with the exact shares.
    expect(postBody, isNotNull, reason: 'POST /v1/collections must be sent; seen=$seen');
    expect(postBody!['total_amount_minor'], 45200);
    expect(postBody!['currency'], 'AOA');
    final rule = postBody!['rule'] as Map<String, dynamic>;
    expect(rule['type'], 'FIXED_AMOUNTS');
    final shares = (rule['shares'] as List).cast<Map<String, dynamic>>();
    expect(shares.map((s) => s['amount_minor']).toList(), [22600, 22600]);
    final sum = shares.fold<int>(0, (a, s) => a + (s['amount_minor'] as int));
    expect(sum, 45200, reason: 'INV-COLLECTION-002: shares sum == total');
    // A stable idempotency key is always attached (INV-COLLECTION-008).
    expect(postBody!['idempotency_key'], isA<String>());

    // Navigated to the share-tracking screen.
    await t.pumpAndSettle(const Duration(milliseconds: 100));
    expect(find.byType(SplitTrackScreen), findsOneWidget);

    // Dispose the tree so SplitTrackScreen's poll timer is cancelled.
    await t.pumpWidget(const SizedBox());
  });

  testWidgets('Simples stays the default; the split fields appear only in Dividida',
      (t) async {
    final svc = await _session();
    await t.pumpWidget(MultiProvider(
      providers: [
        Provider<BanzamiClient>(
          create: (_) => BanzamiClient(
            jwt: 't', jwtExpiresAt: DateTime.now().add(const Duration(hours: 1)), baseUrl: 'https://api.test', maxRetries: 0,
            httpClient: MockClient((_) async => http.Response('{}', 200)),
          ),
        ),
        ChangeNotifierProvider<MerchantSessionService>.value(value: svc),
      ],
      child: const MaterialApp(home: ChargeScreen()),
    ));
    await t.pumpAndSettle();

    // Default = Simples: no people stepper.
    expect(find.text('Número de pessoas'), findsNothing);
    expect(find.text('Gerar cobrança'), findsOneWidget);

    await t.tap(find.text('Dividida'));
    await t.pumpAndSettle();
    expect(find.text('Número de pessoas'), findsOneWidget);
    expect(find.text('Gerar cobrança dividida'), findsOneWidget);
  });
}
