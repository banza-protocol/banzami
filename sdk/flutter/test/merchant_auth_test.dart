import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

void main() {
  group('BanzamiClient — handle+PIN / JWT auth', () {
    test('loginMerchantHandlePin posts handle+pin and returns token + environment', () async {
      late http.Request captured;
      final mock = MockClient((req) async {
        captured = req;
        return http.Response(
          jsonEncode({
            'token': 'jwt.abc',
            'expires_at': '2026-06-26T00:00:00Z',
            'environment': 'SANDBOX',
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final c = BanzamiClient(baseUrl: 'https://x', httpClient: mock);
      final r = await c.loginMerchantHandlePin(handle: 'doa_sandbox', pin: '1234');

      expect(captured.url.path, '/v1/merchant/auth/token');
      final body = jsonDecode(captured.body) as Map<String, dynamic>;
      expect(body['handle'], 'doa_sandbox');
      expect(body['pin'], '1234');
      expect(r.token, 'jwt.abc');
      expect(r.environment, 'SANDBOX');
    });

    test('a fresh JWT is used directly — no API-key exchange', () async {
      var hitAuthToken = false;
      final mock = MockClient((req) async {
        if (req.url.path == '/v1/auth/token') hitAuthToken = true;
        if (req.url.path.startsWith('/v1/merchants/')) {
          return http.Response(
            jsonEncode({
              'id': 'm1', 'name': 'Doa', 'email': 'e@x', 'status': 'ACTIVE',
              'verified': true,
              'created_at': '2026-01-01T00:00:00Z',
              'updated_at': '2026-01-01T00:00:00Z',
            }),
            200,
          );
        }
        return http.Response('{}', 200);
      });
      final c = BanzamiClient(
        baseUrl: 'https://x',
        httpClient: mock,
        jwt: 'jwt.fresh',
        jwtExpiresAt: DateTime.now().add(const Duration(hours: 1)),
      );
      final m = await c.getMerchant('m1');
      expect(m.id, 'm1');
      expect(hitAuthToken, isFalse, reason: 'must not exchange an API key when a fresh JWT is set');
      expect(c.authIdentity, 'jwt.fresh');
    });

    test('JWT-only client with no/expired token surfaces 401 without exchanging', () async {
      var hitAuthToken = false;
      final mock = MockClient((req) async {
        if (req.url.path == '/v1/auth/token') hitAuthToken = true;
        return http.Response('{}', 200);
      });
      final c = BanzamiClient(baseUrl: 'https://x', httpClient: mock); // no apiKey, no jwt
      await expectLater(c.getMerchant('m1'), throwsA(isA<BanzamiApiException>()));
      expect(hitAuthToken, isFalse, reason: 'an empty API key must never be exchanged');
    });

    test('setJwt installs a token usable on subsequent calls', () async {
      final mock = MockClient((req) async {
        if (req.url.path.startsWith('/v1/merchants/')) {
          return http.Response(
            jsonEncode({
              'id': 'm2', 'name': 'X', 'email': 'e', 'status': 'ACTIVE', 'verified': false,
              'created_at': '2026-01-01T00:00:00Z', 'updated_at': '2026-01-01T00:00:00Z',
            }),
            200,
          );
        }
        return http.Response('{}', 200);
      });
      final c = BanzamiClient(baseUrl: 'https://x', httpClient: mock);
      c.setJwt('jwt.set', expiresAt: DateTime.now().add(const Duration(hours: 1)));
      final m = await c.getMerchant('m2');
      expect(m.id, 'm2');
      expect(c.authIdentity, 'jwt.set');
    });
  });
}
