import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/screens/receive_hub_screen.dart';
import 'package:banzami_mobile/services/session_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

// Consumer "Receber": a DEFINED-amount receive (consumer pay link) must auto-dismiss
// into a "Pagamento recebido" confirmation once paid, and on return the Receber screen
// must NOT keep the defined amount (the QR reverts to the plain @handle address).
// Mirrors the merchant simple-charge auto-dismiss.

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

Map<String, dynamic> _link(String status) => {
      'id': 'cpl1', 'link_code': 'RCODE1', 'receiver_handle': 'fm65',
      'amount_minor': 250000, 'currency': 'AOA', 'locked': true, 'status': status,
      'created_at': _now, if (status == 'PAID') 'paid_at': _now,
      if (status == 'PAID') 'transfer_id': 'tr1',
    };

ConsumerPublicClient _client(_State st) => ConsumerPublicClient(
      baseUrl: 'https://api.test',
      httpClient: MockClient((req) async {
        final p = req.url.path;
        if (p.contains('/v1/me/activity')) {
          return http.Response(jsonEncode({'items': <dynamic>[]}), 200);
        }
        if (req.method == 'POST' && p.endsWith('/v1/consumer-pay-links')) {
          return http.Response(jsonEncode(_link('ACTIVE')), 200);
        }
        if (p.contains('/v1/consumer-pay-links/')) {
          return http.Response(jsonEncode(_link(st.paid ? 'PAID' : 'ACTIVE')), 200);
        }
        return http.Response('{}', 200);
      }),
    )..setToken('t');

Future<SessionService> _session() async {
  final svc = SessionService();
  await svc.createSession(
    consumerId: 'c1', walletId: 'w1', handle: 'fm65', pin: '123456', token: 't',
  );
  return svc;
}

Future<void> _defineAmount(WidgetTester t, _State st) async {
  t.view.physicalSize = const Size(1000, 2400);
  t.view.devicePixelRatio = 1.0;
  addTearDown(t.view.resetPhysicalSize);
  addTearDown(t.view.resetDevicePixelRatio);
  final svc = await _session();
  await t.pumpWidget(MultiProvider(
    providers: [
      Provider<ConsumerPublicClient>.value(value: _client(st)),
      ChangeNotifierProvider<SessionService>.value(value: svc),
    ],
    child: const MaterialApp(home: ReceiveHubScreen()),
  ));
  await t.pumpAndSettle();
  await t.tap(find.text('Definir montante'));
  await t.pumpAndSettle();
  await t.enterText(find.byType(TextField).first, '2500');
  await t.pumpAndSettle();
  await t.tap(find.widgetWithText(BanzamiPrimaryButton, 'Aplicar'));
  await t.pumpAndSettle();
}

void main() {
  setUp(_mockSecureStorage);

  testWidgets('defined-amount receive auto-dismisses into confirmation once paid',
      (t) async {
    final st = _State();
    await _defineAmount(t, st);

    // Amount defined: the QR carries it and "Remover montante" is offered.
    expect(find.text('Remover montante'), findsOneWidget);
    expect(find.text('Pagamento recebido'), findsNothing);

    // Payer pays → the poller sees it.
    st.paid = true;
    await t.pump(const Duration(seconds: 4));
    for (var i = 0; i < 10; i++) {
      await t.pump(const Duration(milliseconds: 200));
    }

    // Confirmation shown; the defined amount is cleared behind it.
    expect(find.text('Pagamento recebido'), findsOneWidget,
        reason: 'received-confirmation screen shown');

    // Return to Receber: the amount is gone (back to "Definir montante").
    await t.tap(find.widgetWithText(BanzamiPrimaryButton, 'Concluir'));
    await t.pumpAndSettle();
    expect(find.text('Definir montante'), findsOneWidget,
        reason: 'the paid request no longer pins an amount');
    expect(find.text('Remover montante'), findsNothing);
    await t.pumpWidget(const SizedBox());
  });

  testWidgets('while unpaid, the defined amount stays on the Receber screen',
      (t) async {
    final st = _State();
    await _defineAmount(t, st);
    expect(find.text('Remover montante'), findsOneWidget);

    for (var i = 0; i < 3; i++) {
      await t.pump(const Duration(seconds: 4));
    }
    expect(find.text('Remover montante'), findsOneWidget);
    expect(find.text('Pagamento recebido'), findsNothing);
    await t.pumpWidget(const SizedBox());
  });
}
