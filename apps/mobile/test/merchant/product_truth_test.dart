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
}
