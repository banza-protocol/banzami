import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:banzami_flutter/banzami_flutter.dart';

void main() {
  group('ConsumerPublicClient token', () {
    test('after clearToken nothing is sent with the old token', () async {
      final auth = <String?>[];
      final client = ConsumerPublicClient(
        baseUrl: 'https://api.test',
        httpClient: MockClient((req) async {
          auth.add(req.headers['Authorization']);
          return http.Response(jsonEncode({'id': 'c', 'handle': 'ana'}), 200);
        }),
      )..setToken('old.jwt.token');

      await client.checkAuth();
      client.clearToken();
      await client.checkAuth().catchError((_) {});
      expect(auth.first, 'Bearer old.jwt.token');
      expect(auth.last, isNull);
      expect(client.token, isNull);
    });

    test('an empty token is no token', () {
      final client = ConsumerPublicClient(baseUrl: 'https://api.test')..setToken('');
      expect(client.token, isNull);
    });
  });

  group('untrusted slugs and codes stay one path segment', () {
    test('a traversal slug or code cannot reach another endpoint', () async {
      final paths = <String>[];
      final client = ConsumerPublicClient(
        baseUrl: 'https://api.test',
        httpClient: MockClient((req) async {
          paths.add(req.url.path);
          return http.Response('{"code":"NOT_FOUND","message":"x"}', 404);
        }),
      )..setToken('t');
      for (final call in <Future<Object?> Function()>[
        () => client.getPaymentLinkBySlug('../me/wallet'),
        () => client.payPaymentLink('..', amountMinor: 1),
        () => client.getConsumerPayLinkByCode('a/b'),
        () => client.payConsumerPayLink('x?y=1'),
      ]) {
        try {
          await call();
        } catch (_) {}
      }
      for (final p in paths) {
        expect(p.startsWith('/v1/payment-links/') || p.startsWith('/v1/consumer-pay-links/'),
            isTrue, reason: p);
        expect(p.contains('/me/'), isFalse, reason: p);
      }
      expect(paths.any((p) => p.endsWith('/pay') && !p.contains('links/')), isFalse);
      expect(paths.length, 3, reason: '".." is refused before any request');
    });
  });

  test('createKycCase sends its idempotency key as the Idempotency-Key header', () async {
    String? key;
    final client = ConsumerPublicClient(
      baseUrl: 'https://api.test',
      httpClient: MockClient((req) async {
        key = req.headers['Idempotency-Key'];
        return http.Response('{"code":"X","message":"x"}', 400);
      }),
    )..setToken('t');
    try {
      await client.createKycCase(
          documentType: KycDocumentType.values.first, idempotencyKey: 'kyc-1');
    } catch (_) {}
    expect(key, 'kyc-1');
  });

  // A sign-out used to end nothing on the server: a 24-hour token stayed good
  // wherever it had been copied. Signing out everywhere tells the server, with
  // the session's own token, and forgets it here.
  group('signOutEverywhere', () {
    test('asks the server to end every session, then forgets the token', () async {
      final calls = <String>[];
      final client = ConsumerPublicClient(
        baseUrl: 'https://api.test',
        httpClient: MockClient((req) async {
          calls.add('${req.method} ${req.url.path} ${req.headers['Authorization']}');
          return http.Response(jsonEncode({'signed_out': true}), 200);
        }),
      )..setToken('live.jwt');
      await client.signOutEverywhere();
      expect(calls, ['POST /v1/auth/logout Bearer live.jwt']);
      expect(client.token, isNull);
    });

    test('a server that could not be told keeps the token and says so', () async {
      final client = ConsumerPublicClient(
        baseUrl: 'https://api.test',
        httpClient: MockClient((_) async =>
            http.Response('{"code":"SERVICE_UNAVAILABLE","message":"x"}', 503)),
      )..setToken('live.jwt');
      await expectLater(client.signOutEverywhere(), throwsA(isA<BanzamiApiException>()));
      expect(client.token, 'live.jwt');
    });
  });
}
