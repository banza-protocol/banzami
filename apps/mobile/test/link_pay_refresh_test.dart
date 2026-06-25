import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/services/wallet_refresh_bus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:intl/date_symbol_data_local.dart';

// Locks the unified payment-link flow (now owned by the SDK):
//   - BanzamiPaymentLinkScreen resolves the link and hands off to the SAME
//     native BanzamiPaymentRequestScreen (merchant payee + reference, no @handle),
//   - completing the payment and closing the receipt fires onSuccess exactly once
//     (the app wires this to WalletRefreshBus to reload the home balance),
//   - and the bus → keyed-reload mechanism the home shell relies on still works.
// The app never resolves the link or builds the confirm/receipt itself.

// ---------------------------------------------------------------------------
// PaymentLink fixtures
// ---------------------------------------------------------------------------

Map<String, dynamic> _activeLink() => <String, dynamic>{
      'id':           'link-0001',
      'slug':         'abc123',
      'merchant_id':  'm-1',
      'merchant_name':'Doa Sandbox',
      'wallet_id':    'w-1',
      'amount_minor': 525000,
      'currency':     'AOA',
      'description':  'DOA-TEST',
      'status':       'ACTIVE',
      'created_at':   '2026-06-24T12:00:00.000Z',
      'updated_at':   '2026-06-24T12:00:00.000Z',
    };

Map<String, dynamic> _usedLink() => <String, dynamic>{
      ..._activeLink(),
      'status':    'USED',
      'paid_at':   '2026-06-24T12:05:00.000Z',
      'updated_at':'2026-06-24T12:05:00.000Z',
    };

// ---------------------------------------------------------------------------
// Client / wrappers
// ---------------------------------------------------------------------------

ConsumerPublicClient _client(http.Client h) =>
    ConsumerPublicClient(baseUrl: 'http://test', httpClient: h)..setToken('tok');

Widget _wrapPaymentLink(
  ConsumerPublicClient client, {
  String slug = 'abc123',
  void Function(Transfer)? onSuccess,
}) =>
    MaterialApp(
      home: BanzamiPaymentLinkScreen(
        client:    client,
        slug:      slug,
        ownHandle: 'fm65',
        onSuccess: onSuccess ?? (_) {},
      ),
    );

/// Drives BanzamiPaymentLinkScreen → native confirm → tap Pagar (callback
/// invoked directly to bypass the press-scale) → receipt.
Future<void> _loadAndPay(WidgetTester tester) async {
  await tester.pumpAndSettle(); // GET getPaymentLinkBySlug → native confirm
  final pagar = find.byWidgetPredicate((w) =>
      w is BanzamiPrimaryButton && w.label.startsWith('Pagar'));
  expect(pagar, findsOneWidget);
  tester.widget<BanzamiPrimaryButton>(pagar).onPressed!();
  for (var i = 0; i < 20; i++) {
    await tester.pump(const Duration(milliseconds: 50)); // drain POST + push receipt
  }
}

void main() {
  setUpAll(() async => initializeDateFormatting('pt', null));

  // ── A. WalletRefreshBus ──────────────────────────────────────────────────
  group('WalletRefreshBus', () {
    test('A. signal() notifies a registered listener, not a removed one', () {
      var hits = 0;
      void l() => hits++;
      WalletRefreshBus.instance.addListener(l);
      WalletRefreshBus.instance.signal();
      expect(hits, 1);

      WalletRefreshBus.instance.removeListener(l);
      WalletRefreshBus.instance.signal();
      expect(hits, 1, reason: 'removed listener must not fire');
    });
  });

  // ── BanzamiPaymentLinkScreen (SDK resolver) ──────────────────────────────
  group('BanzamiPaymentLinkScreen', () {
    testWidgets('B. an active link hands off to the native payment screen',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(_wrapPaymentLink(_client(
          _RouteHttpClient(getBody: _activeLink(), postBody: _usedLink()))));
      await tester.pumpAndSettle();

      // Same native confirm screen as app-to-app payments…
      expect(find.byType(BanzamiPaymentRequestScreen), findsOneWidget);
      // …with merchant payee + reference (not a @handle) + Pagar button.
      expect(find.text('Doa Sandbox'), findsOneWidget);
      expect(find.text('DOA-TEST'), findsOneWidget);
      expect(
        find.byWidgetPredicate(
            (w) => w is BanzamiPrimaryButton && w.label.startsWith('Pagar')),
        findsOneWidget,
      );
    });

    testWidgets('C. completing the payment and closing the receipt fires onSuccess once',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      var paid = 0;
      await tester.pumpWidget(_wrapPaymentLink(
        _client(_RouteHttpClient(getBody: _activeLink(), postBody: _usedLink())),
        onSuccess: (_) => paid++,
      ));
      await _loadAndPay(tester);

      // Native receipt is shown for the link payment.
      expect(find.text('Enviado com sucesso'), findsOneWidget);
      expect(find.textContaining('para Doa Sandbox'), findsOneWidget);
      expect(paid, 0, reason: 'onSuccess fires on receipt close, not on commit');

      // Close the receipt → onSuccess (the app wires this to WalletRefreshBus).
      await tester.tap(find.widgetWithText(ElevatedButton, 'Concluído'));
      await tester.pump();
      expect(paid, 1);
    });
  });

  // The home's reaction to a bus signal (reload balance from the backend) is
  // covered by home_refresh_on_signal_test.dart — BanzamiHomeScreen now listens
  // to the refresh signal directly instead of being recreated by a ValueKey.
}

// ---------------------------------------------------------------------------
// HTTP fake: GET → getBody (load link); POST → postBody (pay link)
// ---------------------------------------------------------------------------

class _RouteHttpClient extends http.BaseClient {
  final Map<String, dynamic> getBody;
  final Map<String, dynamic> postBody;

  _RouteHttpClient({required this.getBody, required this.postBody});

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final isPost = request.method == 'POST';
    return http.StreamedResponse(
      Stream.value(utf8.encode(jsonEncode(isPost ? postBody : getBody))),
      200,
      headers: {'content-type': 'application/json'},
    );
  }
}
