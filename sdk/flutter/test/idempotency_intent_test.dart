import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:banzami_flutter/banzami_flutter.dart';

void main() {
  group('IdempotencyIntent', () {
    test('the same intent keeps its key until it completes', () {
      var n = 0;
      final intent = IdempotencyIntent(mint: () => 'k${n++}');
      expect(intent.keyFor((500, '@ana')), 'k0');
      expect(intent.keyFor((500, '@ana')), 'k0'); // retry → same key
      expect(intent.keyFor((700, '@ana')), 'k1'); // edited → new intent
      intent.complete();
      expect(intent.current, isNull);
      expect(intent.keyFor((700, '@ana')), 'k2'); // after success → new
    });
  });

  group('BanzamiPaymentRequestScreen', () {
    testWidgets('two submits of one request reuse one idempotency key',
        (t) async {
      final keys = <String>[];
      final client = ConsumerPublicClient(
        baseUrl: 'https://api.test',
        httpClient: MockClient((req) async {
          if (req.url.path == '/v1/transfers') {
            keys.add((jsonDecode(req.body) as Map)['idempotency_key'] as String);
          }
          // The answer is lost / refused — the user taps again.
          return http.Response(
              jsonEncode({'code': 'INTERNAL_ERROR', 'message': 'boom'}), 500);
        }),
      );

      await t.pumpWidget(MaterialApp(
        home: BanzamiPaymentRequestScreen(
          client: client,
          recipientHandle: 'ana',
          amountMinor: 50000,
          onSuccess: (_) {},
        ),
      ));
      await t.pump(const Duration(milliseconds: 600));

      for (var i = 0; i < 2; i++) {
        await t.tap(find.textContaining('Pagar'));
        await t.pump();
        await t.pump(const Duration(milliseconds: 100));
        await t.pumpAndSettle(const Duration(milliseconds: 100));
      }

      expect(keys, hasLength(2));
      expect(keys[0], keys[1]);
    });
  });
}
