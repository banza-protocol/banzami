// The Business App session lifecycle.
//
// The defect this file exists for: a device kept a handle-login token that had
// expired a month earlier. The profile rendered from what the device remembered
// (@handle, "Verificado"), every financial call failed, and the PIN screen —
// which checked the PIN on the device — unlocked the same dead token again. The
// app looked signed in and could never load a balance.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import 'package:banzami_mobile/merchant/screens/dashboard_screen.dart';
import 'package:banzami_mobile/merchant/screens/pin_screen.dart';
import 'package:banzami_mobile/merchant/services/merchant_reauth.dart';
import 'package:banzami_mobile/merchant/services/merchant_session_service.dart';

String _jwt(String merchantId) {
  String seg(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${seg({'alg': 'HS256'})}.${seg({'merchant_id': merchantId, 'environment': 'SANDBOX'})}.sig';
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
          case 'read': return store[args['key'] as String];
          case 'delete': store.remove(args['key']); return null;
          case 'deleteAll': store.clear(); return null;
          case 'readAll': return Map<String, String>.from(store);
          case 'containsKey': return store.containsKey(args['key']);
          default: return null;
        }
      },
    );
  });

  /// A device that signed in as merchant m-old with wallet w-old, PIN 123456,
  /// holding a token that expires at [expiry].
  Future<MerchantSessionService> device(DateTime expiry) async {
    final svc = MerchantSessionService();
    await svc.createHandleSession(
      merchantId: 'm-old', merchantName: 'Loja', merchantEmail: 'e@x', walletId: 'w-old',
      jwt: _jwt('m-old'), jwtExpiresAt: expiry, handle: 'loja', environment: 'SANDBOX',
      pin: '123456', verified: true,
    );
    // Reload from storage, as a cold start does.
    final restored = MerchantSessionService();
    await restored.initialize();
    return restored;
  }

  /// Banzami: the handle now belongs to m-new (wallet w-new).
  int tokenCalls = 0;
  MockClient banzami({int tokenStatus = 200}) {
    tokenCalls = 0;
    return MockClient((req) async {
      switch (req.url.path) {
        case '/v1/merchant/auth/token':
          tokenCalls++;
          if (tokenStatus != 200) {
            return http.Response(jsonEncode({'code': 'UNAUTHORIZED', 'message': 'invalid handle or pin'}), tokenStatus);
          }
          return http.Response(jsonEncode({
            'token': _jwt('m-new'),
            'expires_at': DateTime.now().add(const Duration(hours: 24)).toUtc().toIso8601String(),
            'environment': 'SANDBOX',
          }), 200);
        case '/v1/merchants/m-new':
          return http.Response(jsonEncode({
            'id': 'm-new', 'name': 'Loja', 'email': 'e@x', 'status': 'ACTIVE', 'verified': true,
            'created_at': '2026-01-01T00:00:00Z', 'updated_at': '2026-01-01T00:00:00Z',
          }), 200);
        case '/v1/wallets':
          return http.Response(jsonEncode({
            'id': 'w-new', 'merchant_id': 'm-new', 'currency': 'AOA', 'status': 'ACTIVE',
            'created_at': '2026-01-01T00:00:00Z',
          }), 200);
      }
      return http.Response('{}', 404);
    });
  }

  group('session state', () {
    test('a restored session whose token expired opens EXPIRED and locked', () async {
      final svc = await device(DateTime.now().subtract(const Duration(days: 40)));
      expect(svc.hasSession, isTrue);
      expect(svc.isLocked, isTrue);
      expect(svc.sessionExpired, isTrue);
      expect(svc.isTokenExpired(), isTrue);
    });

    test('a restored session with a valid token is merely locked', () async {
      final svc = await device(DateTime.now().add(const Duration(hours: 5)));
      expect(svc.isLocked, isTrue);
      expect(svc.sessionExpired, isFalse);
    });

    test('many 401s together transition the app once, and send no request', () async {
      final svc = await device(DateTime.now().subtract(const Duration(minutes: 1)));
      svc.unlock(); // as the old app did: unlocked onto a dead token
      var notifications = 0;
      svc.addListener(() => notifications++);
      var requests = 0;
      final client = BanzamiClient(
        baseUrl: 'https://x',
        jwt: svc.session!.jwt, jwtExpiresAt: svc.session!.jwtExpiresAt,
        httpClient: MockClient((_) async { requests++; return http.Response('{}', 200); }),
        onUnauthorized: svc.markExpired,
      );
      final results = await Future.wait(List.generate(5, (_) =>
          client.getMerchantBalance('w-old').then((_) => 'ok').catchError((Object e) => 'err')));
      expect(results, everyElement('err'));
      expect(requests, 0, reason: 'an expired token is not sent — and nothing retries it');
      expect(notifications, 1, reason: 'one transition, not a refresh storm');
      expect(svc.sessionExpired && svc.isLocked, isTrue);
    });
  });

  group('re-authentication', () {
    test('replaces the token AND the identity when the handle moved', () async {
      final svc = await device(DateTime.now().subtract(const Duration(days: 40)));
      await reauthenticateBusiness(
        client: BanzamiClient(baseUrl: 'https://x', httpClient: banzami()),
        session: svc, pin: '123456',
      );
      final s = svc.session!;
      expect(s.merchantId, 'm-new');
      expect(s.walletId, 'w-new', reason: 'a new token must never be paired with the old wallet');
      expect(svc.isTokenExpired(), isFalse);
      expect(svc.sessionExpired, isFalse);
      expect(svc.isLocked, isFalse);
      // And it survives a restart.
      final again = MerchantSessionService();
      await again.initialize();
      expect(again.session!.walletId, 'w-new');
      expect(again.sessionExpired, isFalse);
    });

    test('a refused PIN is reported as refused; nothing is changed', () async {
      final svc = await device(DateTime.now().subtract(const Duration(days: 1)));
      await expectLater(
        reauthenticateBusiness(
          client: BanzamiClient(baseUrl: 'https://x', httpClient: banzami(tokenStatus: 401)),
          session: svc, pin: '123456'),
        throwsA(isA<ReauthException>().having((e) => e.failure, 'failure', ReauthFailure.refused)),
      );
      expect(svc.session!.walletId, 'w-old');
      expect(svc.sessionExpired, isTrue);
    });

    test('a lockout is reported as locked', () async {
      final svc = await device(DateTime.now().subtract(const Duration(days: 1)));
      await expectLater(
        reauthenticateBusiness(
          client: BanzamiClient(baseUrl: 'https://x', httpClient: banzami(tokenStatus: 429)),
          session: svc, pin: '123456'),
        throwsA(isA<ReauthException>().having((e) => e.failure, 'failure', ReauthFailure.locked)),
      );
    });

    test('no network is reported as offline', () async {
      final svc = await device(DateTime.now().subtract(const Duration(days: 1)));
      await expectLater(
        reauthenticateBusiness(
          client: BanzamiClient(baseUrl: 'https://x',
              httpClient: MockClient((_) async => throw http.ClientException('down'))),
          session: svc, pin: '123456'),
        throwsA(isA<ReauthException>().having((e) => e.failure, 'failure', ReauthFailure.offline)),
      );
    });
  });

  group('PIN screen', () {
    Widget pinApp(MerchantSessionService svc, MockClient mock) => MultiProvider(
          providers: [
            ChangeNotifierProvider<MerchantSessionService>.value(value: svc),
            Provider<BanzamiClient>.value(value: BanzamiClient(baseUrl: 'https://x', httpClient: mock)),
          ],
          child: const MaterialApp(home: MerchantPinScreen()),
        );

    Future<void> typePin(WidgetTester t, String pin) async {
      for (final d in pin.split('')) {
        await t.tap(find.text(d).last);
        await t.pump();
      }
      await t.pumpAndSettle();
    }

    testWidgets('an expired session says so, and the right PIN re-authenticates once', (t) async {
      t.view.physicalSize = const Size(1200, 2600);
      t.view.devicePixelRatio = 1.0;
      addTearDown(t.view.reset);
      final svc = (await t.runAsync(() => device(DateTime.now().subtract(const Duration(days: 40)))))!;
      final mock = banzami();
      await t.pumpWidget(pinApp(svc, mock));
      await t.pump();
      expect(find.text('A sessão terminou. Introduza o PIN para continuar.'), findsOneWidget);
      await typePin(t, '123456');
      expect(tokenCalls, 1);
      expect(svc.isLocked, isFalse);
      expect(svc.session!.walletId, 'w-new');
    });

    testWidgets('a wrong PIN is refused on the device without spending a server attempt', (t) async {
      t.view.physicalSize = const Size(1200, 2600);
      t.view.devicePixelRatio = 1.0;
      addTearDown(t.view.reset);
      final svc = (await t.runAsync(() => device(DateTime.now().subtract(const Duration(days: 40)))))!;
      final mock = banzami();
      await t.pumpWidget(pinApp(svc, mock));
      await t.pump();
      await typePin(t, '999999');
      expect(tokenCalls, 0);
      expect(svc.isLocked, isTrue);
      expect(find.text('PIN incorrecto. Tente novamente.'), findsOneWidget);
    });

    testWidgets('a PIN Banzami now refuses ends the session on this device', (t) async {
      t.view.physicalSize = const Size(1200, 2600);
      t.view.devicePixelRatio = 1.0;
      addTearDown(t.view.reset);
      final svc = (await t.runAsync(() => device(DateTime.now().subtract(const Duration(days: 40)))))!;
      await t.pumpWidget(pinApp(svc, banzami(tokenStatus: 401)));
      await t.pump();
      await typePin(t, '123456');
      expect(svc.hasSession, isFalse, reason: 'nothing the dead session remembered is kept');
      expect(store, isEmpty);
    });
  });

  group('balance failure semantics', () {
    test('each cause reads differently; an ended session shows nothing', () {
      expect(balanceFailureMessage(BanzamiApiException.fromJson(401, const {})), isNull);
      expect(balanceFailureMessage(BanzamiApiException.fromJson(404, const {})),
          'A carteira desta conta Business ainda não está disponível.');
      expect(balanceFailureMessage(BanzamiApiException.fromJson(503, const {})),
          'O Banzami não conseguiu calcular o saldo agora. Tente novamente.');
      expect(balanceFailureMessage(const BanzamiNetworkException('down')),
          'Sem ligação ao Banzami. Tente novamente.');
    });

    test('a zero balance is money, not a failure', () {
      expect(formatMinor(0, 'AOA'), isNot(contains('—')));
      expect(formatMinor(0, 'AOA'), contains('0'));
    });
  });
}
