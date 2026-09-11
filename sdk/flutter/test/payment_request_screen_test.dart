import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:banzami_flutter/banzami_flutter.dart';

final _client = ConsumerPublicClient(
  baseUrl: 'https://api.test',
  httpClient: MockClient((_) async => http.Response('{}', 500)),
);

Future<void> _pump(WidgetTester t, Widget screen) async {
  await t.pumpWidget(MaterialApp(home: screen));
  await t.pump(const Duration(milliseconds: 600));
}

void main() {
  testWidgets('a Business without an @handle is never shown as "@name"', (t) async {
    await _pump(
      t,
      BanzamiPaymentRequestScreen(
        client: _client,
        recipientHandle: 'Doa',
        recipientDisplayName: 'Doa',
        recipientIsHandle: false,
        paymentLinkSlug: 'abc',
        amountMinor: 100000,
        onSuccess: (_) {},
      ),
    );
    expect(find.text('Doa'), findsOneWidget);
    expect(find.textContaining('@Doa'), findsNothing);
  });

  testWidgets('a Business with an @handle shows it as the subtitle', (t) async {
    await _pump(
      t,
      BanzamiPaymentRequestScreen(
        client: _client,
        recipientHandle: 'doa',
        recipientDisplayName: 'Doa',
        recipientSubtitle: '@doa',
        recipientIsHandle: false,
        paymentLinkSlug: 'abc',
        amountMinor: 100000,
        onSuccess: (_) {},
      ),
    );
    expect(find.text('Doa'), findsOneWidget);
    expect(find.text('@doa'), findsOneWidget);
  });

  testWidgets('a malformed link with an empty @handle does not crash', (t) async {
    await _pump(
      t,
      BanzamiPaymentRequestScreen(
        client: _client,
        recipientHandle: '',
        amountMinor: 50000,
        onSuccess: (_) {},
      ),
    );
    expect(t.takeException(), isNull);
  });

  group('BanzamiPaymentLinkScreen load failures', () {
    Future<void> open(WidgetTester t, int status) async {
      final client = ConsumerPublicClient(
        baseUrl: 'https://api.test',
        httpClient: MockClient((_) async =>
            http.Response('{"code":"X","message":"boom"}', status)),
      );
      await t.pumpWidget(MaterialApp(
        home: BanzamiPaymentLinkScreen(client: client, slug: 'abcdef123456', onSuccess: (_) {}),
      ));
      await t.pumpAndSettle();
    }

    testWidgets('an outage is not "não encontrado", and can be retried', (t) async {
      await open(t, 503);
      expect(find.textContaining('não encontrado'), findsNothing);
      expect(find.textContaining('temporariamente indisponível'), findsOneWidget);
      expect(find.text('Tentar novamente'), findsOneWidget);
    });

    testWidgets('a 404 is "não encontrado", with no retry', (t) async {
      await open(t, 404);
      expect(find.text('Link de pagamento não encontrado.'), findsOneWidget);
      expect(find.text('Tentar novamente'), findsNothing);
    });
  });
}
