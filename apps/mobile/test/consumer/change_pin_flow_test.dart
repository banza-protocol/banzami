import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import 'package:banzami_mobile/screens/change_pin_screen.dart';

// "Alterar PIN" collects current → new → confirm and POSTs to /v1/me/pin with
// the current + new PIN. The wrong-current-PIN (403) error returns to the start.
void main() {
  Future<void> tapPin(WidgetTester t, String pin) async {
    for (final d in pin.split('')) {
      await t.tap(find.text(d));
      await t.pump();
    }
    await t.pumpAndSettle();
  }

  testWidgets('change PIN posts current + new to /v1/me/pin', (t) async {
    http.Request? captured;
    final client = ConsumerPublicClient(
      baseUrl: 'http://test',
      httpClient: MockClient((req) async {
        captured = req;
        return http.Response(jsonEncode({'status': 'changed', 'token': 'new.jwt'}), 200,
            headers: {'content-type': 'application/json'});
      }),
    )..setToken('old.jwt');

    await t.pumpWidget(Provider<ConsumerPublicClient>.value(
      value: client,
      child: const MaterialApp(home: ChangePinScreen()),
    ));
    await t.pumpAndSettle();

    expect(find.text('PIN atual'), findsOneWidget);
    await tapPin(t, '123456'); // current
    await tapPin(t, '654321'); // new
    await tapPin(t, '654321'); // confirm → submit

    expect(captured, isNotNull);
    expect(captured!.url.path, '/v1/me/pin');
    expect(jsonDecode(captured!.body), {'current_pin': '123456', 'new_pin': '654321'});
    expect(captured!.headers['Idempotency-Key'], isNotNull);
  });

  testWidgets('a wrong current PIN (403) returns to the current-PIN step', (t) async {
    final client = ConsumerPublicClient(
      baseUrl: 'http://test',
      httpClient: MockClient((req) async => http.Response(
          jsonEncode({'error': {'code': 'REAUTH_REQUIRED', 'message': 'current PIN is incorrect'}}),
          403,
          headers: {'content-type': 'application/json'})),
    )..setToken('old.jwt');

    await t.pumpWidget(Provider<ConsumerPublicClient>.value(
      value: client,
      child: const MaterialApp(home: ChangePinScreen()),
    ));
    await t.pumpAndSettle();

    await tapPin(t, '000000');
    await tapPin(t, '654321');
    await tapPin(t, '654321');

    // Back at the start with the error surfaced.
    expect(find.text('PIN atual'), findsOneWidget);
    expect(find.textContaining('incorreto'), findsOneWidget);
  });
}
