import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:flutter_test/flutter_test.dart';

/// Encodes a JSON object the way the Rust core does: base64url, no padding.
String _structured(Map<String, dynamic> obj) {
  final b64 = base64Url.encode(utf8.encode(jsonEncode(obj)));
  return b64.replaceAll('=', ''); // URL_SAFE_NO_PAD
}

void main() {
  group('BanzamiQrParser — structured QR', () {
    test('static merchant payload resolves to a structured static payment', () {
      final payload = _structured({
        't': 'S',
        'oid': '11111111-1111-1111-1111-111111111111',
        'ot': 'M',
        'c': 'AOA',
      });

      final result = BanzamiQrParser.parse(payload);

      expect(result, isA<BanzamiQrStructuredPayment>());
      final p = result as BanzamiQrStructuredPayment;
      expect(p.isStatic, isTrue);
      expect(p.payload, payload); // forwarded verbatim to /v1/qr/pay
    });

    test('dynamic payload resolves to a structured dynamic payment', () {
      final payload = _structured({
        't': 'D',
        'id': '22222222-2222-2222-2222-222222222222',
        'sig': 'abc123',
      });

      final result = BanzamiQrParser.parse(payload);

      expect(result, isA<BanzamiQrStructuredPayment>());
      expect((result as BanzamiQrStructuredPayment).isStatic, isFalse);
    });

    test('an unknown tag is not treated as a structured payment', () {
      final payload = _structured({'t': 'X', 'foo': 'bar'});
      expect(BanzamiQrParser.parse(payload), isA<BanzamiQrInvalid>());
    });

    test('random base64-looking junk is rejected, not mis-resolved', () {
      expect(
          BanzamiQrParser.parse('not-real-payload'), isA<BanzamiQrInvalid>());
    });
  });

  group('BanzamiQrParser — existing formats still parse', () {
    test('handle QR (banza:@handle) still resolves to a handle payment', () {
      final result =
          BanzamiQrParser.parse('banza:@fm65?amount=5000&currency=AOA');
      expect(result, isA<BanzamiQrHandlePayment>());
      final h = result as BanzamiQrHandlePayment;
      expect(h.handle, 'fm65');
      expect(h.amountMinor, 5000);
    });

    test('pay-link URL still resolves to a payment request', () {
      final result = BanzamiQrParser.parse('https://pay.banzami.com/r/abc123');
      expect(result, isA<BanzamiQrPaymentRequest>());
      expect((result as BanzamiQrPaymentRequest).code, 'abc123');
    });

    test('split deep link resolves to a split payment', () {
      final result = BanzamiQrParser.parse('banzami://pay/split/abc-split-123');
      expect(result, isA<BanzamiQrSplitPayment>());
      expect((result as BanzamiQrSplitPayment).splitId, 'abc-split-123');
    });

    test('bare merchant payment-link slug resolves to a payment link', () {
      final result =
          BanzamiQrParser.parse('https://pay.banzami.com/bb48c6534c86');
      expect(result, isA<BanzamiQrPaymentLink>());
      expect((result as BanzamiQrPaymentLink).slug, 'bb48c6534c86');
    });

    test('/pay/{slug} merchant payment-link resolves to a payment link', () {
      final result =
          BanzamiQrParser.parse('https://pay.banzami.com/pay/bb48c6534c86');
      expect(result, isA<BanzamiQrPaymentLink>());
      expect((result as BanzamiQrPaymentLink).slug, 'bb48c6534c86');
    });

    // Banzami Checkout (checkout-web modal.ts) renders its QR from the deep link
    // `banzami://pay/link/{slug}`. The parser MUST accept it, otherwise scanning a
    // Banzami Checkout QR in the app shows "Formato de link inválido".
    test(
        'checkout deep link banzami://pay/link/{slug} resolves to a payment link',
        () {
      final result = BanzamiQrParser.parse('banzami://pay/link/bb48c6534c86');
      expect(result, isA<BanzamiQrPaymentLink>());
      expect((result as BanzamiQrPaymentLink).slug, 'bb48c6534c86');
    });

    test(
        'sandbox checkout deep link banzami-sandbox://pay/link/{slug} resolves to a payment link',
        () {
      final result =
          BanzamiQrParser.parse('banzami-sandbox://pay/link/bb48c6534c86');
      expect(result, isA<BanzamiQrPaymentLink>());
      expect((result as BanzamiQrPaymentLink).slug, 'bb48c6534c86');
    });

    test('checkout deep link with missing slug is rejected', () {
      expect(BanzamiQrParser.parse('banzami://pay/link/'),
          isA<BanzamiQrInvalid>());
    });

    test('multi-segment unknown pay path is still rejected', () {
      expect(BanzamiQrParser.parse('https://pay.banzami.com/foo/bar/baz'),
          isA<BanzamiQrInvalid>());
    });
  });

  // Regression lock for the banza→banzami brand rename: the generator
  // (receive_hub_screen._qrPayload) emits `banzami:@` / `banzami-sandbox:@` /
  // `banzami(-sandbox)://pay?request=`. The parser MUST resolve exactly those,
  // and the scanner delegates to the parser, so these are what scan-to-pay sees.
  group('BanzamiQrParser — canonical generator output (P2P regression)', () {
    test('live handle QR banzami:@handle resolves (NOT sandbox)', () {
      final r = BanzamiQrParser.parse('banzami:@fm65?amount=5000&currency=AOA');
      expect(r, isA<BanzamiQrHandlePayment>());
      final h = r as BanzamiQrHandlePayment;
      expect(h.handle, 'fm65');
      expect(h.amountMinor, 5000);
      expect(h.isSandbox, isFalse);
    });

    test('sandbox handle QR banzami-sandbox:@handle resolves AS sandbox', () {
      final r = BanzamiQrParser.parse('banzami-sandbox:@fm65');
      expect(r, isA<BanzamiQrHandlePayment>());
      final h = r as BanzamiQrHandlePayment;
      expect(h.handle, 'fm65');
      expect(h.isSandbox, isTrue);
    });

    test('live payment-request QR banzami://pay?request resolves', () {
      final r = BanzamiQrParser.parse('banzami://pay?request=REQ123');
      expect(r, isA<BanzamiQrPaymentRequest>());
      final p = r as BanzamiQrPaymentRequest;
      expect(p.code, 'REQ123');
      expect(p.isSandbox, isFalse);
    });

    test(
        'sandbox payment-request QR banzami-sandbox://pay?request resolves AS sandbox',
        () {
      final r = BanzamiQrParser.parse('banzami-sandbox://pay?request=REQ123');
      expect(r, isA<BanzamiQrPaymentRequest>());
      expect((r as BanzamiQrPaymentRequest).isSandbox, isTrue);
    });

    test(
        'legacy banza-sandbox:@handle still resolves (printed QRs in circulation)',
        () {
      final r = BanzamiQrParser.parse('banza-sandbox:@fm65');
      expect(r, isA<BanzamiQrHandlePayment>());
      expect((r as BanzamiQrHandlePayment).isSandbox, isTrue);
    });

    test('malformed/unknown QR is safely rejected (no crash, no payment)', () {
      expect(BanzamiQrParser.parse('garbage://nope'), isA<BanzamiQrInvalid>());
      expect(BanzamiQrParser.parse(''), isA<BanzamiQrInvalid>());
      expect(BanzamiQrParser.parse('a' * 600), isA<BanzamiQrInvalid>());
    });
  });

  // The single-source-of-truth guarantee: every link the generators emit through
  // BanzamiQrScheme MUST be accepted by the parser as the right type. If a builder
  // and the parser ever drift, one of these fails — the drift can't ship silently.
  group('BanzamiQrScheme — generator output round-trips through the parser',
      () {
    test('handle (live) resolves to a handle payment, not sandbox', () {
      final r = BanzamiQrParser.parse(
          BanzamiQrScheme.handle('fm65', isSandbox: false));
      expect(r, isA<BanzamiQrHandlePayment>());
      final h = r as BanzamiQrHandlePayment;
      expect(h.handle, 'fm65');
      expect(h.isSandbox, isFalse);
    });

    test('handle (sandbox) resolves AS sandbox', () {
      final r = BanzamiQrParser.parse(
          BanzamiQrScheme.handle('fm65', isSandbox: true));
      expect((r as BanzamiQrHandlePayment).isSandbox, isTrue);
    });

    test('paymentRequest (live) resolves to a payment request', () {
      final r = BanzamiQrParser.parse(
          BanzamiQrScheme.paymentRequest('REQ1', isSandbox: false));
      expect(r, isA<BanzamiQrPaymentRequest>());
      final p = r as BanzamiQrPaymentRequest;
      expect(p.code, 'REQ1');
      expect(p.isSandbox, isFalse);
    });

    test('paymentRequest (sandbox) resolves AS sandbox', () {
      final r = BanzamiQrParser.parse(
          BanzamiQrScheme.paymentRequest('REQ1', isSandbox: true));
      expect((r as BanzamiQrPaymentRequest).isSandbox, isTrue);
    });

    test('payLink resolves to a payment link', () {
      final r = BanzamiQrParser.parse(BanzamiQrScheme.payLink('slug123'));
      expect(r, isA<BanzamiQrPaymentLink>());
      expect((r as BanzamiQrPaymentLink).slug, 'slug123');
    });

    test('split resolves to a split payment (matches the core emission)', () {
      final r = BanzamiQrParser.parse(BanzamiQrScheme.split('split-7'));
      expect(r, isA<BanzamiQrSplitPayment>());
      expect((r as BanzamiQrSplitPayment).splitId, 'split-7');
    });

    test('emitted schemes are always canonical, never legacy', () {
      expect(BanzamiQrScheme.handle('x', isSandbox: false),
          startsWith('banzami:@'));
      expect(BanzamiQrScheme.handle('x', isSandbox: true),
          startsWith('banzami-sandbox:@'));
      expect(BanzamiQrScheme.paymentRequest('c', isSandbox: false),
          startsWith('banzami://'));
      expect(BanzamiQrScheme.payLink('s'), startsWith('banzami://pay/link/'));
      for (final emitted in [
        BanzamiQrScheme.handle('x', isSandbox: false),
        BanzamiQrScheme.handle('x', isSandbox: true),
        BanzamiQrScheme.paymentRequest('c', isSandbox: false),
        BanzamiQrScheme.payLink('s'),
        BanzamiQrScheme.split('id'),
      ]) {
        expect(
            emitted.startsWith('banza:') ||
                emitted.startsWith('banza-sandbox:'),
            isFalse,
            reason:
                'generators must never emit the legacy banza scheme: $emitted');
      }
    });
  });
}
