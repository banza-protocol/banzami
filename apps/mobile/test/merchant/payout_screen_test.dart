import 'dart:async';
import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/merchant/screens/payout_screen.dart';
import 'package:banzami_mobile/merchant/services/merchant_session_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

final _jwt = jsonEncode({
  'token': 't',
  'expires_at': DateTime.now().add(const Duration(hours: 1)).toIso8601String(),
});

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

Future<void> _open(WidgetTester t, MerchantSessionService svc,
    Future<http.Response> Function(http.Request) payouts) async {
  await t.pumpWidget(MultiProvider(
    providers: [
      Provider<BanzamiClient>(
        create: (_) => BanzamiClient(
          apiKey: 'bz_test_key',
          baseUrl: 'https://api.test',
          maxRetries: 0,
          httpClient: MockClient((req) async {
            if (req.url.path.endsWith('/auth/token')) {
              return http.Response(_jwt, 200);
            }
            return payouts(req);
          }),
        ),
      ),
      ChangeNotifierProvider<MerchantSessionService>.value(value: svc),
    ],
    child: const MaterialApp(home: PayoutScreen()),
  ));
  await t.pumpAndSettle();
}

Future<void> _fill(WidgetTester t, String amount) async {
  final fields = find.byType(TextField);
  await t.enterText(fields.at(0), amount); // valor
  await t.enterText(fields.at(1), 'AO06000600000000000000000'); // IBAN
  await t.enterText(fields.at(2), 'Loja Lda'); // titular
  await t.pumpAndSettle();
}

Future<void> _submitAndConfirm(WidgetTester t) async {
  await t.ensureVisible(find.widgetWithText(BanzamiPrimaryButton, 'Pedir levantamento'));
  await t.tap(find.widgetWithText(BanzamiPrimaryButton, 'Pedir levantamento'));
  await t.pumpAndSettle();
  await t.tap(find.text('Confirmar'));
  await t.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(_mockSecureStorage);

  testWidgets('"50 000" is 50 000 Kz, and the fee and net are said before asking',
      (t) async {
    final svc = await _session();
    int? sentAmount;
    await _open(t, svc, (req) async {
      sentAmount = (jsonDecode(req.body) as Map)['amount_minor'] as int;
      return http.Response('{"code":"INTERNAL_ERROR","message":"x"}', 500);
    });

    await _fill(t, '50 000');
    // 0,75% of 50 000 Kz = 375 Kz (floor), net 49 625 Kz.
    expect(find.text('Valor pedido'), findsOneWidget);
    expect(find.text('50 000 Kz'), findsWidgets);
    expect(find.text('375 Kz'), findsOneWidget);
    expect(find.text('Recebe na conta'), findsOneWidget);
    expect(find.text('49 625 Kz'), findsOneWidget);

    await t.ensureVisible(find.widgetWithText(BanzamiPrimaryButton, 'Pedir levantamento'));
    await t.tap(find.widgetWithText(BanzamiPrimaryButton, 'Pedir levantamento'));
    await t.pumpAndSettle();
    expect(find.textContaining('Recebe na conta: 49 625 Kz'), findsOneWidget);
    await t.tap(find.text('Confirmar'));
    await t.pumpAndSettle();
    expect(sentAmount, 5000000);
  });

  testWidgets('a retry after a failed answer reuses the idempotency key; an edit does not',
      (t) async {
    final svc = await _session();
    final keys = <String>[];
    await _open(t, svc, (req) async {
      keys.add((jsonDecode(req.body) as Map)['idempotency_key'] as String);
      return http.Response('{"code":"INTERNAL_ERROR","message":"boom"}', 500);
    });

    await _fill(t, '1 000');
    await _submitAndConfirm(t);
    await _submitAndConfirm(t);
    expect(keys, hasLength(2));
    expect(keys[1], keys[0], reason: 'the same withdrawal, retried');
    // The server's English text never reaches the Business.
    expect(find.textContaining('boom'), findsNothing);
    expect(find.textContaining('segundo levantamento'), findsOneWidget);

    await t.enterText(find.byType(TextField).at(0), '2 000');
    await t.pumpAndSettle();
    await _submitAndConfirm(t);
    expect(keys, hasLength(3));
    expect(keys[2], isNot(keys[0]), reason: 'another amount is another request');
  });

  testWidgets('a withdrawal in flight cannot be backed out of', (t) async {
    final svc = await _session();
    final answer = Completer<http.Response>();
    await _open(t, svc, (_) => answer.future);

    await _fill(t, '1 000');
    // Submit, but never answer: the request is on its way to Banzami.
    await t.ensureVisible(
        find.widgetWithText(BanzamiPrimaryButton, 'Pedir levantamento'));
    await t.tap(find.widgetWithText(BanzamiPrimaryButton, 'Pedir levantamento'));
    await t.pumpAndSettle();
    await t.tap(find.text('Confirmar'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 50));

    // Leaving now would lose the answer to a request that may already have
    // moved money — there is no way back, and no back button offering one.
    expect(t.widget<PopScope>(find.byType(PopScope)).canPop, isFalse);
    expect(find.byType(BackButton), findsNothing);

    answer.complete(http.Response(
        jsonEncode({'id': 'po_1', 'status': 'PENDING', 'amount_minor': 100000}),
        201));
    await t.pumpAndSettle();
    expect(t.widget<PopScope>(find.byType(PopScope)).canPop, isTrue);
  });
}
