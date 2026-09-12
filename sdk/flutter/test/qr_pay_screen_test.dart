// CAP-PAY-003. Scanning a structured Banzami QR used to end in "ainda não
// disponível". It now ends in a payment, so what this covers is the part a
// payer cannot check for themselves: that a fixed-amount code offers nothing
// to change, that an open-amount code cannot be paid blank, that the figure
// shown afterwards is the server's and not the phone's, that every refusal the
// route can send reads in Portuguese, and that two taps are one payment.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'package:banzami_flutter/banzami_flutter.dart';

/// A dynamic (fixed-amount) payload: `{"t":"D","id":…,"sig":…}` — an id and a
/// signature, no amount. A static one: `{"t":"S",…}` with no amount either.
String _payload(Map<String, dynamic> obj) =>
    base64Url.encode(utf8.encode(jsonEncode(obj))).replaceAll('=', '');

final _dynamicPayload = _payload({
  't': 'D',
  'id': '8f1c0e6e-0000-4000-8000-000000000001',
  'sig': 'deadbeef',
});
final _staticPayload = _payload({
  't': 'S',
  'oid': '8f1c0e6e-0000-4000-8000-000000000002',
  'ot': 'M',
  'c': 'AOA',
});

class _Recorder {
  final List<Map<String, dynamic>> bodies = [];
  final List<String> paths = [];
  int get calls => paths.where((p) => p == '/v1/qr/pay').length;

  /// Every idempotency key sent — one intent must produce exactly one.
  Set<String?> get keys =>
      bodies.map((b) => b['idempotency_key'] as String?).toSet();
}

