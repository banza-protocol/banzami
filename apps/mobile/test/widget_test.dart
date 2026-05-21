import 'dart:async';
import 'dart:convert';

import 'package:banza_flutter/banza_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:intl/date_symbol_data_local.dart';

// ---------------------------------------------------------------------------
// Transfer fixture
// ---------------------------------------------------------------------------

final _kTransfer = <String, dynamic>{
  'transfer_id':  'abc12345-dead-beef-0000-000000000000',
  'sender':       'fm65',
  'recipient':    'joao',
  'amount_minor': 100000,
  'currency':     'AOA',
  'status':       'COMPLETED',
  'note':         'jantar',
  'created_at':   '2026-05-21T12:00:00.000Z',
  'completed_at': '2026-05-21T12:00:00.100Z',
  'trace_id':     'trace-001',
};

// ---------------------------------------------------------------------------
// Client factories
// ---------------------------------------------------------------------------

ConsumerPublicClient _clientWith(http.Client httpClient) =>
    ConsumerPublicClient(baseUrl: 'http://test', httpClient: httpClient)
      ..setToken('tok');

ConsumerPublicClient _successClient() =>
    _clientWith(_FixedHttpClient(body: _kTransfer));

ConsumerPublicClient _apiErrorClient(String code, [int status = 422]) =>
    _clientWith(_FixedHttpClient(
      body:       {'code': code, 'message': code},
      statusCode: status,
    ));

ConsumerPublicClient _networkErrorClient() => _clientWith(_ThrowingHttpClient());

// ---------------------------------------------------------------------------
// Widget wrappers
// ---------------------------------------------------------------------------

Widget _wrap(Widget child) => MaterialApp(home: child);

/// Wraps [child] inside a Navigator with a real previous route so that
/// Navigator.pop() has somewhere to go when testing the cancel button.
Widget _wrapPushable(Widget Function(BuildContext) builder) => MaterialApp(
      home: Builder(
        builder: (ctx) => ElevatedButton(
          onPressed: () => Navigator.of(ctx)
              .push(MaterialPageRoute(builder: builder)),
          child: const Text('open'),
        ),
      ),
    );

// ---------------------------------------------------------------------------
// Shared confirm-screen factory
// ---------------------------------------------------------------------------

