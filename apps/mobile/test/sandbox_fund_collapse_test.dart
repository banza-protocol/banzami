import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:intl/date_symbol_data_local.dart';

// Locks the collapsible sandbox "Adicionar dinheiro de teste" panel:
//   - sandbox: starts collapsed as a discreet bar; expands on tap,
//   - production: the panel does not exist at all.

class _HomeHttpClient extends http.BaseClient {
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final path = request.url.path;
    Map<String, dynamic> body;
    if (path.contains('/wallet/balance')) {
      body = {
        'wallet_id': 'w', 'consumer_id': 'c', 'currency': 'AOA',
        'available_minor': 355000, 'reserved_minor': 0, 'total_minor': 355000,
        'computed_at': '2026-06-25T00:00:00.000Z',
      };
    } else if (path.contains('/activity')) {
      body = {'items': <dynamic>[], 'next_cursor': null, 'has_more': false};
    } else {
      body = <String, dynamic>{};
    }
    return http.StreamedResponse(
      Stream.value(utf8.encode(jsonEncode(body))),
      200,
      headers: {'content-type': 'application/json'},
    );
  }
}

ConsumerPublicClient _client() =>
    ConsumerPublicClient(baseUrl: 'http://test', httpClient: _HomeHttpClient())
      ..setToken('tok');

Widget _home(BanzamiEnvironment env) => MaterialApp(
      home: BanzamiHomeScreen(
        client:      _client(),
        consumerId:  'c',
        handle:      'joao',
        environment: env,
      ),
    );

/// Pump a few frames so the initial load + entry animation render. We avoid
/// pumpAndSettle() because the sandbox banner glow animates indefinitely.
Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}

void main() {
  setUpAll(() async => initializeDateFormatting('pt', null));

  testWidgets('sandbox: panel starts collapsed, expands on tap', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(_home(BanzamiEnvironment.sandbox));
    await _settle(tester);

    // Collapsed: discreet bar shown, full controls hidden.
    expect(find.text('Adicionar dinheiro de teste'), findsOneWidget);
    expect(find.text('Toque para adicionar dinheiro de teste'), findsOneWidget);
    expect(find.text('Adicionar ao saldo'), findsNothing);
    expect(find.text('Valor atual'),        findsNothing);

    // Tap the bar → expands.
    await tester.tap(find.text('Toque para adicionar dinheiro de teste'));
    await _settle(tester);

    expect(find.text('Adicionar ao saldo'), findsOneWidget);
    expect(find.text('Valor atual'),        findsOneWidget);
    expect(find.text('Crédito instantâneo sandbox'), findsOneWidget);
  });

  testWidgets('production: the sandbox funding panel does not exist', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(_home(BanzamiEnvironment.production));
    await _settle(tester);

    expect(find.text('Adicionar dinheiro de teste'), findsNothing);
    expect(find.text('Toque para adicionar dinheiro de teste'), findsNothing);
    expect(find.text('Adicionar ao saldo'), findsNothing);
  });
}
