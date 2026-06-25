import 'package:flutter/material.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import 'merchant_dashboard_stats.dart';

/// A lightweight 7-day received-volume bar chart, drawn entirely from REAL
/// daily volumes ([DayVolume]) — no charting dependency, no synthetic data.
/// When there is no movement it shows a clean empty state instead of fake bars.
class MerchantVolumeChart extends StatelessWidget {
  final List<DayVolume> days; // expected length 7, oldest → newest
  final String currency;

  const MerchantVolumeChart({
    super.key,
    required this.days,
    required this.currency,
  });

  // Portuguese 1-letter weekday initials, indexed by DateTime.weekday (1=Mon).
  static const _initials = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

  @override
  Widget build(BuildContext context) {
    final maxVolume = days.fold<int>(0, (m, d) => d.volumeMinor > m ? d.volumeMinor : m);
    final total = days.fold<int>(0, (s, d) => s + d.volumeMinor);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BanzamiSpacing.lg),
      decoration: const BoxDecoration(
        color: BanzamiColors.white,
        borderRadius: BanzamiRadius.xlAll,
        boxShadow: BanzamiShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Volume — últimos 7 dias',
                  style: BanzamiTextStyles.headingSm,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (total > 0)
                Padding(
                  padding: const EdgeInsets.only(left: BanzamiSpacing.sm),
                  child: Text(
                    formatMinor(total, currency),
                    style: BanzamiTextStyles.bodySm.copyWith(
                      color: BanzamiColors.gray400,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: BanzamiSpacing.lg),
          if (maxVolume == 0)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: BanzamiSpacing.lg),
              child: Center(
                child: Text(
                  'Sem movimento nos últimos 7 dias',
                  style: TextStyle(color: BanzamiColors.gray400, fontSize: 13),
                ),
              ),
            )
          else
            SizedBox(
              height: 96,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (final d in days)
                    Expanded(
                      child: _Bar(
                        heightFactor: maxVolume == 0 ? 0 : d.volumeMinor / maxVolume,
                        label: _initials[(d.day.weekday - 1) % 7],
                        active: d.volumeMinor > 0,
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Bar extends StatelessWidget {
  final double heightFactor; // 0..1
  final String label;
  final bool active;

  const _Bar({
    required this.heightFactor,
    required this.label,
    required this.active,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 3),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          Expanded(
            child: Align(
              alignment: Alignment.bottomCenter,
              child: FractionallySizedBox(
                // Keep a minimal visible stub for non-zero days.
                heightFactor: active ? (0.08 + 0.92 * heightFactor) : 0.0,
                child: Container(
                  decoration: BoxDecoration(
                    color: active
                        ? BanzamiColors.primary
                        : BanzamiColors.gray200,
                    borderRadius: BanzamiRadius.smAll,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: BanzamiSpacing.xs),
          Text(
            label,
            style: BanzamiTextStyles.label.copyWith(
              color: BanzamiColors.gray400,
              fontSize: 10,
            ),
          ),
        ],
      ),
    );
  }
}
