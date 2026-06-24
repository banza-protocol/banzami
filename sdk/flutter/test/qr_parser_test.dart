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
      expect(BanzamiQrParser.parse('not-real-payload'), isA<BanzamiQrInvalid>());
    });
  });

  group('BanzamiQrParser — existing formats still parse', () {
    test('handle QR (banza:@handle) still resolves to a handle payment', () {
      final result = BanzamiQrParser.parse('banza:@fm65?amount=5000&currency=AOA');
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
      final result =
          BanzamiQrParser.parse('banzami://pay/split/abc-split-123');
      expect(result, isA<BanzamiQrSplitPayment>());
      expect((result as BanzamiQrSplitPayment).splitId, 'abc-split-123');
    });
  });
}
