// "Ligar a um projeto de developer" — the Business's consent code for a
// Developer Project (POST /v1/merchant/project-link-codes).
//
// What must hold: a code is shown only as Banzami issued it, with a live
// countdown to its expiry; a failure shows a message and no code; and once the
// session ends, the code is gone from the screen.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import 'package:banzami_mobile/merchant/screens/project_link_screen.dart';
import 'package:banzami_mobile/merchant/services/merchant_push_registration.dart';
import 'package:banzami_mobile/merchant/services/merchant_reauth.dart';
import 'package:banzami_mobile/merchant/services/merchant_session_service.dart';

const _codes = ['ABCD-EFGH-JKMN', 'PQRS-TUVW-XYZ2'];

class _Banzami {
  int status = 201;
  bool offline = false;
  int issueCalls = 0;
  int refreshStatus = 200;

  late final MockClient client = MockClient((req) async {
    if (offline) throw http.ClientException('offline');
    switch (req.url.path) {
      case '/v1/merchant/project-link-codes':
        issueCalls++;
        if (status != 201) {
          return http.Response(jsonEncode({
            'code': status == 401 ? 'UNAUTHORIZED' : 'SERVICE_UNAVAILABLE',
            'message': 'could not create a code; try again',
          }), status);
        }
        return http.Response(jsonEncode({
          'code': _codes[(issueCalls - 1) % _codes.length],
          'expires_at': '2026-09-10T12:10:00Z',
        }), 201);
      case '/v1/merchant/auth/refresh':
        return http.Response(jsonEncode({'code': 'SESSION_ENDED', 'message': 'x'}), refreshStatus);
    }
    return http.Response('{}', 404);
  });
}

class _NoPush implements MerchantPushRegistration {
  @override
  Future<void> unsubscribe(String topic) async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final store = <String, String>{};
  final clipboard = <String>[];

