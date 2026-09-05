import 'dart:convert';

import 'package:banzami_client/banzami_client.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:test/test.dart';

const _pk = 'bz_test_pk_AAAAAAAA_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

BanzamiClient _client(MockClient mock) => BanzamiClient(
      publishableKey: _pk,
      environment: BanzamiEnvironment.sandbox,
      httpClient: mock,
    );

MockClient _json(Object body,
        {int status = 200, void Function(http.Request)? onRequest}) =>
    MockClient((req) async {
      onRequest?.call(req);
      return http.Response(jsonEncode(body), status,
          headers: {'content-type': 'application/json'});
    });

void main() {
  group('construction refuses what must never ship in an app', () {
    test('a SECRET key is refused before any request', () {
      expect(
        () => BanzamiClient(publishableKey: 'bz_test_sk_AAAA_bbbb'),
        throwsA(isA<BanzamiConfigException>().having((e) => e.message,
            'message', contains('never be compiled into client'))),
      );
    });

    test('an empty key is refused', () {
      expect(() => BanzamiClient(publishableKey: '   '),
          throwsA(isA<BanzamiConfigException>()));
    });

    test('a key from the wrong environment is refused', () {
      expect(
        () => BanzamiClient(
            publishableKey: 'bz_live_pk_AAAA_bbbb',
            environment: BanzamiEnvironment.sandbox),
        throwsA(isA<BanzamiConfigException>()
            .having((e) => e.message, 'message', contains('mismatch'))),
      );
    });

    test('a LIVE client is refused while LIVE is unreleased', () {
      expect(
        () => BanzamiClient(
            publishableKey: 'bz_live_pk_AAAA_bbbb',
            environment: BanzamiEnvironment.live),
        throwsA(isA<BanzamiConfigException>()
            .having((e) => e.message, 'message', contains('not released'))),
      );
    });
  });

  group('the payer-safe checkout', () {
    test('parses the public projection', () async {
      final c = _client(_json({
        'slug': 'abc123def456',
        'merchant_name': 'Loja Exemplo',
        'amount_minor': 25000,
        'currency': 'AOA',
        'description': 'Pedido #1',
        'status': 'ACTIVE',
        'expires_at': null,
        'paid_at': null,
      }));
      final out = await c.checkout('abc123def456');
      expect(out.merchantName, 'Loja Exemplo');
      expect(out.amountMinor, 25000);
      expect(out.isPayable, isTrue);
      expect(out.isPaid, isFalse);
    });

    test('a USED payment reads as paid and not payable', () async {
      final c = _client(_json({
        'slug': 'abc123def456',
        'merchant_name': 'X',
        'currency': 'AOA',
        'status': 'USED',
        'paid_at': '2026-09-05T10:00:00Z',
      }));
      final out = await c.checkout('abc123def456');
      expect(out.isPaid, isTrue);
      expect(out.isPayable, isFalse);
    });

    test('the public read carries NO Authorization header', () async {
      String? auth;
      final c = _client(_json(
        {
          'slug': 'abc123def456',
          'merchant_name': 'X',
          'currency': 'AOA',
          'status': 'ACTIVE'
        },
        onRequest: (r) => auth = r.headers['Authorization'],
      ));
      await c.checkout('abc123def456');
      expect(auth, isNull,
          reason: 'the payer-safe read needs no credential; sending one would '
              'put the key in more logs than necessary');
    });

    test('an authenticated read sends the publishable key', () async {
      String? auth;
      final c = _client(_json(
        {
          'environment': 'SANDBOX',
          'project': 'p',
          'scopes': [],
          'key_status': 'ACTIVE'
        },
        onRequest: (r) => auth = r.headers['Authorization'],
      ));
      await c.identity();
      expect(auth, 'Bearer $_pk');
    });
  });

  group('errors are typed, not string-matched', () {
    Future<void> expectStatus(int status, Matcher matcher) async {
      final c =
          _client(_json({'message': 'nope', 'code': 'X'}, status: status));
      await expectLater(c.checkout('abc123def456'), throwsA(matcher));
    }

    test(
        '401/403 → auth', () => expectStatus(403, isA<BanzamiAuthException>()));
    test('404 → not found',
        () => expectStatus(404, isA<BanzamiNotFoundException>()));
    test('422 → payment state',
        () => expectStatus(422, isA<BanzamiPaymentStateException>()));
    test('429 → rate limit',
        () => expectStatus(429, isA<BanzamiRateLimitException>()));
    test(
        '500 → server', () => expectStatus(500, isA<BanzamiServerException>()));
  });

  group('slugs from untrusted input are validated', () {
    test('a malformed slug never reaches the network', () async {
      var called = false;
      final c = _client(MockClient((_) async {
        called = true;
        return http.Response('{}', 200);
      }));
      for (final bad in ['', '../../etc/passwd', 'a', 'has space', 'x' * 200]) {
        await expectLater(
            c.checkout(bad), throwsA(isA<BanzamiConfigException>()));
      }
      expect(called, isFalse);
    });

    test('a handle is validated before the request', () async {
      final c = _client(_json({'handle': 'x', 'display_name': 'X'}));
      await expectLater(c.resolveHandle('not a handle!'),
          throwsA(isA<BanzamiConfigException>()));
    });
  });

  group('waitUntilPaid', () {
    test('returns true when the payment settles', () async {
      var n = 0;
      final c = _client(MockClient((_) async {
        n++;
        return http.Response(jsonEncode({'paid': n >= 2}), 200,
            headers: {'content-type': 'application/json'});
      }));
      final paid = await c.waitUntilPaid('abc123def456',
          interval: const Duration(milliseconds: 5),
          timeout: const Duration(seconds: 2));
      expect(paid, isTrue);
    });

    test('a dropped poll does not report an unpaid payment', () async {
      var n = 0;
      final c = _client(MockClient((_) async {
        n++;
        if (n == 1) throw Exception('network down');
        return http.Response(jsonEncode({'paid': true}), 200,
            headers: {'content-type': 'application/json'});
      }));
      final paid = await c.waitUntilPaid('abc123def456',
          interval: const Duration(milliseconds: 5),
          timeout: const Duration(seconds: 2));
      expect(paid, isTrue, reason: 'a payer on a phone will drop polls');
    });

    test('gives up at the timeout rather than hanging', () async {
      final c = _client(_json({'paid': false}));
      final paid = await c.waitUntilPaid('abc123def456',
          interval: const Duration(milliseconds: 5),
          timeout: const Duration(milliseconds: 40));
      expect(paid, isFalse);
    });
  });
}
