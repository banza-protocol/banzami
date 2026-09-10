// createProjectLinkCode — a signed-in Business's consent for a Developer
// Project to connect to it (POST /v1/merchant/project-link-codes).
//
// The one thing that must never happen: the app showing a code Banzami did
// not issue. Every failure is an exception, never a placeholder.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

const _path = '/v1/merchant/project-link-codes';

class _Gateway {
  final List<http.Request> requests = [];
  int status = 201;
  String? rawBody;
  bool offline = false;
  static const _codes = ['ABCD-EFGH-JKMN', 'PQRS-TUVW-XYZ2', 'HJKM-NPQR-STUV'];
  int _seq = 0;

  late final MockClient client = MockClient((req) async {
    if (offline) throw http.ClientException('offline');
    requests.add(req);
    if (req.url.path != _path) return http.Response('{}', 404);
    if (rawBody != null) return http.Response(rawBody!, status);
    if (status == 201) {
      final code = _codes[_seq++ % _codes.length];
      return http.Response(
          jsonEncode({
            'code': code,
            'expires_at': '2026-09-10T12:10:00Z',
          }),
          201);
    }
    return http.Response(
        jsonEncode({
          'code': status == 401 ? 'UNAUTHORIZED' : 'SERVICE_UNAVAILABLE',
          'message': 'x',
        }),
        status);
  });
}

BanzamiClient _client(_Gateway g,
        {void Function()? onUnauthorized, SessionRefresher? refresh}) =>
    BanzamiClient(
      baseUrl: 'https://api.test',
      jwt: 'business.jwt',
      jwtExpiresAt: DateTime.now().add(const Duration(minutes: 10)),
      httpClient: g.client,
      onUnauthorized: onUnauthorized,
      refreshSession: refresh,
    );

void main() {
  test('issues a code with the Business session and returns it typed', () async {
    final g = _Gateway();
    final code = await _client(g).createProjectLinkCode();

    expect(code.code, 'ABCD-EFGH-JKMN');
    expect(code.expiresAt, DateTime.utc(2026, 9, 10, 12, 10));
    expect(code.expiresAt.isUtc, isTrue);
    expect(g.requests, hasLength(1));
    final req = g.requests.single;
    expect(req.method, 'POST');
    expect(req.url.path, _path);
    expect(req.headers['Authorization'], 'Bearer business.jwt');
    expect(req.headers.containsKey('Idempotency-Key'), isFalse,
        reason: 'a replayed answer would hand back a code already retired');
  });

  test('each call asks Banzami for a new code', () async {
    final g = _Gateway();
    final client = _client(g);
    final first = await client.createProjectLinkCode();
    final second = await client.createProjectLinkCode();
    expect(g.requests, hasLength(2));
    expect(second.code, isNot(first.code));
  });

  test('503 is a temporary failure, surfaced once and not retried', () async {
    final g = _Gateway()..status = 503;
    await expectLater(
      _client(g).createProjectLinkCode(),
      throwsA(isA<BanzamiApiException>()
          .having((e) => e.statusCode, 'status', 503)
          .having((e) => e.code, 'code', 'SERVICE_UNAVAILABLE')),
    );
    expect(g.requests, hasLength(1),
        reason: 'a retry would retire the code it was retrying');
  });

  test('no network is a network failure', () async {
    final g = _Gateway()..offline = true;
    await expectLater(_client(g).createProjectLinkCode(),
        throwsA(isA<BanzamiNetworkException>()));
  });

  test('a 2xx that is not a code is never turned into one', () async {
    for (final body in [
      jsonEncode({'expires_at': '2026-09-10T12:10:00Z'}), // no code
      jsonEncode({'code': '', 'expires_at': '2026-09-10T12:10:00Z'}),
      jsonEncode({'code': 'ABCD-EFGH-JKMN'}), // no expiry
      jsonEncode({'code': 'ABCD-EFGH-JKMN', 'expires_at': 'soon'}),
      '<html>proxy</html>',
    ]) {
      final g = _Gateway()..rawBody = body;
      await expectLater(_client(g).createProjectLinkCode(),
          throwsA(isA<BanzamiNetworkException>()),
          reason: body);
    }
  });

  test('a refused session ends it: onUnauthorized once, a 401 thrown', () async {
    final g = _Gateway()..status = 401;
    var ended = 0;
    await expectLater(
      _client(g, onUnauthorized: () => ended++, refresh: () async => null)
          .createProjectLinkCode(),
      throwsA(isA<BanzamiApiException>()
          .having((e) => e.statusCode, 'status', 401)),
    );
    expect(ended, 1);
  });

  test('remainingAt counts down to zero and never below', () {
    final c = ProjectLinkCode(
        code: 'ABCD-EFGH-JKMN', expiresAt: DateTime.utc(2026, 9, 10, 12, 10));
    expect(c.remainingAt(DateTime.utc(2026, 9, 10, 12, 0)),
        const Duration(minutes: 10));
    expect(c.remainingAt(DateTime.utc(2026, 9, 10, 12, 11)), Duration.zero);
    expect(c.toString(), isNot(contains('ABCD')),
        reason: 'the code is not for logs');
  });
}