  setUp(() {
    store.clear();
    clipboard.clear();
    final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(
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
    messenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') {
        clipboard.add((call.arguments as Map)['text'] as String);
      }
      return null;
    });
  });

  Future<MerchantSessionService> signedIn() async {
    final svc = MerchantSessionService(push: _NoPush());
    await svc.createHandleSession(
      merchantId: 'm-1', merchantName: 'Cantina Kilamba', merchantEmail: 'e@x',
      walletId: 'w-1', jwt: 'business.jwt',
      jwtExpiresAt: DateTime.now().add(const Duration(minutes: 14)),
      handle: 'kilamba', environment: 'SANDBOX', pin: '123456',
      refreshToken: 'R1', refreshExpiresAt: DateTime.now().add(const Duration(days: 20)),
    );
    return svc;
  }

  var now = DateTime.utc(2026, 9, 10, 12);

  Widget app(MerchantSessionService svc, BanzamiClient client) => MultiProvider(
        providers: [
          ChangeNotifierProvider<MerchantSessionService>.value(value: svc),
          Provider<BanzamiClient>.value(value: client),
        ],
        child: MaterialApp(home: ProjectLinkScreen(now: () => now)),
      );

  void tallScreen(WidgetTester t) {
    t.view.physicalSize = const Size(1200, 2600);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
  }

  /// Advances the screen's clock and the test's timers together.
  Future<void> elapse(WidgetTester t, Duration d) async {
    now = now.add(d);
    await t.pump(d);
  }

  setUp(() => now = DateTime.utc(2026, 9, 10, 12));

  /// Taps a Banzami button (its press animation runs before onPressed) and
  /// lets the request it starts complete. The screen's clock does not move.
  Future<void> press(WidgetTester t, String label) async {
    await t.tap(find.text(label));
    for (var i = 0; i < 6; i++) {
      await t.pump(const Duration(milliseconds: 100));
    }
  }

  Finder code() => find.byKey(const ValueKey('project-link-code'));
  Finder countdown() => find.byKey(const ValueKey('project-link-countdown'));

  testWidgets('explains the consent in the Business\'s name; no code until asked', (t) async {
    tallScreen(t);
    final svc = (await t.runAsync(signedIn))!;
    final b = _Banzami();
    await t.pumpWidget(app(svc, BanzamiClient(baseUrl: 'https://x', jwt: 'business.jwt',
        jwtExpiresAt: DateTime.now().add(const Duration(minutes: 14)), httpClient: b.client)));

    expect(find.textContaining('receber pagamentos em nome de Cantina Kilamba'), findsOneWidget);
    expect(find.textContaining('Dê-lhe este código apenas se confiar nele.'), findsOneWidget);
    expect(find.textContaining('válido durante 10 minutos e só pode ser usado uma vez'), findsOneWidget);
    expect(code(), findsNothing);
    expect(b.issueCalls, 0, reason: 'opening the screen must not retire a code already given out');
  });

  testWidgets('renders the code with a live countdown that ends in "Código expirado"', (t) async {
    tallScreen(t);
    final svc = (await t.runAsync(signedIn))!;
    final b = _Banzami();
    await t.pumpWidget(app(svc, BanzamiClient(baseUrl: 'https://x', jwt: 'business.jwt',
        jwtExpiresAt: DateTime.now().add(const Duration(minutes: 14)), httpClient: b.client)));

    await press(t, 'Gerar código');

    expect(b.issueCalls, 1);
    expect(find.text('ABCD-EFGH-JKMN'), findsOneWidget);
    expect(find.text('Expira em 10:00'), findsOneWidget);

    await elapse(t, const Duration(seconds: 1));
    expect(find.text('Expira em 09:59'), findsOneWidget);

    await elapse(t, const Duration(minutes: 4, seconds: 59));
    expect(find.text('Expira em 05:00'), findsOneWidget);

    await elapse(t, const Duration(minutes: 5));
    expect(find.text('Código expirado'), findsOneWidget);
    expect(code(), findsNothing, reason: 'an expired code is not handed out');
    expect(countdown(), findsNothing);
    expect(find.text('Gerar novo código'), findsOneWidget);
  });

  testWidgets('copy puts the code on the clipboard', (t) async {
    tallScreen(t);
    final svc = (await t.runAsync(signedIn))!;
    final b = _Banzami();
    await t.pumpWidget(app(svc, BanzamiClient(baseUrl: 'https://x', jwt: 'business.jwt',
        jwtExpiresAt: DateTime.now().add(const Duration(minutes: 14)), httpClient: b.client)));
    await press(t, 'Gerar código');

    await press(t, 'Copiar');
    expect(clipboard, ['ABCD-EFGH-JKMN']);
    await t.pump(const Duration(seconds: 5)); // let the toast go
  });

  testWidgets('"Gerar novo código" asks Banzami again and shows only the new code', (t) async {
    tallScreen(t);
    final svc = (await t.runAsync(signedIn))!;
    final b = _Banzami();
    await t.pumpWidget(app(svc, BanzamiClient(baseUrl: 'https://x', jwt: 'business.jwt',
        jwtExpiresAt: DateTime.now().add(const Duration(minutes: 14)), httpClient: b.client)));
    await press(t, 'Gerar código');
    await elapse(t, const Duration(minutes: 3));
    expect(find.text('Expira em 07:00'), findsOneWidget);

    await press(t, 'Gerar novo código');

    expect(b.issueCalls, 2);
    expect(find.text('PQRS-TUVW-XYZ2'), findsOneWidget);
    expect(find.text('ABCD-EFGH-JKMN'), findsNothing, reason: 'the previous code is retired');
    expect(countdown(), findsOneWidget);
  });

  testWidgets('a temporary failure shows a message and no code — never a placeholder', (t) async {
    tallScreen(t);
    final svc = (await t.runAsync(signedIn))!;
    final b = _Banzami()..status = 503;
    await t.pumpWidget(app(svc, BanzamiClient(baseUrl: 'https://x', jwt: 'business.jwt',
        jwtExpiresAt: DateTime.now().add(const Duration(minutes: 14)), httpClient: b.client)));
    await press(t, 'Gerar código');

    expect(find.text('O Banzami não conseguiu gerar o código agora. Tente novamente dentro de momentos.'),
        findsOneWidget);
    expect(code(), findsNothing);
    expect(countdown(), findsNothing);

    // A code on screen is dropped when a new request fails: it may be retired.
    b.status = 201;
    await press(t, 'Gerar novo código');
    expect(code(), findsOneWidget);
    b.offline = true;
    await press(t, 'Gerar novo código');
    expect(find.text('Sem ligação ao Banzami. Tente novamente.'), findsOneWidget);
    expect(code(), findsNothing);
  });

  testWidgets('the code is not shown after the session ends', (t) async {
    tallScreen(t);
    final svc = (await t.runAsync(signedIn))!;
    final b = _Banzami();
    await t.pumpWidget(app(svc, BanzamiClient(baseUrl: 'https://x', jwt: 'business.jwt',
        jwtExpiresAt: DateTime.now().add(const Duration(minutes: 14)), httpClient: b.client)));
    await press(t, 'Gerar código');
    expect(code(), findsOneWidget);

    svc.markExpired(); // Banzami refused the session
    await t.pump();
    expect(code(), findsNothing);
    expect(find.text('ABCD-EFGH-JKMN'), findsNothing);
    expect(countdown(), findsNothing);
    await t.runAsync(() => svc.settled);
  });

  testWidgets('a refused session on issue ends it and shows no error of its own', (t) async {
    tallScreen(t);
    final svc = (await t.runAsync(signedIn))!;
    final b = _Banzami()..status = 401..refreshStatus = 401;
    await t.pumpWidget(app(svc, buildBusinessClient(session: svc, baseUrl: 'https://x', httpClient: b.client)));
    await press(t, 'Gerar código');

    expect(svc.route, MerchantRoute.signIn, reason: 'the session handling takes over');
    expect(code(), findsNothing);
    expect(find.byType(BanzamiErrorBanner), findsNothing);
    await t.runAsync(() => svc.settled);
  });

  test('failure messages: temporary, offline, refused session', () {
    expect(projectLinkFailureMessage(BanzamiApiException.fromJson(401, const {})), isNull);
    expect(projectLinkFailureMessage(BanzamiApiException.fromJson(503, const {})),
        'O Banzami não conseguiu gerar o código agora. Tente novamente dentro de momentos.');
    expect(projectLinkFailureMessage(const BanzamiNetworkException('down')),
        'Sem ligação ao Banzami. Tente novamente.');
    expect(projectLinkFailureMessage(BanzamiApiException.fromJson(403, const {})),
        'Não foi possível gerar o código. Tente novamente.');
  });
}