BanzamiConfirmScreen _confirmScreen({
  ConsumerPublicClient? client,
  void Function(Transfer)? onSuccess,
  String? note,
  String recipientDisplayName = 'João Silva',
}) =>
    BanzamiConfirmScreen(
      client:               client ?? _successClient(),
      recipientHandle:      'joao',
      recipientDisplayName: recipientDisplayName,
      amountMinor:          100000,
      currency:             'AOA',
      note:                 note,
      idempotencyKey:       'test-idem-key',
      ownHandle:            'fm65',
      onSuccess:            onSuccess ?? (_) {},
    );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  setUpAll(() async => initializeDateFormatting('pt', null));

  // ── BanzamiConfirmScreen ─────────────────────────────────────────────────

  group('BanzamiConfirmScreen', () {
    testWidgets('renders recipient name, handle, amount and buttons',
        (tester) async {
      await tester.pumpWidget(_wrap(_confirmScreen()));

      expect(find.text('João Silva'), findsOneWidget);
      expect(find.text('@joao'),     findsOneWidget);
      expect(find.text('Confirmar'), findsOneWidget);
      expect(find.text('Cancelar'),  findsOneWidget);
    });

    testWidgets('shows note chip when note is provided', (tester) async {
      await tester
          .pumpWidget(_wrap(_confirmScreen(note: 'jantar de ontem')));
      expect(find.text('jantar de ontem'), findsOneWidget);
    });

    testWidgets('hides note chip when note is null', (tester) async {
      await tester.pumpWidget(_wrap(_confirmScreen(note: null)));
      expect(find.text('jantar de ontem'), findsNothing);
    });

    testWidgets('Cancelar pops back to the previous route', (tester) async {
      await tester.pumpWidget(_wrapPushable(
        (_) => _confirmScreen(),
      ));

      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      expect(find.text('Cancelar'), findsOneWidget);
      await tester.tap(find.text('Cancelar'));
      await tester.pumpAndSettle();

      expect(find.text('open'),     findsOneWidget);
      expect(find.text('Cancelar'), findsNothing);
    });

    testWidgets('Confirmar shows spinner while request is in flight',
        (tester) async {
      final completer = Completer<http.StreamedResponse>();
      final c = _clientWith(_ManualHttpClient(completer.future));

      await tester.pumpWidget(_wrap(_confirmScreen(client: c)));
      await tester.tap(find.text('Confirmar'));
      await tester.pump(); // process tap, don't await async

      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      // Resolve to avoid pending-async warnings
      completer.complete(http.StreamedResponse(
        Stream.value(utf8.encode(jsonEncode(_kTransfer))),
        200,
        headers: {'content-type': 'application/json'},
      ));
      await tester.pumpAndSettle();
    });

    testWidgets('button is disabled while in-flight (anti-double-submit)',
        (tester) async {
      int callCount = 0;
      final completer = Completer<http.StreamedResponse>();
      final c = _clientWith(
          _ManualHttpClient(completer.future, onCall: () => callCount++));

      await tester.pumpWidget(_wrap(_confirmScreen(client: c)));
      await tester.tap(find.text('Confirmar'));
      await tester.pump();

      // Label disappears and spinner appears — button is disabled
      expect(find.text('Confirmar'),           findsNothing);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      completer.complete(http.StreamedResponse(
        Stream.value(utf8.encode(jsonEncode(_kTransfer))),
        200,
        headers: {'content-type': 'application/json'},
      ));
      await tester.pumpAndSettle();

      // Only one API call was made
      expect(callCount, 1);
    });

    testWidgets('INSUFFICIENT_FUNDS shows Portuguese error message',
        (tester) async {
      await tester.pumpWidget(
          _wrap(_confirmScreen(client: _apiErrorClient('INSUFFICIENT_FUNDS'))));
      await tester.tap(find.text('Confirmar'));
      await tester.pumpAndSettle();
      expect(
        find.text('Saldo insuficiente para esta transferência.'),
        findsOneWidget,
      );
    });

    testWidgets('RECIPIENT_NOT_FOUND includes handle in message',
        (tester) async {
      await tester.pumpWidget(_wrap(
          _confirmScreen(client: _apiErrorClient('RECIPIENT_NOT_FOUND'))));
      await tester.tap(find.text('Confirmar'));
      await tester.pumpAndSettle();
      expect(find.textContaining('@joao não encontrado'), findsOneWidget);
    });

    testWidgets('network failure shows connection error message',
        (tester) async {
      await tester
          .pumpWidget(_wrap(_confirmScreen(client: _networkErrorClient())));
      await tester.tap(find.text('Confirmar'));
      await tester.pumpAndSettle();
      expect(find.textContaining('ligação'), findsOneWidget);
    });
  });

  // ── BanzamiReceiptScreen ─────────────────────────────────────────────────

  group('BanzamiReceiptScreen', () {
    final transfer = Transfer.fromJson(_kTransfer);

    testWidgets('renders success header and action button', (tester) async {
      await tester.pumpWidget(_wrap(BanzamiReceiptScreen(
        transfer:  transfer,
        ownHandle: 'fm65',
        onDone:    (_) {},
      )));
      expect(find.text('Enviado com sucesso'), findsOneWidget);
      expect(find.text('Concluído'),           findsOneWidget);
    });

    testWidgets('shows recipient handle in details card', (tester) async {
      await tester.pumpWidget(_wrap(BanzamiReceiptScreen(
        transfer:  transfer,
        ownHandle: 'fm65',
        onDone:    (_) {},
      )));
      expect(find.textContaining('@joao'), findsOneWidget);
    });

    testWidgets('shows note when transfer has a note', (tester) async {
      await tester.pumpWidget(_wrap(BanzamiReceiptScreen(
        transfer:  transfer,
        ownHandle: 'fm65',
        onDone:    (_) {},
      )));
      expect(find.text('jantar'), findsOneWidget);
    });

    testWidgets('shows abbreviated 8-char ref uppercased', (tester) async {
      await tester.pumpWidget(_wrap(BanzamiReceiptScreen(
        transfer:  transfer,
        ownHandle: 'fm65',
        onDone:    (_) {},
      )));
      expect(find.text('ABC12345'), findsOneWidget);
    });

    testWidgets('Concluído invokes onDone with the completed transfer',
        (tester) async {
      Transfer? received;
      await tester.pumpWidget(_wrap(BanzamiReceiptScreen(
        transfer:  transfer,
        ownHandle: 'fm65',
        onDone:    (t) => received = t,
      )));
      await tester.tap(find.text('Concluído'));
      await tester.pumpAndSettle();
      expect(received?.transferId, equals(transfer.transferId));
    });
  });
}

// ---------------------------------------------------------------------------
// HTTP client fakes
// ---------------------------------------------------------------------------

/// Always responds with a fixed JSON body and status code.
class _FixedHttpClient extends http.BaseClient {
  final Map<String, dynamic> body;
  final int statusCode;

  _FixedHttpClient({required this.body, this.statusCode = 200});

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async =>
      http.StreamedResponse(
        Stream.value(utf8.encode(jsonEncode(body))),
        statusCode,
        headers: {'content-type': 'application/json'},
      );
}

/// Resolves only when the provided [Future] completes — lets tests control timing.
class _ManualHttpClient extends http.BaseClient {
  final Future<http.StreamedResponse> _response;
  final void Function()? onCall;

  _ManualHttpClient(this._response, {this.onCall});

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    onCall?.call();
    return _response;
  }
}

/// Always throws, simulating a network failure.
class _ThrowingHttpClient extends http.BaseClient {
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) =>
      Future.error(Exception('Connection refused'));
}
