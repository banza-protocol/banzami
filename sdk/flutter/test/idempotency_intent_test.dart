import 'dart:async';
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
        // "Pagar …" first; "Verificar" once the answer was lost (a 500).
        await t.tap(find.byType(BanzamiPrimaryButton));
        await t.pump();
        await t.pump(const Duration(milliseconds: 100));
        await t.pumpAndSettle(const Duration(milliseconds: 100));
      }

      expect(keys, hasLength(2));
      expect(keys[0], keys[1]);
    });
  });

  group('lost answers and PAYMENT_NOT_CONFIRMED', () {
    testWidgets('PAYMENT_NOT_CONFIRMED offers a retry of the very same link payment',
        (t) async {
      final bodies = <Map<String, dynamic>>[];
      final paths = <String>[];
      final client = ConsumerPublicClient(
        baseUrl: 'https://api.test',
        httpClient: MockClient((req) async {
          paths.add(req.url.path);
          bodies.add(jsonDecode(req.body) as Map<String, dynamic>);
          return http.Response(
              jsonEncode({'code': 'PAYMENT_NOT_CONFIRMED', 'message': 'x'}), 502);
        }),
      );
      await t.pumpWidget(MaterialApp(
        home: BanzamiPaymentRequestScreen(
          client: client,
          recipientHandle: 'doa',
          recipientDisplayName: 'Doa',
          recipientIsHandle: false,
          paymentLinkSlug: 'abcdef123456',
          amountMinor: 200000,
          onSuccess: (_) {},
        ),
      ));
      await t.pump(const Duration(milliseconds: 600));

      await t.tap(find.textContaining('Pagar'));
      await t.pumpAndSettle();
      expect(find.text(kPaymentNotConfirmedMessage), findsOneWidget);
      expect(find.text('Tentar novamente'), findsOneWidget);

      await t.tap(find.text('Tentar novamente'));
      await t.pumpAndSettle();
      expect(paths, hasLength(2));
      expect(paths[0], paths[1], reason: 'same slug');
      expect(bodies[1], bodies[0], reason: 'same amount, same key');
    });

    test('a request that never answers times out as an unknown outcome', () async {
      final client = ConsumerPublicClient(
        baseUrl: 'https://api.test',
        requestTimeout: const Duration(milliseconds: 50),
        httpClient: MockClient((_) => Completer<http.Response>().future),
      )..setToken('t');
      try {
        await client.sendByHandle(recipientHandle: 'ana', amountMinor: 1, idempotencyKey: 'k');
        fail('expected a timeout');
      } catch (e) {
        expect(e, isA<BanzamiTimeoutException>());
        expect(isOutcomeUnknown(e), isTrue);
        expect(banzamiErrorMessage(e), kBanzamiTimeoutMessage);
      }
    });
  });
}
