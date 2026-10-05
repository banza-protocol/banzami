import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:banzami_flutter/banzami_flutter.dart';

// Account deletion ("Suprimir conta" / "Suprimir conta Business") at the SDK
// boundary: the right path, a {pin} body, a fresh Idempotency-Key header, and
// the error surface a wrong PIN / pending settlement produces.

void main() {
  group('ConsumerPublicClient.deleteAccount', () {
    test('POSTs to /v1/me/deletion with the pin and an Idempotency-Key', () async {
      http.Request? captured;
      final client = ConsumerPublicClient(
        baseUrl: 'https://api.banzami.com',
        httpClient: MockClient((req) async {
          captured = req;
          return http.Response(jsonEncode({'deleted': true}), 200,
              headers: {'content-type': 'application/json'});
        }),
      )..setToken('tok');

      await client.deleteAccount(pin: '1234');

      expect(captured, isNotNull);
      expect(captured!.method, 'POST');
      expect(captured!.url.path, '/v1/me/deletion');
      expect(jsonDecode(captured!.body), {'pin': '1234'});
      final key = captured!.headers['Idempotency-Key'];
      expect(key, isNotNull);
      expect(key, isNotEmpty);
      expect(captured!.headers['Authorization'], 'Bearer tok');
      // The local token is forgotten once the account is gone.
      expect(client.token, isNull);
    });

    test('a wrong PIN surfaces as a 403 BanzamiApiException', () async {
      final client = ConsumerPublicClient(
        baseUrl: 'https://api.banzami.com',
        httpClient: MockClient((req) async => http.Response(
            jsonEncode({'error': {'code': 'REAUTH_REQUIRED', 'message': 'incorrect PIN'}}),
            403,
            headers: {'content-type': 'application/json'})),
      )..setToken('tok');

      expect(
        () => client.deleteAccount(pin: '0000'),
        throwsA(isA<BanzamiApiException>().having((e) => e.statusCode, 'statusCode', 403)),
      );
    });
  });

  group('BanzamiClient.deleteBusinessAccount', () {
    // A client whose first call returns a JWT and whose next call is captured.
    (BanzamiClient, List<http.Request>) makeClient(int status, Map<String, dynamic> body) {
      final seen = <http.Request>[];
      var n = 0;
      final client = BanzamiClient(
        apiKey: 'bz_test_key',
        baseUrl: 'https://api.banzami.com',
        httpClient: MockClient((req) async {
          n++;
          if (n == 1 && req.url.path.endsWith('/v1/auth/token')) {
            return http.Response(
                jsonEncode({
                  'token': 'test.jwt.token',
                  'expires_at': DateTime.now().add(const Duration(hours: 24)).toIso8601String(),
                }),
                200,
                headers: {'content-type': 'application/json'});
          }
          seen.add(req);
          return http.Response(jsonEncode(body), status,
              headers: {'content-type': 'application/json'});
        }),
      );
      return (client, seen);
    }

    test('POSTs to /v1/merchant/deletion with the pin and an Idempotency-Key', () async {
      final (client, seen) = makeClient(200, {'deleted': true});

      await client.deleteBusinessAccount(pin: '4321');

      expect(seen, hasLength(1));
      final req = seen.single;
      expect(req.method, 'POST');
      expect(req.url.path, '/v1/merchant/deletion');
      expect(jsonDecode(req.body), {'pin': '4321'});
      expect(req.headers['Idempotency-Key'], isNotNull);
      expect(req.headers['Idempotency-Key'], isNotEmpty);
    });

    test('a pending settlement surfaces as a 409 BanzamiApiException', () async {
      final (client, _) = makeClient(409, {
        'error': {'code': 'PENDING_SETTLEMENT', 'message': 'a settlement has not finished'}
      });

      expect(
        () => client.deleteBusinessAccount(pin: '4321'),
        throwsA(isA<BanzamiApiException>().having((e) => e.statusCode, 'statusCode', 409)),
      );
    });

    test('a wrong PIN surfaces as a 403 BanzamiApiException', () async {
      final (client, _) = makeClient(403, {
        'error': {'code': 'REAUTH_REQUIRED', 'message': 'incorrect PIN'}
      });

      expect(
        () => client.deleteBusinessAccount(pin: '0000'),
        throwsA(isA<BanzamiApiException>().having((e) => e.statusCode, 'statusCode', 403)),
      );
    });
  });
}
