import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import 'package:banzami_mobile/merchant/services/merchant_session_service.dart';
import 'package:banzami_mobile/merchant/screens/onboarding/login_screen.dart';

String _fakeJwt(Map<String, dynamic> claims) {
  String seg(Object o) =>
      base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${seg({'alg': 'HS256'})}.${seg(claims)}.sig';
}

/// A tall surface so onboarding content (button, advanced link, PinPad) is on
/// screen and hit-testable.
void _tall(WidgetTester t) {
  t.view.physicalSize = const Size(1200, 2600);
  t.view.devicePixelRatio = 1.0;
  addTearDown(t.view.reset);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final store = <String, String>{};

  setUp(() {
    store.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
      (call) async {
        final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
        switch (call.method) {
          case 'write': store[args['key'] as String] = args['value'] as String; return null;
          case 'read':  return store[args['key'] as String];
          case 'delete': store.remove(args['key']); return null;
          case 'deleteAll': store.clear(); return null;
          case 'readAll': return Map<String, String>.from(store);
          case 'containsKey': return store.containsKey(args['key']);
          default: return null;
        }
      },
    );
  });

  /// Mock backend with a configurable lookup response plus a working
  /// token/merchant/wallet path for the full login flow.
  MockClient backend({Map<String, dynamic>? lookup}) {
    final jwt = _fakeJwt({'merchant_id': 'm1', 'environment': 'SANDBOX'});
    return MockClient((req) async {
      if (req.url.path == '/v1/merchant/auth/lookup') {
        return http.Response(jsonEncode(lookup ?? {
          'exists': true, 'can_login': true, 'status': 'ACTIVE',
          'display_name': 'Doa Sandbox', 'verified': true,
        }), 200);
      }
      if (req.url.path == '/v1/merchant/auth/token') {
        return http.Response(jsonEncode({
          // Relative to now: a fixed date became the past, and the client
          // (correctly) refused to present a token that had already expired.
          'token': jwt,
          'expires_at': DateTime.now().add(const Duration(hours: 24)).toUtc().toIso8601String(),
          'environment': 'SANDBOX',
        }), 200);
      }
      if (req.url.path.startsWith('/v1/merchants/')) {
        return http.Response(jsonEncode({
          'id': 'm1', 'name': 'Doa Sandbox', 'email': 'e@x', 'status': 'ACTIVE', 'verified': true,
          'created_at': '2026-01-01T00:00:00Z', 'updated_at': '2026-01-01T00:00:00Z',
        }), 200);
      }
      if (req.url.path == '/v1/wallets') {
        return http.Response(jsonEncode({
          'id': 'w1', 'merchant_id': 'm1', 'currency': 'AOA', 'status': 'ACTIVE',
          'created_at': '2026-01-01T00:00:00Z',
        }), 200);
      }
      return http.Response('{}', 200);
    });
  }

  Widget app(MockClient mock, MerchantSessionService svc) => MultiProvider(
        providers: [
          ChangeNotifierProvider<MerchantSessionService>.value(value: svc),
          Provider<BanzamiClient>.value(
            value: BanzamiClient(baseUrl: 'https://x', httpClient: mock),
          ),
        ],
        child: const MaterialApp(home: MerchantLoginScreen()),
      );

  Widget plain() => const MaterialApp(home: MerchantLoginScreen());

  group('Login screen — handle step', () {
    testWidgets('shows the @negócio entry', (t) async {
      _tall(t);
      await t.pumpWidget(plain());
      await t.pump();
      expect(find.text('Entrar na sua conta Business'), findsOneWidget);
      expect(find.byType(TextFormField), findsOneWidget);
      expect(find.text('Entrar com credenciais de integração'), findsOneWidget);
    });

    testWidgets('invalid handle shows a clean error (no lookup, no PIN)', (t) async {
      _tall(t);
      await t.pumpWidget(plain()); // format check fails before any network call
      await t.pump();
      await t.enterText(find.byType(TextFormField), 'ab'); // too short
      await t.tap(find.text('Continuar'));
      await t.pumpAndSettle();
      expect(find.text('@banza inválido.'), findsWidgets);
      expect(find.text('Digite o PIN Business'), findsNothing); // stayed on handle step
    });

    testWidgets('existing active @negócio advances to PIN (normalised lowercase)', (t) async {
      _tall(t);
      await t.pumpWidget(app(backend(), MerchantSessionService()));
      await t.pump();
      await t.enterText(find.byType(TextFormField), '@Cantina_Alex');
      await t.tap(find.text('Continuar'));
      await t.pumpAndSettle();
      expect(find.text('Digite o PIN Business'), findsOneWidget);
      expect(find.text('@cantina_alex'), findsOneWidget); // normalised subtitle
    });

    testWidgets('advanced link opens the integration-credentials screen', (t) async {
      _tall(t);
      await t.pumpWidget(plain());
      await t.pump();
      await t.tap(find.text('Entrar com credenciais de integração'));
      await t.pumpAndSettle();
      expect(find.text('Credenciais de integração'), findsWidgets); // appbar + heading
      expect(find.textContaining('Use este método'), findsOneWidget);
    });
  });

  group('Login screen — lookup gates the PIN step', () {
    Future<void> expectMessage(
      WidgetTester t, {
      required Map<String, dynamic> lookup,
      required String message,
    }) async {
      _tall(t);
      await t.pumpWidget(app(backend(lookup: lookup), MerchantSessionService()));
      await t.pump();
      await t.enterText(find.byType(TextFormField), 'farmacia_luanda');
      await t.tap(find.text('Continuar'));
      await t.pumpAndSettle();
      expect(find.text(message), findsOneWidget);
      expect(find.text('Digite o PIN Business'), findsNothing); // never reached PIN
    }

    testWidgets('unknown @negócio → not found', (t) async {
      await expectMessage(t,
          lookup: {'exists': false, 'can_login': false},
          message: 'Conta Business não encontrada.');
    });

    testWidgets('pending account → under review', (t) async {
      await expectMessage(t,
          lookup: {'exists': true, 'can_login': false, 'status': 'PENDING'},
          message: 'A sua conta Business ainda está em análise.');
    });

    testWidgets('rejected account → not approved', (t) async {
      await expectMessage(t,
          lookup: {'exists': true, 'can_login': false, 'status': 'REJECTED'},
          message: 'Esta conta Business não foi aprovada.');
    });

    testWidgets('suspended account → suspended', (t) async {
      await expectMessage(t,
          lookup: {'exists': true, 'can_login': false, 'status': 'SUSPENDED'},
          message: 'Esta conta Business está suspensa.');
    });
  });

  group('Login screen — handle+PIN success', () {
    testWidgets('creates a handlePin session and stores NO API key', (t) async {
      _tall(t);
      final svc = MerchantSessionService();
      await t.pumpWidget(app(backend(), svc));
      await t.pump();

      await t.enterText(find.byType(TextFormField), 'doa_sandbox');
      await t.tap(find.text('Continuar'));
      await t.pumpAndSettle();
      expect(find.text('Digite o PIN Business'), findsOneWidget);

      for (final d in ['1', '2', '3', '4', '5', '6']) {
        await t.tap(find.text(d));
        await t.pump();
      }
      // _login is async and ends on a spinner (popUntil is a no-op in tests);
      // settle with bounded pumps — pumpAndSettle would hang on the indicator.
      for (var i = 0; i < 20; i++) {
        await t.pump(const Duration(milliseconds: 50));
        if (svc.hasSession) break;
      }

      expect(svc.hasSession, isTrue);
      expect(svc.session!.loginMethod, MerchantLoginMethod.handlePin);
      expect(svc.session!.handle, 'doa_sandbox');
      expect(svc.session!.apiKey, isNull);             // never store an API key
      expect(svc.session!.jwt, _fakeJwt({'merchant_id': 'm1', 'environment': 'SANDBOX'}));
      expect(store.containsKey('merchant_api_key'), isFalse);
      expect(store['merchant_login_method'], 'handle_pin');
    });
  });

  group('Login wiring guards', () {
    final login = File('lib/merchant/screens/onboarding/login_screen.dart').readAsStringSync();
    final welcome = File('lib/merchant/screens/onboarding/welcome_screen.dart').readAsStringSync();

    test('login looks the handle up before prompting for a PIN', () {
      expect(login.contains('lookupMerchantHandle'), isTrue);
      expect(login.contains('Conta Business não encontrada.'), isTrue);
      expect(login.contains('ainda está em análise'), isTrue);
      expect(login.contains('não foi aprovada'), isTrue);
      expect(login.contains('está suspensa'), isTrue);
    });

    test('login drives loginMerchantHandlePin → setJwt → createHandleSession', () {
      expect(login.contains('loginMerchantHandlePin'), isTrue);
      expect(login.contains('setJwt'), isTrue);
      expect(login.contains('createHandleSession'), isTrue);
      expect(login.contains('PIN incorrecto.'), isTrue);
      expect(login.contains('Conta temporariamente bloqueada'), isTrue);
      expect(login.contains('businessSignInError(e)'), isTrue);
    });

    test('welcome opens the @handle login (not the API-key setup)', () {
      expect(welcome.contains('MerchantLoginScreen'), isTrue);
      expect(welcome.contains('MerchantSetupScreen'), isFalse);
    });
  });
}
