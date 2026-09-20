import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/merchant/screens/charge_screen.dart';
import 'package:banzami_mobile/merchant/services/merchant_session_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

// A SIMPLE charge's QR screen must auto-dismiss into a payment-confirmation screen
// once the payment link is paid (owner request: "esse ecrã de nova cobrança deve
// desaparecer uma vez o pagamento realizado; devemos ter um ecrã de confirmação").
// Mirrors the split-charge share auto-dismiss. The SAME screen runs on Web (dual-app
// parity), so proving it here proves both.

const _now = '2026-09-20T09:00:00Z';

class _State {
  bool paid = false;
}

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

BanzamiClient _client(_State st) => BanzamiClient(
      jwt: 't', jwtExpiresAt: DateTime.now().add(const Duration(hours: 1)),
      baseUrl: 'https://api.test', maxRetries: 0,
      httpClient: MockClient((req) async {
        final p = req.url.path;
        if (p.endsWith('/auth/token')) return http.Response('{"token":"t"}', 200);
        if (req.method == 'POST' && p.endsWith('/v1/payment-links')) {
          return http.Response(
              jsonEncode({
                'id': 'pl1', 'slug': 'SLUGPL1', 'merchant_id': 'm1', 'wallet_id': 'w1',
                'amount_minor': 25000, 'currency': 'AOA', 'status': 'ACTIVE',
                'created_at': _now, 'updated_at': _now,
              }),
              201);
        }
        // The QR screen polls this; flip st.paid to simulate the consumer paying.
        if (p == '/public/pay/SLUGPL1/status') {
          return http.Response(jsonEncode({'paid': st.paid}), 200);
        }
        return http.Response('{}', 200);
      }),
    );

Future<void> _generateCharge(WidgetTester t, _State st) async {
  t.view.physicalSize = const Size(1000, 2200);
  t.view.devicePixelRatio = 1.0;
  addTearDown(t.view.resetPhysicalSize);
  addTearDown(t.view.resetDevicePixelRatio);
  final svc = await _session();
  await t.pumpWidget(MultiProvider(
    providers: [
      Provider<BanzamiClient>.value(value: _client(st)),
      ChangeNotifierProvider<MerchantSessionService>.value(value: svc),
    ],
    child: const MaterialApp(home: ChargeScreen()),
  ));
  await t.pumpAndSettle();
  // Simples is the default tab. Enter an amount and generate.
  await t.enterText(find.byType(TextField).first, '250');
  await t.pumpAndSettle();
  await t.tap(find.widgetWithText(BanzamiPrimaryButton, 'Gerar cobrança'));
  await t.pumpAndSettle();
}

void main() {
  setUp(_mockSecureStorage);

  testWidgets('simple charge QR auto-dismisses into the confirmation once paid',
      (t) async {
    final st = _State();
    await _generateCharge(t, st);

    // QR screen is shown.
    expect(find.text('Partilhar link'), findsOneWidget);
    expect(find.text('Pagamento recebido'), findsNothing);

    // Consumer pays → the poller sees it.
    st.paid = true;
    await t.pump(const Duration(seconds: 4)); // fire the periodic poll
    for (var i = 0; i < 10; i++) {
      await t.pump(const Duration(milliseconds: 200));
    }

    // The QR screen disappeared and the confirmation screen is shown.
    expect(find.text('Partilhar link'), findsNothing,
        reason: 'the QR screen auto-dismissed');
    expect(find.text('Pagamento recebido'), findsOneWidget,
        reason: 'the payment confirmation screen is shown');
    await t.pumpWidget(const SizedBox()); // dispose (cancel the poll)
  });

  testWidgets('while unpaid, the QR screen stays (no premature confirmation)',
      (t) async {
    final st = _State();
    await _generateCharge(t, st);
    expect(find.text('Partilhar link'), findsOneWidget);

    // Several poll ticks with paid=false must NOT navigate away.
    for (var i = 0; i < 3; i++) {
      await t.pump(const Duration(seconds: 4));
    }
    expect(find.text('Partilhar link'), findsOneWidget);
    expect(find.text('Pagamento recebido'), findsNothing);
    await t.pumpWidget(const SizedBox());
  });
}
