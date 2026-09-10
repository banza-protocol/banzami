// Business App session renewal in BanzamiClient.
//
// The invariant: a signed-in app must never keep looking signed in while every
// protected call answers 401. A handle-login session has a short access token
// and a single-use, rotating refresh token; the client renews through the
// app's `refreshSession` hook — once for a whole burst of requests — and only
// a refusal of the renewal (not an outage) ends the session.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

/// A gateway with the merchant auth + balance routes.
class _Gateway {
  /// Access tokens the balance route accepts.
  final Set<String> accepted;

  /// What POST /v1/merchant/auth/refresh answers.
  int refreshStatus;

  /// Always refuse the balance route, whatever the token (e.g. a Business
  /// suspended between renewal and request).
  bool refuseEverything = false;

  int refreshCalls = 0;
  int balanceCalls = 0;
  final List<String> refreshTokensPresented = [];
  final List<String?> balanceTokens = [];
  int _seq = 1;

  _Gateway({Set<String>? accepted, this.refreshStatus = 200})
      : accepted = accepted ?? {};

  late final MockClient client = MockClient((req) async {
    switch (req.url.path) {
      case '/v1/merchant/auth/refresh':
        refreshCalls++;
        refreshTokensPresented.add(
            (jsonDecode(req.body) as Map<String, dynamic>)['refresh_token']
                as String);
        // Slow enough that concurrent callers overlap the renewal.
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (refreshStatus == 401) {
          return http.Response(
              jsonEncode({
                'code': 'SESSION_ENDED',
                'message': 'the session has ended; sign in again'
              }),
              401);
        }
        if (refreshStatus != 200) {
          return http.Response(
              jsonEncode({
                'code': 'SERVICE_UNAVAILABLE',
                'message': 'could not renew the session; try again'
              }),
              refreshStatus);
        }
        _seq++;
        accepted.add('T$_seq');
        return http.Response(
            jsonEncode({
              'token': 'T$_seq',
              'expires_at': DateTime.now()
                  .add(const Duration(minutes: 15))
                  .toUtc()
                  .toIso8601String(),
              'token_type': 'Bearer',
              'environment': 'SANDBOX',
              'refresh_token': 'R$_seq',
              'refresh_expires_at': DateTime.now()
                  .add(const Duration(days: 30))
                  .toUtc()
                  .toIso8601String(),
            }),
            200);
      case '/v1/wallets/w1/balance':
        balanceCalls++;
        final token = req.headers['Authorization']?.replaceFirst('Bearer ', '');
        balanceTokens.add(token);
        if (refuseEverything || !accepted.contains(token)) {
          return http.Response(
              jsonEncode({'code': 'UNAUTHORIZED', 'message': 'invalid token'}),
              401);
        }
        return http.Response(
            jsonEncode({
              'wallet_id': 'w1',
              'currency': 'AOA',
              'available_minor': 0,
              'reserved_minor': 0,
              'total_minor': 0,
              'computed_at': '2026-09-10T00:00:00Z',
            }),
            200);
    }
    return http.Response('{}', 404);
  });
}

/// A Business App session as the app keeps it: the client renews through
/// [refreshMerchantSession] with the stored refresh token, and the rotated one
/// replaces it.
class _App {
  final _Gateway gateway;
  String refreshToken = 'R1';
  int unauthorized = 0;
  late final BanzamiClient client;

  _App(this.gateway, {required String jwt, required DateTime expiresAt}) {
    client = BanzamiClient(
      baseUrl: 'https://x',
      httpClient: gateway.client,
      jwt: jwt,
      jwtExpiresAt: expiresAt,
      onUnauthorized: () => unauthorized++,
      refreshSession: () async {
        final t = await client.refreshMerchantSession(refreshToken);
        if (t == null) return null;
        refreshToken = t.refreshToken!;
        return t;
      },
    );
  }

  /// Five balance reads at once; each resolves to 'ok' or the error.
  Future<List<Object>> burst([int n = 5]) => Future.wait(List.generate(
      n,
      (_) => client
          .getMerchantBalance('w1')
          .then<Object>((_) => 'ok')
          .catchError((Object e) => e)));
}

final _expired = DateTime.now().subtract(const Duration(minutes: 1));
final _fresh = DateTime.now().add(const Duration(minutes: 14));

Matcher _apiError(int status) =>
    isA<BanzamiApiException>().having((e) => e.statusCode, 'statusCode', status);

