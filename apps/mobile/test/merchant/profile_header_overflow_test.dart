import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/merchant/screens/profile_screen.dart';
import 'package:banzami_mobile/merchant/services/merchant_session_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

/// A long, verified business name must not overflow the Profile header on narrow
/// phones (it used to wrap one character at a time into a tall sliver because the
/// "Empresa verificada" badge squeezed the name column). Overflow is captured via
/// FlutterError so asset/plugin noise in the test environment doesn't mask it.
void _mockSecureStorage() {
  final store = <String, String>{};
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(
    const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
    (call) async {
      final a = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
      switch (call.method) {
        case 'write': store[a['key'] as String] = a['value'] as String; return null;
        case 'read': return store[a['key'] as String];
        case 'delete': store.remove(a['key']); return null;
        case 'readAll': return Map<String, String>.from(store);
        case 'containsKey': return store.containsKey(a['key']);
        default: return null;
      }
    },
  );
}

Future<MerchantSessionService> _session(String name) async {
  final svc = MerchantSessionService();
  await svc.createHandleSession(
    merchantId: 'm1', merchantName: name, merchantEmail: 'e@x',
    walletId: 'w1', jwt: 't', handle: 'doa', environment: 'SANDBOX',
    pin: '123456', verified: true,
    jwtExpiresAt: DateTime.now().add(const Duration(hours: 1)),
  );
  return svc;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(_mockSecureStorage);

  for (final width in <double>[320, 360]) {
    testWidgets('verified long-name profile header has no overflow at ${width.toInt()}px', (t) async {
      t.view.physicalSize = Size(width * 2, 900 * 2);
      t.view.devicePixelRatio = 2.0;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);

      final svc = await _session('Sandbox · Doa-Sandbox Comércio Geral Lda');

      final captured = <FlutterErrorDetails>[];
      final previous = FlutterError.onError;
      FlutterError.onError = captured.add;
      try {
        await t.pumpWidget(MultiProvider(
          providers: [
            ChangeNotifierProvider<MerchantSessionService>.value(value: svc),
            Provider<BanzamiClient>(
              create: (_) => BanzamiClient(
                apiKey: 'bz_test_key', baseUrl: 'https://api.test', maxRetries: 0,
                httpClient: MockClient((_) async => http.Response('{}', 200)),
              ),
            ),
          ],
          child: const MaterialApp(home: MerchantProfileScreen()),
        ));
        await t.pump(const Duration(milliseconds: 300));
      } finally {
        FlutterError.onError = previous;
      }

      final overflows = captured
          .where((e) => e.toString().toLowerCase().contains('overflow'))
          .toList();
      expect(overflows, isEmpty, reason: 'profile header overflow at ${width.toInt()}px');
      expect(find.text('Empresa verificada'), findsOneWidget);
    });
  }
}
