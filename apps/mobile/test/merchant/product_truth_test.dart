import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:banzami_mobile/merchant/widgets/merchant_dashboard_stats.dart';
import 'package:banzami_mobile/merchant/widgets/merchant_kpi_grid.dart';

MerchantDashboardStats stats({int? avg, double? success}) => MerchantDashboardStats(
      todayVolumeMinor: 0, todayCount: 0, monthVolumeMinor: 0, monthCount: 0,
      avgTicketMinor: avg, successRate: success, last7Days: const [],
    );

Widget host(Widget child) => MaterialApp(home: Scaffold(body: SingleChildScrollView(child: child)));

void main() {
  // Every metric state must be legible: a real value, or an explicit "no data" —
  // never an ambiguous dash and never a fabricated zero.
  group('KPI metric states', () {
    testWidgets('no qualifying data renders "Sem dados", not a dash', (t) async {
      await t.pumpWidget(host(MerchantKpiGrid(stats: stats(avg: null, success: null), currency: 'AOA')));
      expect(find.text('Sem dados'), findsNWidgets(2)); // ticket médio + taxa de sucesso
      expect(find.text('—'), findsNothing);
    });

    testWidgets('real values render the value, not "Sem dados"', (t) async {
      await t.pumpWidget(host(MerchantKpiGrid(stats: stats(avg: 150000, success: 0.5), currency: 'AOA')));
      expect(find.text('50%'), findsOneWidget);
      expect(find.text('Sem dados'), findsNothing);
      expect(find.text('—'), findsNothing);
    });

    testWidgets('a real zero success rate is shown, not treated as no data', (t) async {
      await t.pumpWidget(host(MerchantKpiGrid(stats: stats(avg: 150000, success: 0.0), currency: 'AOA')));
      expect(find.text('0%'), findsOneWidget); // zero is a value
      expect(find.text('Sem dados'), findsNothing);
    });

    testWidgets('a NO_DATA tile exposes a meaningful screen-reader label', (t) async {
      await t.pumpWidget(host(const MerchantKpiCard(icon: Icons.payments_rounded, label: 'Ticket médio', value: kKpiNoData, muted: true)));
      expect(find.bySemanticsLabel('Ticket médio — sem dados ainda'), findsOneWidget);
    });
  });

  // Withdrawals are intentionally unavailable in the Sandbox: presented as
  // unavailable (never an error), with no active CTA and no needless network call.
  group('Withdrawals — Sandbox unavailability (source contract)', () {
    final dash = File('lib/merchant/screens/dashboard_screen.dart').readAsStringSync();
    final payout = File('lib/merchant/screens/payout_screen.dart').readAsStringSync();

    test('the card has a deterministic unavailable state driven by policy', () {
      expect(dash.contains('WithdrawGate.unavailableSandbox'), isTrue);
      expect(dash.contains('AppConfig.withdrawalsEnabled'), isTrue);
      expect(dash.contains('Os levantamentos ainda não estão disponíveis na Sandbox.'), isTrue);
      expect(dash.contains('Indisponível na Sandbox'), isTrue);
    });

    test('the impossible payouts fetch is skipped when withdrawals are disabled', () {
      expect(dash.contains('AppConfig.withdrawalsEnabled\n        ? client.listPayouts') ||
          dash.contains('AppConfig.withdrawalsEnabled') && dash.contains('Future<void>.value()'), isTrue);
    });

    test('the quick-action "Levantar" is gated on withdrawal availability', () {
      expect(dash.contains('showPayout: AppConfig.withdrawalsEnabled'), isTrue);
    });

    test('the payout screen is deep-link safe when withdrawals are disabled', () {
      expect(payout.contains('if (!AppConfig.withdrawalsEnabled)'), isTrue);
      expect(payout.contains('Os levantamentos ainda não estão disponíveis na Sandbox.'), isTrue);
    });
  });

  // Every entry point into withdrawals must obey the same authority
  // (AppConfig.withdrawalsEnabled). No screen may present an active shortcut into
  // a payout flow that cannot succeed, and no screen may claim withdrawals are
  // available while the policy disables them.
  group('Withdrawal entry points — single authority (source contract)', () {
    final profile = File('lib/merchant/screens/profile_screen.dart').readAsStringSync();
    final kyb = File('lib/merchant/screens/kyb_screen.dart').readAsStringSync();

    test('the profile "Pedir levantamento" shortcut is gated on withdrawal policy', () {
      // The shortcut and its PayoutScreen navigation live inside the policy gate.
      final gateIdx = profile.indexOf('if (AppConfig.withdrawalsEnabled)');
      expect(gateIdx, isNonNegative);
      final tileIdx = profile.indexOf('Pedir levantamento');
      expect(tileIdx, isNonNegative);
      expect(tileIdx, greaterThan(gateIdx),
          reason: 'the "Pedir levantamento" tile must be inside the policy gate');
    });

    test('KYB approval does not claim withdrawal availability when disabled by policy', () {
      // The withdrawal-availability copy is only reachable behind the gate.
      final gateIdx = kyb.indexOf('if (AppConfig.withdrawalsEnabled)');
      expect(gateIdx, isNonNegative);
      final claimIdx = kyb.indexOf('Levantamentos disponíveis.');
      expect(claimIdx, isNonNegative);
      expect(claimIdx, greaterThan(gateIdx),
          reason: 'the "Levantamentos disponíveis" claim must be inside the policy gate');
      // The unconditional approved state confirms verification, not withdrawals.
      expect(kyb.contains("'Aprovado', 'O seu negócio está verificado.'"), isTrue);
    });
  });

  // History tabs must distinguish a real fetch failure (ERROR + retry) from a
  // genuine empty state, and a failed follow-on page must never become an
  // endless spinner + unbounded retry loop.
  group('History — error vs empty vs pagination (source contract)', () {
    final hist = File('lib/merchant/screens/history_screen.dart').readAsStringSync();

    test('the Recebidos initial error is an ERROR state, not a reassuring empty state', () {
      // The old code routed the received-payments error through _emptyState (a
      // neutral "…aparecerão aqui" message with no retry). That must be gone.
      expect(hist.contains('_emptyState(icon: Icons.error_outline, label: _error!)'), isFalse);
    });

    test('every list tab offers an error state with retry (initial + failed page)', () {
      // Transacções, Cobranças, Recebidos: initial-error branch + footer guard =
      // six "Tentar novamente" affordances in total. No error is a dead end.
      expect('Tentar novamente'.allMatches(hist).length, greaterThanOrEqualTo(6));
    });

    test('a failed follow-on page waits for a tap — no auto-retry loop', () {
      // No unguarded footer re-requests the next page every frame; all three
      // tabs schedule the next page via a post-frame callback only when there is
      // no error and no load in flight.
      expect(hist.contains('if (!_loading) _load();'), isFalse,
          reason: 'the unguarded Cobranças footer must be replaced by the guarded pattern');
      expect('addPostFrameCallback'.allMatches(hist).length, greaterThanOrEqualTo(3));
    });
  });
}
