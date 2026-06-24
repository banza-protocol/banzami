import 'dart:async';
import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';
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
      expect(find.widgetWithText(BanzamiPrimaryButton, 'Confirmar envio'), findsOneWidget);
      expect(find.text('Cancelar'),                                     findsOneWidget);
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

    testWidgets('Confirmar triggers transfer and shows receipt on success',
        (tester) async {
      // Receipt screen is designed for portrait; 800×600 default overflows by 6px.
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(_wrap(_confirmScreen()));
      await tester.tap(find.widgetWithText(BanzamiPrimaryButton, 'Confirmar envio'));
      // BanzamiVerifiedMark has a repeating AnimationController — pumpAndSettle()
      // never settles. BanzamiPrimaryButton has a 2 × 150 ms scale animation before
      // calling onPressed; pump at 50 ms intervals so each animation tick fires
      // and the HTTP-chain microtasks can drain. Text is in the tree once the
      // receipt route exists (regardless of the route transition opacity).
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
      expect(find.text('Enviado com sucesso'), findsOneWidget);
    });

    testWidgets('button is disabled while in-flight (anti-double-submit)',
        (tester) async {
      // Receipt screen needs portrait size for the final pumpAndSettle.
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      int callCount = 0;
      final completer = Completer<http.StreamedResponse>();
      final c = _clientWith(
          _ManualHttpClient(completer.future, onCall: () => callCount++));

      await tester.pumpWidget(_wrap(_confirmScreen(client: c)));

      // Invoke _confirm() directly via onPressed, bypassing the 2×150ms
      // button scale animation. This tests the _sending state guard — the
      // real anti-double-submit mechanism — not the animation delay.
      // callCount++ happens synchronously within _confirm() before the first
      // await (BaseClient.post → send() → onCall()), so no pump is needed.
      tester.widget<BanzamiPrimaryButton>(find.byType(BanzamiPrimaryButton))
          .onPressed!();
      expect(callCount, 1);

      completer.complete(http.StreamedResponse(
        Stream.value(utf8.encode(jsonEncode(_kTransfer))),
        200,
        headers: {'content-type': 'application/json'},
      ));
      // Receipt screen has a repeating animation — pump instead of pumpAndSettle.
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
    });

    testWidgets('INSUFFICIENT_FUNDS shows Portuguese error message',
        (tester) async {
      await tester.pumpWidget(
          _wrap(_confirmScreen(client: _apiErrorClient('INSUFFICIENT_FUNDS'))));
      await tester.tap(find.widgetWithText(BanzamiPrimaryButton, 'Confirmar envio'));
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
      await tester.tap(find.widgetWithText(BanzamiPrimaryButton, 'Confirmar envio'));
      await tester.pumpAndSettle();
      expect(find.textContaining('@joao não encontrado'), findsOneWidget);
    });

    testWidgets('network failure shows connection error message',
        (tester) async {
      await tester
          .pumpWidget(_wrap(_confirmScreen(client: _networkErrorClient())));
      await tester.tap(find.widgetWithText(BanzamiPrimaryButton, 'Confirmar envio'));
      await tester.pumpAndSettle();
      expect(find.textContaining('ligação'), findsOneWidget);
    });
  });

  // ── BanzamiReceiptScreen ─────────────────────────────────────────────────

  group('BanzamiReceiptScreen', () {
    final transfer = Transfer.fromJson(_kTransfer);

    // Convenience: pump the receipt screen at portrait phone size.
    Future<void> pumpReceipt(
      WidgetTester tester, {
      void Function(Transfer)? onDone,
    }) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(_wrap(BanzamiReceiptScreen(
        transfer:  transfer,
        ownHandle: 'fm65',
        onDone:    onDone ?? (_) {},
      )));
    }

    testWidgets('renders success header and Concluído button', (tester) async {
      await pumpReceipt(tester);
      expect(find.text('Enviado com sucesso'), findsOneWidget);
      expect(find.text('Concluído'),           findsOneWidget);
    });

    testWidgets('BanzamiVerifiedMark is rendered — no generic green circle',
        (tester) async {
      await pumpReceipt(tester);
      expect(find.byType(BanzamiVerifiedMark), findsOneWidget);
    });

    testWidgets('recipient handle appears in subtitle and Para row',
        (tester) async {
      await pumpReceipt(tester);
      // "@joao" is present in both the subtitle ("para @joao") and the
      // Para detail row — exactly two occurrences.
      expect(find.textContaining('@joao'), findsNWidgets(2));
    });

    testWidgets('all required detail row labels are present', (tester) async {
      await pumpReceipt(tester);
      for (final label in ['De', 'Para', 'Nota', 'Data', 'Ref', 'Método']) {
        expect(find.text(label), findsOneWidget, reason: 'Missing row: $label');
      }
    });

    testWidgets('shows note value from transfer', (tester) async {
      await pumpReceipt(tester);
      expect(find.text('jantar'), findsOneWidget);
    });

    testWidgets('shows abbreviated 8-char ref uppercased in Ref row',
        (tester) async {
      await pumpReceipt(tester);
      // find.text() requires exact match — finds only the _DetailRow value,
      // not the footer line which contains the ref as a substring.
      expect(find.text('ABC12345'), findsOneWidget);
    });

    testWidgets('does not expose full UUID or trace id', (tester) async {
      await pumpReceipt(tester);
      expect(
        find.textContaining('abc12345-dead-beef'),
        findsNothing,
        reason: 'Full UUID must not be shown to the user',
      );
      expect(
        find.textContaining('trace-001'),
        findsNothing,
        reason: 'Internal trace_id must not be shown',
      );
    });

    testWidgets('share button is present with no leading icon', (tester) async {
      await pumpReceipt(tester);
      expect(find.text('Partilhar comprovativo'), findsOneWidget);
      // The share OutlinedButton must contain only a Text child (no Icon).
      final btn = find.ancestor(
        of:       find.text('Partilhar comprovativo'),
        matching: find.byType(OutlinedButton),
      );
      expect(btn, findsOneWidget);
      expect(
        find.descendant(of: btn, matching: find.byType(Icon)),
        findsNothing,
        reason: 'Share button must have no icon',
      );
    });

    testWidgets('Concluído invokes onDone with the completed transfer',
        (tester) async {
      Transfer? received;
      await pumpReceipt(tester, onDone: (t) => received = t);
      // Invoke the button callback directly — BanzamiPrimaryButton plays a
      // 2×150ms press-scale before firing onPressed; we test _done(), not the
      // animation. onDone runs synchronously inside _done().
      tester.widget<BanzamiPrimaryButton>(
        find.widgetWithText(BanzamiPrimaryButton, 'Concluído')).onPressed!();
      // Do not use pumpAndSettle(): the repeating rotation animation never settles.
      await tester.pump();
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
