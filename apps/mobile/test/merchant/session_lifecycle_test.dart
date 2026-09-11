// The Business App session lifecycle.
//
// The defect this file exists for: a device kept a handle-login token that had
// expired a month earlier. The profile rendered from what the device remembered
// (@handle, "Verificado"), every financial call failed, and the PIN screen —
// which checked the PIN on the device — unlocked the same dead token again. The
// app looked signed in and could never load a balance.
//
// Since migration 0120 a sign-in is a renewable session: a ~15 min access
// token and a single-use, rotating refresh token. The invariant: the app never
// looks signed in while protected financial APIs are permanently unauthorized
// — and an outage is never mistaken for a sign-out.

import 'dart:async';
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
import 'package:banzami_mobile/merchant/services/merchant_push_registration.dart';
import 'package:banzami_mobile/merchant/screens/onboarding/login_screen.dart';
import 'package:banzami_mobile/merchant/services/merchant_reauth.dart';
import 'package:banzami_mobile/merchant/services/merchant_session_service.dart';
import 'package:banzami_mobile/services/push_notification_service.dart';

String _jwt(String merchantId, [String sig = 'sig']) {
  String seg(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${seg({'alg': 'HS256'})}.${seg({'merchant_id': merchantId, 'environment': 'SANDBOX'})}.$sig';
}

final _t1 = _jwt('m-old', 't1');

/// Banzami, as far as the Business App sees it. The handle now belongs to
/// m-new (wallet w-new) — a sign-in with handle + PIN finds that out.
class _Banzami {
  int tokenStatus;
  int refreshStatus;
  bool offline = false;

  /// Access tokens the balance route accepts.
  final Set<String> accepted;

  int tokenCalls = 0;
  int refreshCalls = 0;
  int balanceCalls = 0;
  final List<String> refreshPresented = [];
  final List<String> logoutPresented = [];

  /// Storage writes and requests, in order (see [log]).
  final List<String> events;
  int _seq = 1;

  _Banzami({
    this.tokenStatus = 200,
    this.refreshStatus = 200,
    Set<String>? accepted,
    List<String>? events,
  })  : accepted = accepted ?? {},
        events = events ?? [];

  static String _in(Duration d) => DateTime.now().add(d).toUtc().toIso8601String();

  late final MockClient client = MockClient((req) async {
    if (offline) throw http.ClientException('offline');
    switch (req.url.path) {
      case '/v1/merchant/auth/token':
        tokenCalls++;
        if (tokenStatus != 200) {
          return http.Response(jsonEncode({'code': 'UNAUTHORIZED', 'message': 'invalid handle or pin'}), tokenStatus);
        }
        final token = _jwt('m-new', 'login');
        accepted.add(token);
        return http.Response(jsonEncode({
          'token': token,
          'expires_at': _in(const Duration(minutes: 15)),
          'token_type': 'Bearer',
          'environment': 'SANDBOX',
          'refresh_token': 'R-login',
          'refresh_expires_at': _in(const Duration(days: 30)),
        }), 200);
      case '/v1/merchant/auth/refresh':
        refreshCalls++;
        refreshPresented.add((jsonDecode(req.body) as Map)['refresh_token'] as String);
        if (refreshStatus != 200) {
          return http.Response(jsonEncode({
            'code': refreshStatus == 401 ? 'SESSION_ENDED' : 'SERVICE_UNAVAILABLE',
            'message': 'x',
          }), refreshStatus);
        }
        _seq++;
        final token = _jwt('m-old', 't$_seq');
        accepted.add(token);
        return http.Response(jsonEncode({
          'token': token,
          'expires_at': _in(const Duration(minutes: 15)),
          'token_type': 'Bearer',
          'environment': 'SANDBOX',
          'refresh_token': 'R$_seq',
          'refresh_expires_at': _in(const Duration(days: 30)),
        }), 200);
      case '/v1/merchant/auth/logout':
        logoutPresented.add((jsonDecode(req.body) as Map)['refresh_token'] as String);
        return http.Response('', 204);
      case '/v1/wallets/w-old/balance':
        balanceCalls++;
        final token = req.headers['Authorization']?.replaceFirst('Bearer ', '') ?? '';
        events.add('balance:${token == _t1 ? 't1' : token.split('.').last}');
        if (!accepted.contains(token)) {
          return http.Response(jsonEncode({'code': 'UNAUTHORIZED', 'message': 'invalid token'}), 401);
        }
        return http.Response(jsonEncode({
          'wallet_id': 'w-old', 'currency': 'AOA', 'available_minor': 0,
          'reserved_minor': 0, 'total_minor': 0, 'computed_at': '2026-09-10T00:00:00Z',
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

/// The device's FCM topic registration, as the session service sees it.
class _Push implements MerchantPushRegistration {
  final Map<String, String> store;
  _Push(this.store);

  final List<String> unsubscribed = [];

  /// The Business the device's storage still named when each unsubscription
  /// STARTED — proof it ran before the identity was cleared.
  final List<String?> storedIdentityAtCall = [];

  /// The Business the session service itself was still signed in as, for
  /// calls made once [svc] is known.
  final List<String?> sessionIdentityAtCall = [];
  MerchantSessionService? svc;

  /// FCM unreachable: the call never completes.
  bool hang = false;

  @override
  Future<void> unsubscribe(String topic) {
    unsubscribed.add(topic);
    storedIdentityAtCall.add(store['merchant_id']);
    if (svc != null) sessionIdentityAtCall.add(svc!.session?.merchantId);
    return hang ? Completer<void>().future : Future<void>.value();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final store = <String, String>{};
  final events = <String>[];

  setUp(() {
    store.clear();
    events.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
      (call) async {
        final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
        switch (call.method) {
          case 'write':
            events.add('write:${args['key']}');
            store[args['key'] as String] = args['value'] as String;
            return null;
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
  /// holding access token t1 that expires at [expiry] and — unless it predates
  /// renewable sessions — refresh token R1, restored as a cold start does.
  Future<MerchantSessionService> device(DateTime expiry,
      {bool withRefresh = true, MerchantPushRegistration? push}) async {
    final svc = MerchantSessionService(push: push);
    await svc.createHandleSession(
      merchantId: 'm-old', merchantName: 'Loja', merchantEmail: 'e@x', walletId: 'w-old',
      jwt: _t1, jwtExpiresAt: expiry, handle: 'loja', environment: 'SANDBOX',
      pin: '123456', verified: true,
      refreshToken: withRefresh ? 'R1' : null,
      refreshExpiresAt: withRefresh ? DateTime.now().add(const Duration(days: 20)) : null,
    );
    final restored = MerchantSessionService(push: push);
    await restored.initialize();
    events.clear();
    return restored;
  }

  BanzamiClient clientFor(MerchantSessionService svc, _Banzami b) =>
      buildBusinessClient(session: svc, baseUrl: 'https://x', httpClient: b.client);

  final expired = DateTime.now().subtract(const Duration(minutes: 1));
  final fresh   = DateTime.now().add(const Duration(minutes: 14));
  const endedKeys = [
    'merchant_jwt', 'merchant_jwt_expiry', 'merchant_refresh_token', 'merchant_refresh_expiry',
    'merchant_id', 'merchant_name', 'merchant_email', 'merchant_wallet_id', 'merchant_verified',
  ];

  void expectSignedOut(MerchantSessionService svc) {
    expect(svc.hasSession, isFalse, reason: 'no half-authenticated session');
    expect(svc.route, MerchantRoute.signIn);
    expect(svc.sessionExpired, isTrue);
    expect(svc.signInHandle, 'loja', reason: 'sign in again as @loja with the PIN');
    for (final k in endedKeys) {
      expect(store.containsKey(k), isFalse, reason: '$k must not outlive the session');
    }
    expect(store['merchant_handle'], 'loja');
    expect(store.containsKey('merchant_pin_hash'), isTrue, reason: 'the device lock stays');
  }

  group('session state', () {
    test('a restored session that cannot renew, with a dead access token, requires sign-in', () async {
      // Stored before renewable sessions: no refresh token.
      final svc = await device(DateTime.now().subtract(const Duration(days: 40)), withRefresh: false);
      expect(svc.isLocked, isTrue);
      expectSignedOut(svc);
    });

    test('a restored session with a valid token is merely locked', () async {
      final svc = await device(DateTime.now().add(const Duration(hours: 5)));
      expect(svc.isLocked, isTrue);
      expect(svc.sessionExpired, isFalse);
      expect(svc.route, MerchantRoute.locked);
    });

    test('an expired access token with a live refresh token is merely locked', () async {
      final svc = await device(DateTime.now().subtract(const Duration(days: 2)));
      expect(svc.route, MerchantRoute.locked);
      expect(svc.sessionExpired, isFalse);
      expect(svc.session!.canRenew, isTrue);
      expect(store['merchant_refresh_token'], 'R1');
    });

    test('many requests on an ended session transition the app once, and send no financial request', () async {
      final svc = await device(expired);
      svc.unlock();
      var notifications = 0;
      svc.addListener(() => notifications++);
      final b = _Banzami(refreshStatus: 401);
      final client = clientFor(svc, b);
      final results = await Future.wait(List.generate(5, (_) =>
          client.getMerchantBalance('w-old').then((_) => 'ok').catchError((Object e) => 'err')));
      expect(results, everyElement('err'));
      expect(b.refreshCalls, 1, reason: 'one renewal, not a refresh storm');
      expect(b.balanceCalls, 0, reason: 'an expired token is not sent — and nothing retries it');
      expect(notifications, 1, reason: 'one transition');
      await svc.settled;
      expectSignedOut(svc);
    });
  });

  group('renewal — the refresh token, never the PIN', () {
    test('an expired access token is renewed once and the balance loads; no PIN reaches Banzami', () async {
      final svc = await device(expired);
      svc.unlock();
      final b = _Banzami();
      final client = clientFor(svc, b);

      final balance = await client.getMerchantBalance('w-old');

      expect(balance.availableMinor, 0, reason: '0 Kz is a balance, not a failure');
      expect(b.refreshCalls, 1);
      expect(b.refreshPresented, ['R1']);
      expect(b.tokenCalls, 0, reason: 'the PIN is not sent to renew');
      expect(svc.route, MerchantRoute.signedIn);
      expect(svc.session!.refreshToken, 'R2');
      expect(store['merchant_refresh_token'], 'R2');
      expect(store['merchant_jwt'], svc.session!.jwt);
    });

    test('the rotated refresh token is stored before the new access token is used', () async {
      final svc = await device(expired);
      svc.unlock();
      final b = _Banzami(events: events);
      await clientFor(svc, b).getMerchantBalance('w-old');
      final refreshWrite = events.indexOf('write:merchant_refresh_token');
      final jwtWrite     = events.indexOf('write:merchant_jwt');
      final firstUse     = events.indexOf('balance:t2');
      expect(refreshWrite, greaterThanOrEqualTo(0));
      expect(refreshWrite, lessThan(jwtWrite));
      expect(jwtWrite, lessThan(firstUse));
      expect(events.where((e) => e == 'balance:t1'), isEmpty, reason: 'the expired token is never sent');
    });

    test('concurrent 401s mid-session share one refresh', () async {
      // The device thinks t1 is fresh; Banzami no longer accepts it.
      final svc = await device(fresh);
      svc.unlock();
      final b = _Banzami();
      final client = clientFor(svc, b);
      final results = await Future.wait(List.generate(5, (_) =>
          client.getMerchantBalance('w-old').then((_) => 'ok').catchError((Object e) => '$e')));
      expect(results, everyElement('ok'));
      expect(b.refreshCalls, 1);
      expect(b.refreshPresented, ['R1'], reason: 'a single-use token is presented once');
      expect(store['merchant_refresh_token'], 'R2');
      expect(svc.route, MerchantRoute.signedIn);
    });

    test('two clients of one session still present the refresh token once', () async {
      // E.g. the old client finishing a burst while the provider built a new one.
      final svc = await device(expired);
      svc.unlock();
      final b = _Banzami();
      final results = await Future.wait([
        clientFor(svc, b).getMerchantBalance('w-old'),
        clientFor(svc, b).getMerchantBalance('w-old'),
      ]);
      expect(results, hasLength(2));
      expect(b.refreshPresented, ['R1'], reason: 'a second presentation would end the sign-in');
      expect(store['merchant_refresh_token'], 'R2');
    });

    test('the session ended: session, identity and cached state are cleared; sign-in is shown', () async {
      final svc = await device(expired);
      svc.unlock();
      final b = _Banzami(refreshStatus: 401);
      await expectLater(clientFor(svc, b).getMerchantBalance('w-old'),
          throwsA(isA<BanzamiApiException>().having((e) => e.statusCode, 'status', 401)));
      await svc.settled;
      expectSignedOut(svc);
      expect(balanceFailureMessage(BanzamiApiException.fromJson(401, const {})), isNull,
          reason: 'no balance message: the session handling takes over');

      // And a cold start does not bring it back.
      final again = MerchantSessionService();
      await again.initialize();
      expectSignedOut(again);
    });

    test('a refresh outage is not a sign-out: the balance says temporarily unavailable', () async {
      final svc = await device(expired);
      svc.unlock();
      final b = _Banzami(refreshStatus: 503);
      final client = clientFor(svc, b);

      Object? failure;
      await client.getMerchantBalance('w-old').catchError((Object e) { failure = e; return _zero; });
      expect(balanceFailureMessage(failure!),
          'O Banzami não conseguiu calcular o saldo agora. Tente novamente.');
      expect(svc.route, MerchantRoute.signedIn);
      expect(store['merchant_refresh_token'], 'R1', reason: 'nothing ended, nothing rotated');

      b.offline = true;
      failure = null;
      await client.getMerchantBalance('w-old').catchError((Object e) { failure = e; return _zero; });
      expect(balanceFailureMessage(failure!), 'Sem ligação ao Banzami. Tente novamente.');
      expect(svc.route, MerchantRoute.signedIn);

      // Banzami is back: the next call renews.
      b..offline = false..refreshStatus = 200;
      await client.getMerchantBalance('w-old');
      expect(store['merchant_refresh_token'], 'R2');
    });

    test('renewed tokens never resurrect a session that ended meanwhile', () async {
      final svc = await device(expired);
      final s = svc.session!;
      svc.markExpired();
      final applied = await svc.applyRenewedTokens(s, MerchantAuthTokens(
        token: 'late', expiresAt: fresh, environment: 'SANDBOX', refreshToken: 'R-late'));
      expect(applied, isFalse);
      await svc.settled;
      expectSignedOut(svc);
    });
  });

  group('sign-out', () {
    test('logout revokes the refresh token and clears the session', () async {
      final svc = await device(fresh);
      svc.unlock();
      final b = _Banzami();
      await signOutBusiness(client: clientFor(svc, b), session: svc);
      expect(b.logoutPresented, ['R1']);
      expectSignedOut(svc);
    });

    test('logout clears the session even when Banzami cannot be reached', () async {
      final svc = await device(fresh);
      svc.unlock();
      final b = _Banzami()..offline = true;
      await signOutBusiness(client: clientFor(svc, b), session: svc);
      expectSignedOut(svc);
    });

    test('removing the account revokes and forgets everything', () async {
      final svc = await device(fresh);
      final b = _Banzami();
      await signOutBusiness(client: clientFor(svc, b), session: svc, removeAccount: true);
      expect(b.logoutPresented, ['R1']);
      expect(svc.route, MerchantRoute.welcome);
      expect(store, isEmpty);
    });
  });

  // A signed-out device must not keep receiving the Business's payment
  // notifications: every way a session ends takes the device off the
  // Business's FCM topics — started while the identity is still known.
  group('payment notifications follow the session', () {
    const topics = ['merchant_m-old', 'sandbox_merchant_m-old'];

    test('the topics are the ones the gateway publishes to', () {
      expect(PushNotificationService.merchantTopics('m-old'), topics);
      expect(PushNotificationService.merchantTopic('m-old', sandbox: true), 'sandbox_merchant_m-old');
      expect(PushNotificationService.merchantTopic('m-old', sandbox: false), 'merchant_m-old');
    });

    test('a refused renewal unsubscribes before the identity is cleared', () async {
      final push = _Push(store);
      final svc = await device(expired, push: push);
      push.svc = svc;
      svc.unlock();
      expect(push.unsubscribed, isEmpty, reason: 'a live session keeps its notifications');
      await clientFor(svc, _Banzami(refreshStatus: 401))
          .getMerchantBalance('w-old')
          .catchError((Object _) => _zero);
      await svc.settled;
      expect(push.unsubscribed, topics);
      expect(push.storedIdentityAtCall, ['m-old', 'm-old'],
          reason: 'started while the device still knew the Business');
      expect(push.sessionIdentityAtCall, ['m-old', 'm-old'],
          reason: 'started before the session let go of the Business');
      expectSignedOut(svc);
    });

    test('"Terminar sessão" unsubscribes', () async {
      final push = _Push(store);
      final svc = await device(fresh, push: push);
      push.svc = svc;
      svc.unlock();
      await signOutBusiness(client: clientFor(svc, _Banzami()), session: svc);
      expect(push.unsubscribed, topics);
      expect(push.storedIdentityAtCall, ['m-old', 'm-old']);
      expect(push.sessionIdentityAtCall, ['m-old', 'm-old']);
      expectSignedOut(svc);
    });

    test('"Remover conta" / "Usar outra conta" unsubscribes', () async {
      final push = _Push(store);
      final svc = await device(fresh, push: push);
      push.svc = svc;
      await signOutBusiness(client: clientFor(svc, _Banzami()), session: svc, removeAccount: true);
      expect(push.unsubscribed, topics);
      expect(push.storedIdentityAtCall, ['m-old', 'm-old']);
      expect(push.sessionIdentityAtCall, ['m-old', 'm-old']);
      expect(store, isEmpty);
    });

    test('an unreachable FCM does not keep the device signed in', () async {
      final push = _Push(store)..hang = true;
      final svc = await device(fresh, push: push);
      svc.unlock();
      await signOutBusiness(client: clientFor(svc, _Banzami()), session: svc);
      expect(push.unsubscribed, topics);
      expectSignedOut(svc);
    });

    test('a session found dead at start-up unsubscribes too', () async {
      final push = _Push(store);
      final svc = await device(DateTime.now().subtract(const Duration(days: 40)),
          withRefresh: false, push: push);
      expect(push.unsubscribed, topics);
      expectSignedOut(svc);
    });

    test('locking the device is not an ending: nothing is unsubscribed', () async {
      final push = _Push(store);
      final svc = await device(fresh, push: push);
      svc..unlock()..lock();
      expect(push.unsubscribed, isEmpty);
    });

    test('a sign-in that replaces the Business unsubscribes the one it replaced', () async {
      final push = _Push(store);
      final svc = await device(fresh, push: push);
      await svc.applyReauthentication(
        jwt: _jwt('m-new'), jwtExpiresAt: fresh, merchantId: 'm-new', merchantName: 'Outra',
        merchantEmail: 'o@x', walletId: 'w-new', verified: false,
      );
      expect(push.unsubscribed, topics, reason: 'm-old is no longer signed in here');
      push.unsubscribed.clear();
      await svc.applyReauthentication(
        jwt: _jwt('m-new', 'again'), jwtExpiresAt: fresh, merchantId: 'm-new', merchantName: 'Outra',
        merchantEmail: 'o@x', walletId: 'w-new', verified: false,
      );
      expect(push.unsubscribed, isEmpty, reason: 'the same Business signing in again keeps its topic');
    });
  });

  group('re-authentication', () {
    test('replaces the token AND the identity when the handle moved', () async {
      final svc = await device(DateTime.now().subtract(const Duration(days: 40)), withRefresh: false);
      await reauthenticateBusiness(
        client: BanzamiClient(baseUrl: 'https://x', httpClient: _Banzami().client),
        session: svc, pin: '123456',
      );
      final s = svc.session!;
      expect(s.merchantId, 'm-new');
      expect(s.walletId, 'w-new', reason: 'a new token must never be paired with the old wallet');
      expect(s.refreshToken, 'R-login', reason: 'the new sign-in is renewable');
      expect(svc.isTokenExpired(), isFalse);
      expect(svc.sessionExpired, isFalse);
      expect(svc.isLocked, isFalse);
      // And it survives a restart.
      final again = MerchantSessionService();
      await again.initialize();
      expect(again.session!.walletId, 'w-new');
      expect(again.session!.refreshToken, 'R-login');
      expect(again.sessionExpired, isFalse);
    });

    test('a refused PIN is reported as refused; nothing is signed in', () async {
      final svc = await device(DateTime.now().subtract(const Duration(days: 1)), withRefresh: false);
      await expectLater(
        reauthenticateBusiness(
          client: BanzamiClient(baseUrl: 'https://x', httpClient: _Banzami(tokenStatus: 401).client),
          session: svc, pin: '123456'),
        throwsA(isA<ReauthException>().having((e) => e.failure, 'failure', ReauthFailure.refused)),
      );
      expectSignedOut(svc);
    });

    test('a 5xx during sign-in is an outage, never a refusal; nothing is cleared', () async {
      final svc = await device(DateTime.now().subtract(const Duration(days: 1)), withRefresh: false);
      await expectLater(
        reauthenticateBusiness(
          client: BanzamiClient(baseUrl: 'https://x', httpClient: _Banzami(tokenStatus: 503).client),
          session: svc, pin: '123456'),
        throwsA(isA<ReauthException>().having((e) => e.failure, 'failure', ReauthFailure.unavailable)),
      );
      expect(store['merchant_handle'], 'loja', reason: 'the account stays on the device');
    });

    test('the sign-in screen blames the PIN only for a 401', () {
      BanzamiApiException api(int s) => BanzamiApiException(statusCode: s, code: 'X', message: 'x');
      expect(businessSignInError(api(401)), 'PIN incorrecto.');
      expect(businessSignInError(api(429)), contains('bloqueada'));
      for (final e in <Object>[api(500), api(503), const BanzamiNetworkException('down')]) {
        expect(businessSignInError(e), isNot(contains('PIN')), reason: '$e');
      }
    });

    test('a lockout is reported as locked', () async {
      final svc = await device(DateTime.now().subtract(const Duration(days: 1)), withRefresh: false);
      await expectLater(
        reauthenticateBusiness(
          client: BanzamiClient(baseUrl: 'https://x', httpClient: _Banzami(tokenStatus: 429).client),
          session: svc, pin: '123456'),
        throwsA(isA<ReauthException>().having((e) => e.failure, 'failure', ReauthFailure.locked)),
      );
    });

    test('no network is reported as offline', () async {
      final svc = await device(DateTime.now().subtract(const Duration(days: 1)), withRefresh: false);
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
    Widget pinApp(MerchantSessionService svc, BanzamiClient client) => MultiProvider(
          providers: [
            ChangeNotifierProvider<MerchantSessionService>.value(value: svc),
            Provider<BanzamiClient>.value(value: client),
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

    void tallScreen(WidgetTester t) {
      t.view.physicalSize = const Size(1200, 2600);
      t.view.devicePixelRatio = 1.0;
      addTearDown(t.view.reset);
    }

    testWidgets('an expired session says so, and the right PIN re-authenticates once', (t) async {
      tallScreen(t);
      final svc = (await t.runAsync(() => device(DateTime.now().subtract(const Duration(days: 40)), withRefresh: false)))!;
      final b = _Banzami();
      await t.pumpWidget(pinApp(svc, BanzamiClient(baseUrl: 'https://x', httpClient: b.client)));
      await t.pump();
      expect(find.text('A sessão terminou. Introduza o PIN para continuar.'), findsOneWidget);
      expect(find.text('@loja'), findsOneWidget, reason: 'sign-in for the handle');
      expect(find.text('Loja'), findsNothing, reason: 'nothing the ended session knew is shown');
      await typePin(t, '123456');
      expect(b.tokenCalls, 1);
      expect(svc.isLocked, isFalse);
      expect(svc.session!.walletId, 'w-new');
    });

    testWidgets('a wrong PIN is refused on the device without spending a server attempt', (t) async {
      tallScreen(t);
      final svc = (await t.runAsync(() => device(DateTime.now().subtract(const Duration(days: 40)), withRefresh: false)))!;
      final b = _Banzami();
      await t.pumpWidget(pinApp(svc, BanzamiClient(baseUrl: 'https://x', httpClient: b.client)));
      await t.pump();
      await typePin(t, '999999');
      expect(b.tokenCalls, 0);
      expect(svc.isLocked, isTrue);
      expect(find.text('PIN incorrecto. Tente novamente.'), findsOneWidget);
    });

    testWidgets('a PIN Banzami now refuses ends the session on this device', (t) async {
      tallScreen(t);
      final svc = (await t.runAsync(() => device(DateTime.now().subtract(const Duration(days: 40)), withRefresh: false)))!;
      await t.pumpWidget(pinApp(svc, BanzamiClient(baseUrl: 'https://x', httpClient: _Banzami(tokenStatus: 401).client)));
      await t.pump();
      await typePin(t, '123456');
      expect(svc.hasSession, isFalse, reason: 'nothing the dead session remembered is kept');
      expect(store, isEmpty);
    });

    testWidgets('unlocking with an expired access token renews it — the PIN stays on the device', (t) async {
      tallScreen(t);
      final svc = (await t.runAsync(() => device(DateTime.now().subtract(const Duration(days: 2)))))!;
      final b = _Banzami();
      final client = clientFor(svc, b);
      await t.pumpWidget(pinApp(svc, client));
      await t.pump();
      expect(find.text('Introduza o PIN'), findsOneWidget);
      expect(find.text('Loja'), findsOneWidget, reason: 'a live session behind the device lock');
      await typePin(t, '123456');
      expect(b.refreshCalls, 1);
      expect(b.tokenCalls, 0, reason: 'no PIN request to the server');
      expect(svc.route, MerchantRoute.signedIn);
      expect(store['merchant_refresh_token'], 'R2');

      await t.runAsync(() => client.getMerchantBalance('w-old'));
      expect(b.refreshCalls, 1, reason: 'the renewed token is used as it is');
      expect(b.balanceCalls, 1);
    });

    testWidgets('unlocking during an outage opens the app; nothing ends, no PIN is sent', (t) async {
      tallScreen(t);
      final svc = (await t.runAsync(() => device(DateTime.now().subtract(const Duration(days: 2)))))!;
      final b = _Banzami(refreshStatus: 503);
      await t.pumpWidget(pinApp(svc, clientFor(svc, b)));
      await t.pump();
      await typePin(t, '123456');
      expect(b.tokenCalls, 0);
      expect(svc.route, MerchantRoute.signedIn);
      expect(store['merchant_refresh_token'], 'R1');
    });

    testWidgets('unlocking a session that ended signs in again with the same PIN', (t) async {
      tallScreen(t);
      final svc = (await t.runAsync(() => device(DateTime.now().subtract(const Duration(days: 2)))))!;
      final b = _Banzami(refreshStatus: 401);
      await t.pumpWidget(pinApp(svc, clientFor(svc, b)));
      await t.pump();
      await typePin(t, '123456');
      expect(b.refreshCalls, 1);
      expect(b.tokenCalls, 1, reason: 'only an ended session sends the PIN');
      expect(svc.route, MerchantRoute.signedIn);
      expect(svc.session!.walletId, 'w-new');
      expect(store['merchant_refresh_token'], 'R-login');
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

final _zero = MerchantBalance.fromJson(const {
  'wallet_id': 'w-old', 'currency': 'AOA', 'available_minor': 0,
  'reserved_minor': 0, 'total_minor': 0, 'computed_at': '2026-09-10T00:00:00Z',
});
