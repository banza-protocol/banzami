import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:banzami_flutter/banzami_flutter.dart';

void main() {
  group('resolveReceivePoint', () {
    test('is a public GET that parses the payer-safe identity', () async {
      String? path;
      String? auth;
      final client = ConsumerPublicClient(
        baseUrl: 'https://api.test',
        httpClient: MockClient((req) async {
          path = req.url.path;
          auth = req.headers['Authorization'];
          return http.Response(
            jsonEncode({
              'slug': 'abc',
              'display_name': 'Loja Teste',
              'handle': 'loja',
              'currency': 'AOA',
              'status': 'ACTIVE',
              'environment': 'SANDBOX',
            }),
            200,
          );
        }),
      )..setToken('t');

      final res = await client.resolveReceivePoint('abc');
      expect(path, '/v1/receive-points/abc');
      expect(auth, isNull, reason: 'resolve is public — no bearer token');
      expect(res.displayName, 'Loja Teste');
      expect(res.handle, 'loja');
      expect(res.isActive, isTrue);
    });
  });

  group('payReceivePoint', () {
    test('POSTs amount + idempotency key and never a payer field', () async {
      String? path;
      Map<String, dynamic>? sent;
      final client = ConsumerPublicClient(
        baseUrl: 'https://api.test',
        httpClient: MockClient((req) async {
          path = req.url.path;
          sent = jsonDecode(req.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({
              'session_id': 'sess-1',
              'amount_minor': 2500,
              'currency': 'AOA',
              'status': 'CREATED',
              'payment_link_slug': 'linkSlug01',
              'pay_url': 'https://pay.banzami.com/pay/linkSlug01',
            }),
            201,
          );
        }),
      )..setToken('consumer.jwt');

      final minted =
          await client.payReceivePoint('abc', amountMinor: 2500, idempotencyKey: 'k1');
      expect(path, '/v1/receive-points/abc/pay');
      expect(sent!['amount_minor'], 2500);
      expect(sent!['idempotency_key'], 'k1');
      // The payer is derived from the session on the server — it is never a field.
      expect(sent!.containsKey('payer_id'), isFalse);
      expect(sent!.containsKey('consumer_id'), isFalse);
      expect(minted.sessionId, 'sess-1');
      expect(minted.paymentLinkSlug, 'linkSlug01');
    });

    test('defaults an idempotency key when the caller omits one', () async {
      Map<String, dynamic>? sent;
      final client = ConsumerPublicClient(
        baseUrl: 'https://api.test',
        httpClient: MockClient((req) async {
          sent = jsonDecode(req.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({'session_id': 's', 'currency': 'AOA', 'status': 'CREATED', 'payment_link_slug': 'x', 'pay_url': ''}),
            201,
          );
        }),
      )..setToken('t');
      await client.payReceivePoint('abc', amountMinor: 100);
      expect((sent!['idempotency_key'] as String).isNotEmpty, isTrue);
    });

    test('a traversal slug cannot reach another endpoint', () async {
      final paths = <String>[];
      final client = ConsumerPublicClient(
        baseUrl: 'https://api.test',
        httpClient: MockClient((req) async {
          paths.add(req.url.path);
          return http.Response('{"code":"NOT_FOUND","message":"x"}', 404);
        }),
      )..setToken('t');
      for (final call in <Future<Object?> Function()>[
        () => client.resolveReceivePoint('../me/wallet'),
        () => client.payReceivePoint('..', amountMinor: 1),
      ]) {
        try {
          await call();
        } catch (_) {}
      }
      for (final p in paths) {
        expect(p.startsWith('/v1/receive-points/'), isTrue, reason: p);
        expect(p.contains('/me/'), isFalse, reason: p);
      }
    });
  });

  group('models tolerate a minimal response', () {
    test('resolution defaults missing fields', () {
      final r = BusinessReceivePointResolution.fromJson({'slug': 's'});
      expect(r.currency, 'AOA');
      expect(r.status, 'ACTIVE');
      expect(r.displayName, '');
    });

    test('minted session requires only a session id', () {
      final m = MintedReceivePointSession.fromJson({'session_id': 's'});
      expect(m.currency, 'AOA');
      expect(m.paymentLinkSlug, '');
    });
  });
}