void main() {
  group('renewal', () {
    test(
        '(a) five concurrent calls on an expired access token: ONE refresh, '
        'five successful requests', () async {
      final gw = _Gateway();
      final app = _App(gw, jwt: 'T1', expiresAt: _expired);

      final results = await app.burst();

      expect(results, everyElement('ok'));
      expect(gw.refreshCalls, 1, reason: 'one shared renewal, no storm');
      expect(gw.refreshTokensPresented, ['R1']);
      expect(gw.balanceCalls, 5,
          reason: 'the expired token is never sent; each call goes once');
      expect(gw.balanceTokens, everyElement('T2'));
      expect(app.refreshToken, 'R2', reason: 'the rotated token is kept');
      expect(app.unauthorized, 0);
    });

    test('(b) a 401 mid-session: one refresh, one retry', () async {
      // The token looks fresh on the device, but Banzami no longer accepts it.
      final gw = _Gateway(accepted: {});
      final app = _App(gw, jwt: 'T1', expiresAt: _fresh);

      final b = await app.client.getMerchantBalance('w1');

      expect(b.availableMinor, 0, reason: 'a zero balance is a real balance');
      expect(gw.refreshCalls, 1);
      expect(gw.balanceTokens, ['T1', 'T2']);
      expect(app.unauthorized, 0);
    });

    test('concurrent 401s mid-session share one refresh', () async {
      final gw = _Gateway(accepted: {});
      final app = _App(gw, jwt: 'T1', expiresAt: _fresh);

      final results = await app.burst();

      expect(results, everyElement('ok'));
      expect(gw.refreshCalls, 1);
      expect(gw.balanceCalls, 10, reason: 'five refused, five retried');
      expect(app.unauthorized, 0);
    });

    test(
        '(c) the refresh is refused: onUnauthorized exactly once, no retry '
        'loop, nothing more is sent', () async {
      final gw = _Gateway(refreshStatus: 401);
      final app = _App(gw, jwt: 'T1', expiresAt: _expired);

      final results = await app.burst();

      expect(results, everyElement(_apiError(401)));
      expect(app.unauthorized, 1, reason: 'one transition for the burst');
      expect(gw.refreshCalls, 1);
      expect(gw.balanceCalls, 0);

      // The ended session stays ended: no new refresh, no repeated callback.
      await expectLater(
          app.client.getMerchantBalance('w1'), throwsA(_apiError(401)));
      expect(gw.refreshCalls, 1);
      expect(app.unauthorized, 1);
    });

    test(
        '(d) the refresh endpoint is down (503): the error surfaces, the '
        'session is NOT ended, and the next call renews', () async {
      final gw = _Gateway(refreshStatus: 503);
      final app = _App(gw, jwt: 'T1', expiresAt: _expired);

      final results = await app.burst(3);

      expect(results, everyElement(_apiError(503)));
      expect(app.unauthorized, 0, reason: 'an outage is not a sign-out');
      expect(gw.refreshCalls, 1);
      expect(app.refreshToken, 'R1', reason: 'nothing was rotated');

      gw.refreshStatus = 200; // Banzami is back
      await app.client.getMerchantBalance('w1');
      expect(gw.refreshCalls, 2);
      expect(app.unauthorized, 0);
    });

    test('no network during the refresh is a network error, not a sign-out',
        () async {
      var unauthorized = 0;
      late final BanzamiClient client;
      client = BanzamiClient(
        baseUrl: 'https://x',
        httpClient:
            MockClient((_) async => throw http.ClientException('offline')),
        jwt: 'T1',
        jwtExpiresAt: _expired,
        onUnauthorized: () => unauthorized++,
        refreshSession: () => client.refreshMerchantSession('R1'),
      );
      await expectLater(client.getMerchantBalance('w1'),
          throwsA(isA<BanzamiNetworkException>()));
      expect(unauthorized, 0);
    });

    test(
        '(e) the retried request is refused too: onUnauthorized once, no '
        'infinite loop', () async {
      final gw = _Gateway()..refuseEverything = true;
      final app = _App(gw, jwt: 'T1', expiresAt: _fresh);

      final results = await app.burst(3);

      expect(results, everyElement(_apiError(401)));
      expect(gw.refreshCalls, 1);
      expect(gw.balanceCalls, 6, reason: 'each request: once, then one retry');
      expect(app.unauthorized, 1);

      await expectLater(
          app.client.getMerchantBalance('w1'), throwsA(_apiError(401)));
      expect(gw.balanceCalls, 6, reason: 'an ended session sends nothing');
      expect(gw.refreshCalls, 1);
    });

    test('setJwt re-opens a client whose session ended', () async {
      final gw = _Gateway(refreshStatus: 401);
      final app = _App(gw, jwt: 'T1', expiresAt: _expired);
      await expectLater(
          app.client.getMerchantBalance('w1'), throwsA(_apiError(401)));

      // A new sign-in (handle + PIN) installs a fresh token.
      gw.accepted.add('T9');
      app.client.setJwt('T9',
          expiresAt: DateTime.now().add(const Duration(minutes: 15)));
      await app.client.getMerchantBalance('w1');
      expect(gw.balanceTokens.last, 'T9');
    });

    test('a refresher that throws something unexpected is not a sign-out',
        () async {
      var unauthorized = 0;
      final client = BanzamiClient(
        baseUrl: 'https://x',
        httpClient: MockClient((_) async => http.Response('{}', 200)),
        jwt: 'T1',
        jwtExpiresAt: _expired,
        onUnauthorized: () => unauthorized++,
        refreshSession: () async => throw const FormatException('keychain'),
      );
      await expectLater(client.getMerchantBalance('w1'),
          throwsA(isA<BanzamiNetworkException>()));
      expect(unauthorized, 0);
    });

    test('ensureSession renews an expired token and sends nothing else',
        () async {
      final gw = _Gateway();
      final app = _App(gw, jwt: 'T1', expiresAt: _expired);
      await app.client.ensureSession();
      expect(gw.refreshCalls, 1);
      expect(gw.balanceCalls, 0);
      await app.client.ensureSession();
      expect(gw.refreshCalls, 1, reason: 'the renewed token is fresh');
    });

    test('a JWT client without a refresher ends the session once', () async {
      var unauthorized = 0;
      var requests = 0;
      final client = BanzamiClient(
        baseUrl: 'https://x',
        httpClient: MockClient((_) async {
          requests++;
          return http.Response('{}', 200);
        }),
        jwt: 'T1',
        jwtExpiresAt: _expired,
        onUnauthorized: () => unauthorized++,
      );
      final results = await Future.wait(List.generate(
          4,
          (_) => client
              .getMerchantBalance('w1')
              .then<Object>((_) => 'ok')
              .catchError((Object e) => e)));
      expect(results, everyElement(_apiError(401)));
      expect(unauthorized, 1);
      expect(requests, 0);
    });
  });

  group('session endpoints', () {
    test('refreshMerchantSession parses the rotated tokens', () async {
      late http.Request captured;
      final c = BanzamiClient(
        baseUrl: 'https://x',
        httpClient: MockClient((req) async {
          captured = req;
          return http.Response(
              jsonEncode({
                'token': 'T2',
                'expires_at': '2026-09-10T10:15:00Z',
                'token_type': 'Bearer',
                'environment': 'SANDBOX',
                'refresh_token': 'R2',
                'refresh_expires_at': '2026-10-10T10:00:00Z',
              }),
              200);
        }),
      );
      final t = await c.refreshMerchantSession('R1');
      expect(captured.url.path, '/v1/merchant/auth/refresh');
      expect(jsonDecode(captured.body), {'refresh_token': 'R1'});
      expect(captured.headers['Authorization'], isNull,
          reason: 'the refresh token is the credential');
      expect(t!.token, 'T2');
      expect(t.refreshToken, 'R2');
      expect(t.expiresAt, DateTime.utc(2026, 9, 10, 10, 15));
      expect(t.refreshExpiresAt, DateTime.utc(2026, 10, 10, 10));
      expect(t.environment, 'SANDBOX');
      expect(t.toString(), isNot(contains('R2')),
          reason: 'tokens never reach a log line');
    });

    test('refreshMerchantSession: permanent refusals end, outages throw',
        () async {
      Future<Object?> answer(int status, {String body = '{}'}) async {
        final c = BanzamiClient(
            baseUrl: 'https://x',
            httpClient: MockClient((_) async => http.Response(body, status)));
        try {
          return await c.refreshMerchantSession('R1');
        } catch (e) {
          return e;
        }
      }

      expect(
          await answer(401,
              body: jsonEncode({'code': 'SESSION_ENDED', 'message': 'x'})),
          isNull);
      expect(await answer(400), isNull);
      expect(await answer(503), _apiError(503));
      expect(await answer(502, body: '<html>bad gateway</html>'),
          _apiError(502));
      expect(await answer(429), _apiError(429));
      expect(await answer(200, body: '<html>captive portal</html>'),
          isA<BanzamiNetworkException>());
      final empty = BanzamiClient(
          baseUrl: 'https://x',
          httpClient: MockClient((_) async => fail('nothing to send')));
      expect(await empty.refreshMerchantSession(''), isNull);
    });

    test('logoutMerchantSession posts the refresh token', () async {
      late http.Request captured;
      final c = BanzamiClient(
        baseUrl: 'https://x',
        httpClient: MockClient((req) async {
          captured = req;
          return http.Response('', 204);
        }),
      );
      await c.logoutMerchantSession('R1');
      expect(captured.url.path, '/v1/merchant/auth/logout');
      expect(jsonDecode(captured.body), {'refresh_token': 'R1'});
    });

    test('logoutMerchantSession surfaces an unconfirmed revocation', () async {
      final c = BanzamiClient(
        baseUrl: 'https://x',
        httpClient: MockClient((_) async => http.Response('', 503)),
      );
      await expectLater(c.logoutMerchantSession('R1'), throwsA(_apiError(503)));
    });
  });
}
