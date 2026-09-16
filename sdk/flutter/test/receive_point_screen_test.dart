import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_flutter/screens/receive_point_screen.dart';

ConsumerPublicClient _clientReturning(http.Response Function(http.Request) fn) =>
    ConsumerPublicClient(
      baseUrl: 'https://api.test',
      httpClient: MockClient((req) async => fn(req)),
    );

Future<void> _pump(WidgetTester t, Widget screen) async {
  await t.pumpWidget(MaterialApp(home: screen));
  await t.pump(const Duration(milliseconds: 600));
}

void main() {
  testWidgets('resolves and shows the payer-safe Business identity', (t) async {
    final client = _clientReturning((req) => http.Response(
          jsonEncode({
            'slug': 'abc',
            'display_name': 'Loja Teste',
            'handle': 'loja',
            'currency': 'AOA',
            'status': 'ACTIVE',
            'environment': 'SANDBOX',
          }),
          200,
        ));
    await _pump(
      t,
      BanzamiReceivePointScreen(client: client, slug: 'abc', onSuccess: (_) {}),
    );
    expect(find.text('Loja Teste'), findsOneWidget);
    expect(find.text('@loja'), findsOneWidget);
    expect(find.text('Continuar'), findsOneWidget);
  });

  testWidgets('a not-found receive point fails closed with a clear message',
      (t) async {
    final client = _clientReturning((_) =>
        http.Response('{"code":"RECEIVE_POINT_NOT_FOUND","message":"x"}', 404));
    await _pump(
      t,
      BanzamiReceivePointScreen(client: client, slug: 'nope', onSuccess: (_) {}),
    );
    expect(find.textContaining('não foi encontrado'), findsOneWidget);
    // A 404 is not retryable — only "Voltar".
    expect(find.text('Tentar novamente'), findsNothing);
    expect(find.text('Continuar'), findsNothing);
  });

  testWidgets('a resolved-but-inactive Business is never shown as payable',
      (t) async {
    final client = _clientReturning((_) => http.Response(
          jsonEncode({
            'slug': 'abc',
            'display_name': 'Loja Teste',
            'handle': 'loja',
            'currency': 'AOA',
            'status': 'DISABLED',
            'environment': 'SANDBOX',
          }),
          200,
        ));
    await _pump(
      t,
      BanzamiReceivePointScreen(client: client, slug: 'abc', onSuccess: (_) {}),
    );
    expect(find.text('Continuar'), findsNothing);
    expect(find.textContaining('não pode receber'), findsOneWidget);
  });
}
