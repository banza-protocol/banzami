import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/merchant/screens/qr_screen.dart';
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
    merchantId: 'm1', merchantName: 'Loja Teste', merchantEmail: 'e@x',
    walletId: 'w1', jwt: 't', handle: 'loja', environment: 'SANDBOX',
    pin: '123456', verified: true,
    jwtExpiresAt: DateTime.now().add(const Duration(hours: 1)),
  );
  return svc;
}

Future<void> _open(WidgetTester t, MerchantSessionService svc,
    Future<http.Response> Function(http.Request) receivePoint) async {
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
            return receivePoint(req);
          }),
        ),
      ),
      ChangeNotifierProvider<MerchantSessionService>.value(value: svc),
    ],
    child: const MaterialApp(home: MerchantQrScreen()),
  ));
  await t.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(_mockSecureStorage);

  testWidgets('an ACTIVE receive point renders the printable QR + copy action',
      (t) async {
    final svc = await _session();
    String? path;
    await _open(t, svc, (req) async {
      path = req.url.path;
      return http.Response(
        jsonEncode({
          'slug': 'ABCdef123456789012345A',
          'status': 'ACTIVE',
          'environment': 'SANDBOX',
          'deep_link': 'banzami://pay/business/ABCdef123456789012345A',
          'pay_url': 'https://pay.banzami.com/b/ABCdef123456789012345A',
          'qr_url': '/v1/business/receive-point/qr',
        }),
        200,
      );
    });

    expect(path, '/v1/business/receive-point');
    expect(find.byType(BanzamiQrDisplay), findsOneWidget);
    expect(find.text('Loja Teste'), findsOneWidget);
    // The persistent QR can be shared (canonical action on the Receive screen).
    expect(find.text('Partilhar QR'), findsOneWidget);
    // The charge flow is still offered alongside the persistent QR.
    expect(find.text('Criar cobrança'), findsOneWidget);
  });

  testWidgets('a failure falls back to the charge flow, never a broken QR',
      (t) async {
    final svc = await _session();
    await _open(t, svc,
        (req) async => http.Response('{"code":"RECEIVE_POINT_UNAVAILABLE"}', 502));

    expect(find.byType(BanzamiQrDisplay), findsNothing);
    expect(find.text('Criar cobrança'), findsOneWidget);
  });
}
