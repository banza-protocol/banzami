import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:intl/date_symbol_data_local.dart';

// Locks the auto-refresh fix: BanzamiHomeScreen listens to an external refresh
// signal (the app wires WalletRefreshBus to it) and reloads its balance from
// the backend via getBalance() — no pull-to-refresh, no local subtraction.

/// Minimal Listenable the app would back with WalletRefreshBus.
class _Signal extends ChangeNotifier {
  void fire() => notifyListeners();
}

/// Counts balance GETs and returns a backend value that drops after the first
/// load — so a re-fetch is observable and provably comes from the backend.
class _CountingClient extends http.BaseClient {
  int balanceCalls = 0;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final path = request.url.path;
    Map<String, dynamic> body;
    if (path.contains('/wallet/balance')) {
      balanceCalls++;
      final avail = balanceCalls == 1 ? 100000 : 50000; // backend balance after a payment
      body = {
        'wallet_id':      'w-1',
        'consumer_id':    'c-1',
        'currency':       'AOA',
        'available_minor': avail,
        'reserved_minor':  0,
        'total_minor':     avail,
        'computed_at':    '2026-06-25T00:00:00.000Z',
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

void main() {
  setUpAll(() async => initializeDateFormatting('pt', null));

  testWidgets(
    'C/D/E. home reloads balance from the backend when refreshSignal fires',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final httpClient = _CountingClient();
      final client = ConsumerPublicClient(baseUrl: 'http://test', httpClient: httpClient)
        ..setToken('tok');
      final signal = _Signal();

      await tester.pumpWidget(MaterialApp(
        home: BanzamiHomeScreen(
          client:        client,
          consumerId:    'c-1',
          handle:        'fm65',
          environment:   BanzamiEnvironment.production,
          refreshSignal: signal,
        ),
      ));
      await tester.pumpAndSettle();

      // C. initial load fetched the balance once.
      expect(httpClient.balanceCalls, 1, reason: 'initial getBalance');

      // A payment completed on a screen the home did not push → signal.
      signal.fire();
      await tester.pumpAndSettle();

      // D. the home called getBalance again (not a pull-to-refresh, not a
      //    local mutation). E. the new value came from the backend.
      expect(httpClient.balanceCalls, 2,
          reason: 'refreshSignal must trigger a fresh getBalance from the backend');
    },
  );

  testWidgets('home with no refreshSignal still loads once (no crash)',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final httpClient = _CountingClient();
    final client = ConsumerPublicClient(baseUrl: 'http://test', httpClient: httpClient)
      ..setToken('tok');

    await tester.pumpWidget(MaterialApp(
      home: BanzamiHomeScreen(
        client:      client,
        consumerId:  'c-1',
        handle:      'fm65',
        environment: BanzamiEnvironment.production,
      ),
    ));
    await tester.pumpAndSettle();
    expect(httpClient.balanceCalls, 1);
  });
}
