import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/screens/link_pay_screen.dart';
import 'package:banzami_mobile/services/wallet_refresh_bus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

// Locks the "stale balance after a successful payment" fix:
//   - LinkPayScreen signals WalletRefreshBus the moment the ledger commits,
//   - and pops `true` (paymentCompleted) when closed,
//   - a failed payment signals nothing,
//   - and a bus signal recreates a keyed child so it re-fetches from the API
//     (the mechanism MainScreen uses to reload BanzamiHomeScreen).
// We never adjust the displayed balance locally — the ledger is the source of
// truth, so the home reloads from the backend.

// ---------------------------------------------------------------------------
// PaymentLink fixtures
// ---------------------------------------------------------------------------

Map<String, dynamic> _activeLink() => <String, dynamic>{
      'id':           'link-0001',
      'slug':         'abc123',
      'merchant_id':  'm-1',
      'merchant_name':'Doa',
      'wallet_id':    'w-1',
      'amount_minor': 525000,
      'currency':     'AOA',
      'description':  'Donativo',
      'status':       'ACTIVE',
      'created_at':   '2026-06-24T12:00:00.000Z',
      'updated_at':   '2026-06-24T12:00:00.000Z',
    };

Map<String, dynamic> _usedLink() => <String, dynamic>{
      ..._activeLink(),
      'status':   'USED',
      'paid_at':  '2026-06-24T12:05:00.000Z',
      'updated_at':'2026-06-24T12:05:00.000Z',
    };

// ---------------------------------------------------------------------------
// Client + wrappers
// ---------------------------------------------------------------------------

ConsumerPublicClient _client(http.Client h) =>
    ConsumerPublicClient(baseUrl: 'http://test', httpClient: h)..setToken('tok');

Widget _wrapPay(ConsumerPublicClient client, {String slug = 'abc123'}) =>
    Provider<ConsumerPublicClient>.value(
      value: client,
      child: MaterialApp(home: LinkPayScreen(slug: slug)),
    );

/// Drives LinkPayScreen to the loaded-confirm state, then taps Confirmar by
/// invoking the button callback directly (bypasses the press animation).
Future<void> _loadAndPay(WidgetTester tester) async {
  await tester.pumpAndSettle(); // resolve the GET (getPaymentLinkBySlug)
  expect(find.text('Confirmar pagamento'), findsOneWidget);
  // "Confirmar pagamento" is the BanzamiPrimaryButton (Cancelar is secondary).
  tester.widget<BanzamiPrimaryButton>(
    find.widgetWithText(BanzamiPrimaryButton, 'Confirmar pagamento')).onPressed!();
  for (var i = 0; i < 20; i++) {
    await tester.pump(const Duration(milliseconds: 50)); // drain the POST chain
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

  // ── LinkPayScreen ────────────────────────────────────────────────────────
  group('LinkPayScreen', () {
    testWidgets('B. successful payment signals WalletRefreshBus once and shows success',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      var signals = 0;
      void l() => signals++;
      WalletRefreshBus.instance.addListener(l);
      addTearDown(() => WalletRefreshBus.instance.removeListener(l));

      await tester.pumpWidget(_wrapPay(_client(
          _RouteHttpClient(getBody: _activeLink(), postBody: _usedLink()))));
      await _loadAndPay(tester);

      expect(find.textContaining('Pagamento enviado para'), findsOneWidget);
      expect(signals, 1, reason: 'balance refresh must be signalled exactly once');
    });

    testWidgets('C. closing the success screen pops with true (paymentCompleted)',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      Object? popResult = 'unset';
      final client = _client(
          _RouteHttpClient(getBody: _activeLink(), postBody: _usedLink()));

      await tester.pumpWidget(Provider<ConsumerPublicClient>.value(
        value: client,
        child: MaterialApp(
          home: Builder(
            builder: (ctx) => ElevatedButton(
              onPressed: () async {
                popResult = await Navigator.of(ctx).push(
                    MaterialPageRoute(builder: (_) => const LinkPayScreen(slug: 'abc123')));
              },
              child: const Text('open'),
            ),
          ),
        ),
      ));

      await tester.tap(find.text('open'));
      await _loadAndPay(tester);

      await tester.tap(find.text('Fechar'));
      await tester.pumpAndSettle();

      expect(popResult, isTrue);
      expect(find.text('open'), findsOneWidget, reason: 'returned to caller');
    });

    testWidgets('D. failed payment (INSUFFICIENT_FUNDS) does NOT signal a refresh',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      var signals = 0;
      void l() => signals++;
      WalletRefreshBus.instance.addListener(l);
      addTearDown(() => WalletRefreshBus.instance.removeListener(l));

      await tester.pumpWidget(_wrapPay(_client(_RouteHttpClient(
        getBody:    _activeLink(),
        postBody:   {'code': 'INSUFFICIENT_FUNDS', 'message': 'no funds'},
        postStatus: 422,
      ))));
      await _loadAndPay(tester);

      expect(find.text('Saldo insuficiente.'), findsOneWidget);
      expect(signals, 0, reason: 'no debit happened, so no balance refresh');
    });
  });

  // ── E. Keyed-reload mechanism (what MainScreen relies on) ─────────────────
  group('Bus-driven keyed reload', () {
    testWidgets('E. a bus signal recreates the keyed child so it re-initialises',
        (tester) async {
      _ReloadProbe.initCount = 0;
      await tester.pumpWidget(const MaterialApp(home: _RefreshHost()));
      expect(_ReloadProbe.initCount, 1);

      WalletRefreshBus.instance.signal();
      await tester.pump();

      expect(_ReloadProbe.initCount, 2,
          reason: 'signal must recreate the keyed child → fresh initState → API reload');
    });
  });
}

// ---------------------------------------------------------------------------
// Test harness mirroring MainScreen's listen + keyed-rebuild pattern
// ---------------------------------------------------------------------------

class _RefreshHost extends StatefulWidget {
  const _RefreshHost();
  @override
  State<_RefreshHost> createState() => _RefreshHostState();
}

class _RefreshHostState extends State<_RefreshHost> {
  int _tick = 0;
  void _onRefresh() => setState(() => _tick++);

  @override
  void initState() {
    super.initState();
    WalletRefreshBus.instance.addListener(_onRefresh);
  }

  @override
  void dispose() {
    WalletRefreshBus.instance.removeListener(_onRefresh);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      _ReloadProbe(key: ValueKey('probe-$_tick'));
}

/// Stands in for BanzamiHomeScreen: counts how many times it is initialised,
/// which is what re-fetches the balance from the backend in the real screen.
class _ReloadProbe extends StatefulWidget {
  const _ReloadProbe({super.key});
  static int initCount = 0;
  @override
  State<_ReloadProbe> createState() => _ReloadProbeState();
}

class _ReloadProbeState extends State<_ReloadProbe> {
  @override
  void initState() {
    super.initState();
    _ReloadProbe.initCount++;
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

// ---------------------------------------------------------------------------
// HTTP fake: GET → getBody (load link); POST → postBody (pay link)
// ---------------------------------------------------------------------------

class _RouteHttpClient extends http.BaseClient {
  final Map<String, dynamic> getBody;
  final Map<String, dynamic> postBody;
  final int postStatus;

  _RouteHttpClient({
    required this.getBody,
    required this.postBody,
    this.postStatus = 200,
  });

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final isPost = request.method == 'POST';
    final body   = isPost ? postBody : getBody;
    final status = isPost ? postStatus : 200;
    return http.StreamedResponse(
      Stream.value(utf8.encode(jsonEncode(body))),
      status,
      headers: {'content-type': 'application/json'},
    );
  }
}
