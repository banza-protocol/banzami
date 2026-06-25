import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:banzami_mobile/merchant/widgets/merchant_dashboard_stats.dart';
import 'package:banzami_mobile/merchant/widgets/merchant_kpi_grid.dart';
import 'package:banzami_mobile/merchant/widgets/merchant_status_badge.dart';
import 'package:banzami_mobile/merchant/widgets/merchant_volume_chart.dart';

Widget _wrap(Widget child, {double width = 360}) => MaterialApp(
      home: Scaffold(body: Center(child: SizedBox(width: width, child: child))),
    );

List<DayVolume> _flatWeek({int lastDay = 0}) =>
    List.generate(7, (i) => DayVolume(DateTime(2026, 6, 19 + i), i == 6 ? lastDay : 0));

MerchantDashboardStats _stats({int? avg, double? success}) => MerchantDashboardStats(
      todayVolumeMinor: 150000,
      todayCount: 2,
      monthVolumeMinor: 500000,
      monthCount: 7,
      avgTicketMinor: avg,
      successRate: success,
      last7Days: _flatWeek(),
    );

void main() {
  testWidgets('KPI grid renders the core business KPIs', (t) async {
    await t.pumpWidget(_wrap(MerchantKpiGrid(stats: _stats(avg: 71428, success: 0.96), currency: 'AOA')));
    expect(find.text('Volume hoje'), findsOneWidget);
    expect(find.text('Pagamentos hoje'), findsOneWidget);
    expect(find.text('Volume do mês'), findsOneWidget);
    expect(find.text('Pagamentos do mês'), findsOneWidget);
    expect(find.text('2'), findsOneWidget); // today count
    expect(find.text('7'), findsOneWidget); // month count
    expect(find.text('96%'), findsOneWidget); // success rate
    expect(t.takeException(), isNull);
  });

  testWidgets('KPI grid masks unavailable figures with "—" (no invented numbers)', (t) async {
    await t.pumpWidget(_wrap(MerchantKpiGrid(stats: _stats(avg: null, success: null), currency: 'AOA')));
    expect(find.text('—'), findsNWidgets(2)); // ticket + success rate
  });

  testWidgets('KPI grid does not overflow at a narrow width', (t) async {
    await t.pumpWidget(_wrap(
      MerchantKpiGrid(stats: _stats(avg: 1000000000, success: 1.0), currency: 'AOA'),
      width: 300,
    ));
    expect(t.takeException(), isNull);
  });

  testWidgets('Volume chart shows a clean empty state when there is no movement', (t) async {
    await t.pumpWidget(_wrap(MerchantVolumeChart(days: _flatWeek(lastDay: 0), currency: 'AOA')));
    expect(find.text('Sem movimento nos últimos 7 dias'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('Volume chart shows the period total when there is volume', (t) async {
    await t.pumpWidget(_wrap(MerchantVolumeChart(days: _flatWeek(lastDay: 100000), currency: 'AOA')));
    expect(find.text('Volume — últimos 7 dias'), findsOneWidget);
    expect(find.textContaining('Sem movimento'), findsNothing);
    expect(t.takeException(), isNull);
  });

  testWidgets('Status badge renders its label + icon', (t) async {
    await t.pumpWidget(_wrap(const MerchantStatusBadge(
      label: 'Verificado',
      icon: Icons.verified_rounded,
      tone: MerchantBadgeTone.success,
    )));
    expect(find.text('Verificado'), findsOneWidget);
    expect(find.byIcon(Icons.verified_rounded), findsOneWidget);
  });
}
