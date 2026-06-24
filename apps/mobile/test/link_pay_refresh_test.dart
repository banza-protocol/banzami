import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/screens/link_pay_screen.dart';
import 'package:banzami_mobile/services/session_service.dart';
import 'package:banzami_mobile/services/wallet_refresh_bus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

// Locks the unified Doa/link payment:
//   - an active link hands off to the SAME native BanzamiPaymentRequestScreen
//     (merchant payee + Doa reference instead of a @handle),
//   - completing the payment and closing the receipt signals a balance refresh
//     (WalletRefreshBus) — exactly once,
//   - and the bus → keyed-reload mechanism the home shell relies on still works.
// We never adjust the displayed balance locally; the home reloads from the API.

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
// Client / session / wrappers
// ---------------------------------------------------------------------------

ConsumerPublicClient _client(http.Client h) =>
    ConsumerPublicClient(baseUrl: 'http://test', httpClient: h)..setToken('tok');

class _FakeSession extends SessionService {
  @override
  Session? get session => const Session(
        consumerId: 'c-1',
        walletId:   'w-own',
        handle:     'fm65',
        token:      'tok',
      );
}

Widget _wrapLinkPay(ConsumerPublicClient client, {String slug = 'abc123'}) =>
    MultiProvider(
      providers: [
        Provider<ConsumerPublicClient>.value(value: client),
        ChangeNotifierProvider<SessionService>(create: (_) => _FakeSession()),
      ],
      child: MaterialApp(home: LinkPayScreen(slug: slug)),
    );

/// Drives LinkPayScreen → native confirm → tap Pagar (callback invoked directly
/// to bypass the press-scale) → receipt.
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

  // ── LinkPayScreen unification ────────────────────────────────────────────
  group('LinkPayScreen (Doa/link payment)', () {
    testWidgets('B. an active link hands off to the native payment screen',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(_wrapLinkPay(_client(
          _RouteHttpClient(getBody: _activeLink(), postBody: _usedLink()))));
      await tester.pumpAndSettle();

      // Same native confirm screen as app-to-app payments…
      expect(find.byType(BanzamiPaymentRequestScreen), findsOneWidget);
      // …with merchant payee + Doa reference (not a @handle) + Pagar button.
      expect(find.text('Doa Sandbox'), findsOneWidget);
      expect(find.text('DOA-TEST'), findsOneWidget);
      expect(
        find.byWidgetPredicate(
            (w) => w is BanzamiPrimaryButton && w.label.startsWith('Pagar')),
        findsOneWidget,
      );
    });

    testWidgets('C. completing the payment and closing the receipt signals one refresh',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      var signals = 0;
      void l() => signals++;
      WalletRefreshBus.instance.addListener(l);
      addTearDown(() => WalletRefreshBus.instance.removeListener(l));

      await tester.pumpWidget(_wrapLinkPay(_client(
          _RouteHttpClient(getBody: _activeLink(), postBody: _usedLink()))));
      await _loadAndPay(tester);

      // Native receipt is shown for the Doa payment.
      expect(find.text('Enviado com sucesso'), findsOneWidget);
      expect(find.textContaining('para Doa Sandbox'), findsOneWidget);
      expect(signals, 0, reason: 'refresh fires on receipt close, not on commit');

      // Close the receipt → onSuccess → WalletRefreshBus.signal().
      tester.widget<BanzamiPrimaryButton>(
        find.widgetWithText(BanzamiPrimaryButton, 'Concluído')).onPressed!();
      await tester.pump();
      expect(signals, 1);
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
