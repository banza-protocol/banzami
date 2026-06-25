import 'package:flutter/material.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import 'merchant_dashboard_stats.dart';

/// Placeholder shown when a KPI cannot be computed from the available data.
const String kKpiUnavailable = '—';

/// One KPI tile: icon + label + value. Values are pre-formatted strings; when a
/// figure is unavailable the caller passes [kKpiUnavailable] ("—") — the tile
/// never fabricates a number.
class MerchantKpiCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const MerchantKpiCard({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BanzamiSpacing.md),
      decoration: const BoxDecoration(
        color: BanzamiColors.white,
        borderRadius: BanzamiRadius.xlAll,
        boxShadow: BanzamiShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: BanzamiColors.primary.withValues(alpha: 0.08),
                borderRadius: BanzamiRadius.smAll,
              ),
              child: Icon(icon, color: BanzamiColors.primary, size: 15),
            ),
            const SizedBox(width: BanzamiSpacing.sm),
            Expanded(
              child: Text(
                label,
                style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ]),
          const SizedBox(height: BanzamiSpacing.sm),
          Text(
            value,
            style: BanzamiTextStyles.headingSm.copyWith(fontWeight: FontWeight.w700),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

/// The 6-KPI business grid (2 columns). Today/month volume + counts are always
/// real; average ticket and success rate render "—" when not computable.
class MerchantKpiGrid extends StatelessWidget {
  final MerchantDashboardStats stats;
  final String currency;

  const MerchantKpiGrid({
    super.key,
    required this.stats,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    final cards = <Widget>[
      MerchantKpiCard(
        icon: Icons.today_rounded,
        label: 'Volume hoje',
        value: formatMinor(stats.todayVolumeMinor, currency),
      ),
      MerchantKpiCard(
        icon: Icons.receipt_long_rounded,
        label: 'Pagamentos hoje',
        value: '${stats.todayCount}',
      ),
      MerchantKpiCard(
        icon: Icons.calendar_month_rounded,
        label: 'Volume do mês',
        value: formatMinor(stats.monthVolumeMinor, currency),
      ),
      MerchantKpiCard(
        icon: Icons.stacked_line_chart_rounded,
        label: 'Pagamentos do mês',
        value: '${stats.monthCount}',
      ),
      MerchantKpiCard(
        icon: Icons.payments_rounded,
        label: 'Ticket médio',
        value: stats.avgTicketMinor != null
            ? formatMinor(stats.avgTicketMinor!, currency)
            : kKpiUnavailable,
      ),
      MerchantKpiCard(
        icon: Icons.verified_rounded,
        label: 'Taxa de sucesso',
        value: stats.successRate != null
            ? '${(stats.successRate! * 100).round()}%'
            : kKpiUnavailable,
      ),
    ];

    // Two-column rows; Expanded keeps each card flexible (no overflow).
    final rows = <Widget>[];
    for (int i = 0; i < cards.length; i += 2) {
      rows.add(Padding(
        padding: EdgeInsets.only(bottom: i + 2 < cards.length ? BanzamiSpacing.md : 0),
        child: Row(children: [
          Expanded(child: cards[i]),
          const SizedBox(width: BanzamiSpacing.md),
          Expanded(child: cards[i + 1]),
        ]),
      ));
    }
    return Column(children: rows);
  }
}
