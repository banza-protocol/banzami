@Tags(['e2e'])
library;

import 'dart:io';

import 'package:banzami_client/banzami_client.dart';
import 'package:http/http.dart' as http;
import 'package:test/test.dart';

/// Against the DEPLOYED Sandbox, with a real publishable key.
///
/// Two halves, and the second matters more: what the key CAN do, and what it
/// cannot. A client credential is only safe if the operator refuses it on the
/// routes that move money — this asserts that refusal rather than trusting it.
///
///   BANZAMI_PUBLISHABLE_KEY=bz_test_pk_... BANZAMI_SLUG=<slug> dart test -t e2e
void main() {
  final key = Platform.environment['BANZAMI_PUBLISHABLE_KEY'];
  final slug = Platform.environment['BANZAMI_SLUG'];
  if (key == null || slug == null) {
    test('skipped — no key/slug in the environment', () {},
        skip: 'set BANZAMI_PUBLISHABLE_KEY and BANZAMI_SLUG');
    return;
  }

  final banzami = BanzamiClient(publishableKey: key);
  const api = 'https://sandbox-api.banzami.com';

  tearDownAll(banzami.close);

  group('what a publishable key CAN do', () {
    test('identity resolves and reports SANDBOX', () async {
      final me = await banzami.identity();
      expect(me.environment, 'SANDBOX');
      expect(me.isActive, isTrue);
    });

    test('the payer-safe checkout resolves', () async {
      final c = await banzami.checkout(slug);
      expect(c.slug, slug);
      expect(c.merchantName, isNotEmpty);
      expect(c.currency, 'AOA');
    });

    test('status resolves', () async {
      await banzami.checkoutStatus(slug); // shape, not value
    });

    test('the checkout URL is the public hosted surface, and it answers',
        () async {
      final url = banzami.checkoutUrl(slug);
      expect(url, 'https://pay.banzami.com/pay/$slug');
      final res = await http.get(Uri.parse(url));
      expect(res.statusCode, 200);
    });
  });

  group('what a publishable key must NOT do', () {
    Future<int> post(String path, Object body) async {
      final res = await http.post(
        Uri.parse('$api$path'),
        headers: {
          'Authorization': 'Bearer $key',
          'Content-Type': 'application/json'
        },
        body: body is String ? body : '$body',
      );
      return res.statusCode;
    }

    test('it cannot create a payment', () async {
      expect(
          await post('/v1/payment-sessions',
              '{"purpose":"ORDER","amount_minor":1000,"currency":"AOA"}'),
          403);
    });

    test('it cannot transfer', () async {
      expect(
          await post('/v1/transfers',
              '{"source_wallet_account_id":"a","destination_wallet_account_id":"b","amount_minor":1,"currency":"AOA","idempotency_key":"k"}'),
          403);
    });

    test('it cannot refund', () async {
      expect(
          await post('/v1/refunds',
              '{"source_type":"WALLET_PAYMENT","source_id":"x","amount_minor":1,"currency":"AOA","idempotency_key":"k"}'),
          403);
    });

    test('it cannot open a wallet account', () async {
      expect(
          await post('/v1/wallet-accounts',
              '{"purpose":"CAMPAIGN","reference_type":"X","reference_id":"y"}'),
          403);
    });

    test('it cannot manage webhooks', () async {
      expect(
          await post('/v1/webhooks/endpoints',
              '{"url":"https://x.example","events":["payment_session.paid"]}'),
          403);
    });

    test('it cannot list the owner\'s accounts', () async {
      final res = await http.get(Uri.parse('$api/v1/wallet-accounts'),
          headers: {'Authorization': 'Bearer $key'});
      expect(res.statusCode, 403);
    });
  });
}
