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
  /// Answers /sandbox/fund with the pilot-cap refusal.
  final bool pilotCapReached;
  /// Fails the first balance read with a 503, then answers normally.
  bool failFirstBalance;
  _HomeHttpClient({this.pilotCapReached = false, this.failFirstBalance = false});

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final path = request.url.path;
    Map<String, dynamic> body;
    var status = 200;
    if (path.contains('/sandbox/fund') && pilotCapReached) {
      status = 422;
      body = {
        'code': 'PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED',
        'message': 'the Sandbox refused this top-up: PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED',
      };
    } else if (path.contains('/wallet/balance') && failFirstBalance) {
      failFirstBalance = false;
      status = 503;
      body = {'code': 'INTERNAL_ERROR', 'message': 'could not compute balance'};
    } else if (path.contains('/wallet/balance')) {
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
      status,
      headers: {'content-type': 'application/json'},
    );
  }
}

ConsumerPublicClient _client([_HomeHttpClient? http]) =>
    ConsumerPublicClient(baseUrl: 'http://test', httpClient: http ?? _HomeHttpClient())
      ..setToken('tok');

Widget _home(BanzamiEnvironment env, {_HomeHttpClient? http, ValueNotifier<int>? refresh}) => MaterialApp(
      home: BanzamiHomeScreen(
        client:      _client(http),
        refreshSignal: refresh,
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

  testWidgets('the pilot test-funds cap is said as such, not "Erro ao adicionar fundos"', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(_home(BanzamiEnvironment.sandbox,
        http: _HomeHttpClient(pilotCapReached: true)));
    await _settle(tester);
    await tester.tap(find.text('Toque para adicionar dinheiro de teste'));
    await _settle(tester);
    await tester.tap(find.text('Adicionar ao saldo'));
    await _settle(tester);

    expect(find.textContaining('limite total de fundos de teste'), findsOneWidget);
    expect(find.text('Erro ao adicionar fundos'), findsNothing);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('a balance error clears after a successful reload', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final refresh = ValueNotifier<int>(0);

    await tester.pumpWidget(_home(BanzamiEnvironment.production,
        http: _HomeHttpClient(failFirstBalance: true), refresh: refresh));
    await _settle(tester);
    expect(find.textContaining('temporariamente indisponível'), findsOneWidget);

    refresh.value++; // e.g. a payment completed elsewhere → reload
    await _settle(tester);
    expect(find.textContaining('temporariamente indisponível'), findsNothing);
  });
}
