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
}