/// A client whose /v1/qr/pay answers with [payResponse] (or [status]/[code]).
/// Everything else answers 404 so a stray call is visible rather than silent.
({ConsumerPublicClient client, _Recorder rec}) _client({
  Map<String, dynamic>? payResponse,
  int status = 200,
  String code = 'INTERNAL_ERROR',
  Duration delay = Duration.zero,
}) {
  final rec = _Recorder();
  final client = ConsumerPublicClient(
    baseUrl: 'https://api.test',
    httpClient: MockClient((req) async {
      rec.paths.add(req.url.path);
      if (req.url.path == '/v1/qr/pay') {
        rec.bodies.add(jsonDecode(req.body) as Map<String, dynamic>);
        if (delay > Duration.zero) await Future<void>.delayed(delay);
        if (status != 200) {
          return http.Response(
            jsonEncode({'code': code, 'message': 'english diagnostic text'}),
            status,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          jsonEncode(payResponse ?? const <String, dynamic>{}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{"code":"NOT_FOUND","message":"x"}', 404,
          headers: {'content-type': 'application/json'});
    }),
  );
  return (client: client, rec: rec);
}

Future<void> _open(
  WidgetTester t,
  ConsumerPublicClient client, {
  required bool isStatic,
  String? payload,
}) async {
  await t.pumpWidget(MaterialApp(
    home: BanzamiQrPayScreen(
      client: client,
      payload: payload ?? (isStatic ? _staticPayload : _dynamicPayload),
      isStatic: isStatic,
      ownHandle: 'fm65',
      onSuccess: (_) {},
    ),
  ));
  await t.pump(const Duration(milliseconds: 600));
}

Future<void> _enterAmount(WidgetTester t, String major) async {
  await t.enterText(find.byType(TextField), major);
  await t.pump();
}

/// Taps a button and lets its press animation run — [BanzamiPrimaryButton]
/// calls onPressed only after it has played.
Future<void> _tap(WidgetTester t, String label) async {
  await t.tap(find.text(label));
  for (var i = 0; i < 8; i++) {
    await t.pump(const Duration(milliseconds: 100));
  }
}

/// Advances time without demanding quiescence: the in-flight state pulses
/// forever by design, and the receipt screen runs a live clock, so
/// pumpAndSettle would never return.
Future<void> _advance(WidgetTester t) async {
  for (var i = 0; i < 12; i++) {
    await t.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  // The receipt screen prints the official Luanda clock in Portuguese.
  setUpAll(() async => initializeDateFormatting('pt'));

  testWidgets('a dynamic QR offers no amount field — its amount is fixed',
      (t) async {
    final c = _client();
    await _open(t, c.client, isStatic: false);

    expect(find.byType(BanzamiAmountInput), findsNothing);
    expect(find.byType(TextField), findsNothing);
    expect(find.textContaining('montante fixo'), findsOneWidget);
    // And it does not pretend to know the figure.
    expect(find.textContaining('Kz'), findsNothing);
  });

  testWidgets('a static QR asks for the amount and will not pay without one',
      (t) async {
    final c = _client();
    await _open(t, c.client, isStatic: true);

    expect(find.byType(BanzamiAmountInput), findsOneWidget);

    await _tap(t, 'Pagar');

    expect(c.rec.calls, 0, reason: 'a blank amount must not reach the server');
    expect(find.text('Introduza um montante válido'), findsOneWidget);

    // With an amount, the same button pays — and sends it.
    await _enterAmount(t, '500');
    expect(find.text('Pagar 500 Kz'), findsOneWidget);
    await _tap(t, 'Pagar 500 Kz');
    await _advance(t);

    expect(c.rec.calls, 1);
    expect(c.rec.bodies.single['amount_minor'], 50000);
    expect(c.rec.bodies.single['payload'], _staticPayload);
  });

  testWidgets('a dynamic QR sends no amount at all', (t) async {
    final c = _client(payResponse: {
      'transfer_id': 't-1',
      'amount_minor': 125000,
      'currency': 'AOA',
      'qr_type': 'DYNAMIC',
    });
    await _open(t, c.client, isStatic: false);

    await _tap(t, 'Pagar');
    await _advance(t);

    expect(c.rec.calls, 1);
    expect(c.rec.bodies.single.containsKey('amount_minor'), isFalse);
  });

  testWidgets('the settled amount shown is the response’s, not the typed one',
      (t) async {
    // The payer typed 500 Kz; the server settled 750 Kz (for a static code the
    // server's answer is what the ledger recorded — and for a dynamic one the
    // phone never held a figure at all).
    final c = _client(payResponse: {
      'transfer_id': 't-42',
      'amount_minor': 75000,
      'currency': 'AOA',
      'qr_type': 'STATIC',
    });
    await _open(t, c.client, isStatic: true);
    await _enterAmount(t, '500');
    await _tap(t, 'Pagar 500 Kz');
    await _advance(t);

    final receipt = t.widget<BanzamiReceiptScreen>(
        find.byType(BanzamiReceiptScreen, skipOffstage: false));
    expect(receipt.transfer.amountMinor, 75000);
    expect(receipt.transfer.amountMinor, isNot(50000));
    expect(receipt.transfer.transferId, 't-42');
    expect(find.text('750 Kz'), findsWidgets);
    expect(find.text('500 Kz'), findsNothing);
  });

  testWidgets('a double tap is one payment, under one idempotency key',
      (t) async {
    final c = _client(
      payResponse: {
        'transfer_id': 't-9',
        'amount_minor': 50000,
        'currency': 'AOA',
        'qr_type': 'STATIC',
      },
      delay: const Duration(milliseconds: 300),
    );
    await _open(t, c.client, isStatic: true);
    await _enterAmount(t, '500');

    final button = find.text('Pagar 500 Kz');
    await t.tap(button);
    await t.tap(button, warnIfMissed: false);
    for (var i = 0; i < 8; i++) {
      await t.pump(const Duration(milliseconds: 100));
    }

    expect(c.rec.calls, 1, reason: 'the second tap is the same intent');
    expect(c.rec.keys.length, 1);
  });

  testWidgets('while the payment is in flight there is nothing left to tap',
      (t) async {
    final c = _client(
      payResponse: {
        'transfer_id': 't-10',
        'amount_minor': 50000,
        'currency': 'AOA',
        'qr_type': 'STATIC',
      },
      // Long enough that the assertions below land mid-flight.
      delay: const Duration(seconds: 5),
    );
    await _open(t, c.client, isStatic: true);
    await _enterAmount(t, '500');
    await _tap(t, 'Pagar 500 Kz');

    expect(find.text('Pagar 500 Kz'), findsNothing,
        reason: 'the confirm button must not survive into the in-flight state');
    expect(find.text('A pagar...'), findsOneWidget);
    expect(c.rec.calls, 1);

    // Let the request finish so no timer outlives the test.
    await _advance(t);
    await t.pump(const Duration(seconds: 5));
    await _advance(t);
  });

  testWidgets('a refusal reads in Portuguese, and the payer can act on it',
      (t) async {
    final c = _client(status: 422, code: 'QR_ALREADY_USED');
    await _open(t, c.client, isStatic: false);

    await _tap(t, 'Pagar');
    await _advance(t);

    expect(find.text('Este QR já foi utilizado.'), findsOneWidget);
    expect(find.textContaining('english diagnostic'), findsNothing);
    // Still refusable, not stuck: the button is back.
    expect(find.text('Pagar'), findsOneWidget);
  });

  testWidgets('a lost answer retries the SAME request, never a second payment',
      (t) async {
    final c = _client(status: 503, code: 'SERVICE_UNAVAILABLE');
    await _open(t, c.client, isStatic: true);
    await _enterAmount(t, '500');
    await _tap(t, 'Pagar 500 Kz');
    await _advance(t);

    expect(find.text(kPaymentOutcomeUnknownMessage), findsOneWidget);
    expect(find.text('Verificar'), findsOneWidget);

    await _tap(t, 'Verificar');
    await _advance(t);

    expect(c.rec.calls, 2);
    expect(c.rec.keys.length, 1,
        reason: 'the retry must carry the first attempt’s key');
  });

  group('every code /v1/qr/pay can send is worded', () {
    // The route's own refusals (services/public-api/internal/handler/qr_pay.go
    // respondQrPayError), with the status each is sent with.
    const emitted = <String, int>{
      'INVALID_PAYLOAD': 400,
      'QR_NOT_FOUND': 404,
      'INVALID_SIGNATURE': 422,
      'QR_EXPIRED': 422,
      'QR_ALREADY_USED': 422,
      'AMOUNT_REQUIRED': 422,
      'AMOUNT_NEGATIVE': 422,
      'INVALID_WALLET_ACCOUNT': 422,
      'INSUFFICIENT_FUNDS': 422,
      'WALLET_NOT_FOUND': 422,
      'ACCOUNT_FROZEN': 422,
      'SELF_PAYMENT_NOT_ALLOWED': 400,
    };

    for (final e in emitted.entries) {
      test('${e.key} has its own Portuguese copy', () {
        expect(banzamiErrorCodeHasCopy(e.key), isTrue,
            reason: '${e.key} falls back to generic status copy');
        final text = banzamiErrorMessage(BanzamiApiException(
          statusCode: e.value,
          code: e.key,
          message: 'english diagnostic text from the server',
        ));
        expect(text, isNotEmpty);
        expect(text, isNot(contains('english diagnostic')));
      });
    }

    test('the QR-specific wordings say what to do', () {
      String m(String code, int status) => banzamiErrorMessage(
          BanzamiApiException(statusCode: status, code: code, message: 'x'));

      expect(m('INVALID_PAYLOAD', 400), 'Este código não é um QR Banzami.');
      expect(m('QR_NOT_FOUND', 404), 'Este QR já não existe. Peça um código novo.');
      expect(m('QR_NOT_FOUND', 404), isNot('Não encontrado.'));
      expect(m('INVALID_SIGNATURE', 422),
          'Este QR não pôde ser verificado. Peça um código novo.');
      expect(m('AMOUNT_REQUIRED', 422),
          'Este QR não traz montante. Escreva quanto quer pagar.');
      expect(m('AMOUNT_NEGATIVE', 422), 'O montante tem de ser maior do que zero.');
      expect(m('INVALID_WALLET_ACCOUNT', 422),
          'A conta para onde este QR envia já não está disponível.');
      expect(m('SELF_PAYMENT_NOT_ALLOWED', 400), 'Não pode pagar o seu próprio QR.');
    });
  });
}
