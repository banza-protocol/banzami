import 'dart:async';
import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/screens/history_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

Map<String, dynamic> _item(String id, String direction, String handle) => {
      'activity_id': id,
      'item_type': direction == 'INCOMING' ? 'P2P_RECEIVED' : 'P2P_SENT',
      'direction': direction,
      'amount_minor': 100000,
      'currency': 'AOA',
      'status': 'COMPLETED',
      'created_at': DateTime.now().toUtc().toIso8601String(),
      'counterparty_handle': handle,
    };

http.Response _page(List<Map<String, dynamic>> items, {bool more = false}) =>
    http.Response(jsonEncode({'items': items, 'has_more': more, 'next_cursor': more ? 'c2' : null}), 200);

Future<void> _open(WidgetTester t, ConsumerPublicClient client) async {
  await t.binding.setSurfaceSize(const Size(900, 1400));
  addTearDown(() => t.binding.setSurfaceSize(null));
  await t.pumpWidget(Provider<ConsumerPublicClient>.value(
    value: client,
    child: const MaterialApp(home: HistoryScreen()),
  ));
}

void main() {
  setUpAll(() async => initializeDateFormatting('pt_PT'));

  testWidgets('switching the filter mid-load never mixes in the old answer', (t) async {
    final slowAll = Completer<http.Response>();
    final client = ConsumerPublicClient(
      baseUrl: 'https://api.test',
      httpClient: MockClient((req) {
        final dir = req.url.queryParameters['direction'];
        if (dir == null) return slowAll.future; // "Todas" — answers late
        return Future.value(_page([_item('s1', 'OUTGOING', 'bruno')]));
      }),
    );
    await _open(t, client);
    await t.pump();

    await t.tap(find.text('Enviadas'));
    await t.pumpAndSettle();
    expect(find.text('@bruno'), findsOneWidget);

    // The late "Todas" answer arrives after the switch: it must be dropped.
    slowAll.complete(_page([_item('r1', 'INCOMING', 'ana')]));
    await t.pumpAndSettle();
    expect(find.text('@ana'), findsNothing);
    expect(find.text('@bruno'), findsOneWidget);
  });

  testWidgets('a failed next page stops and offers a retry, in Portuguese', (t) async {
    var calls = 0;
    final client = ConsumerPublicClient(
      baseUrl: 'https://api.test',
      httpClient: MockClient((req) async {
        calls++;
        if (req.url.queryParameters['cursor'] == null) {
          return _page([_item('r1', 'INCOMING', 'ana')], more: true);
        }
        return http.Response('{"code":"INTERNAL_ERROR","message":"db down"}', 503);
      }),
    );
    await _open(t, client);
    await t.pumpAndSettle();
    await t.pump(const Duration(seconds: 1));
    await t.pumpAndSettle();

    final afterFailure = calls;
    for (var i = 0; i < 5; i++) {
      await t.pump(const Duration(milliseconds: 100));
    }
    expect(calls, afterFailure, reason: 'no request loop after a failure');
    expect(find.text('Tentar novamente'), findsOneWidget);
    expect(find.textContaining('db down'), findsNothing);
    expect(find.textContaining('temporariamente indisponível'), findsOneWidget);
  });
}
