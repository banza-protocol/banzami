import '../models/merchant_payment_entry.dart';

/// Volume received on a single calendar day (local time).
class DayVolume {
  final DateTime day; // local midnight
  final int volumeMinor;
  const DayVolume(this.day, this.volumeMinor);
}

/// Pure, dependency-free aggregation of a merchant's recent payments into the
/// figures shown on the Banzami Business dashboard.
///
/// Every value is derived from REAL transaction data — nothing is mocked.
/// Figures that cannot be computed from the available data are exposed as
/// `null` so the UI can render a neutral "—" instead of inventing a number.
class MerchantDashboardStats {
  /// Sum of completed (received) payments today.
  final int todayVolumeMinor;

  /// Count of completed payments today.
  final int todayCount;

  /// Sum of completed payments this calendar month.
  final int monthVolumeMinor;

  /// Count of completed payments this calendar month.
  final int monthCount;

  /// Average completed ticket this month, or null when there are none.
  final int? avgTicketMinor;

  /// Share of terminal transactions that completed (0..1), or null when there
  /// are no terminal transactions to measure (so we never imply a fake 100%).
  final double? successRate;

  /// Exactly 7 entries, oldest → newest, for the last-7-days volume chart.
  final List<DayVolume> last7Days;

  const MerchantDashboardStats({
    required this.todayVolumeMinor,
    required this.todayCount,
    required this.monthVolumeMinor,
    required this.monthCount,
    required this.avgTicketMinor,
    required this.successRate,
    required this.last7Days,
  });

  /// Empty stats (no transactions) — all zero, optional figures null.
  factory MerchantDashboardStats.empty(DateTime now) =>
      compute(const [], now: now);

  bool get hasMonthActivity => monthCount > 0;
  bool get has7DayVolume => last7Days.any((d) => d.volumeMinor > 0);

  /// Aggregate [entries] relative to [now] (a local DateTime). Volume/count
  /// figures use received payments only; success rate uses terminal payments
  /// (received + failed/voided), ignoring still-pending ones.
  static MerchantDashboardStats compute(
    List<MerchantPaymentEntry> entries, {
    required DateTime now,
  }) {
    final today = DateTime(now.year, now.month, now.day);
    final monthStart = DateTime(now.year, now.month, 1);

    // Seed the 7 day buckets (today and the previous 6 days) at zero.
    final buckets = <DateTime, int>{};
    for (int i = 6; i >= 0; i--) {
      buckets[today.subtract(Duration(days: i))] = 0;
    }

    int todayVol = 0, todayCnt = 0, monthVol = 0, monthCnt = 0;
    int completedTerminal = 0, failedTerminal = 0;

    for (final tx in entries) {
      final completed = tx.isReceived;
      if (completed) {
        completedTerminal++;
      } else if (tx.isUnsuccessful) {
        failedTerminal++;
      }
      if (!completed) continue;

      final local = tx.createdAt.toLocal();
      final day = DateTime(local.year, local.month, local.day);

      if (!day.isBefore(monthStart)) {
        monthVol += tx.amountMinor;
        monthCnt++;
      }
      if (day == today) {
        todayVol += tx.amountMinor;
        todayCnt++;
      }
      if (buckets.containsKey(day)) {
        buckets[day] = buckets[day]! + tx.amountMinor;
      }
    }

    final terminal = completedTerminal + failedTerminal;
    final last7 = buckets.entries
        .map((e) => DayVolume(e.key, e.value))
        .toList()
      ..sort((a, b) => a.day.compareTo(b.day));

    return MerchantDashboardStats(
      todayVolumeMinor: todayVol,
      todayCount: todayCnt,
      monthVolumeMinor: monthVol,
      monthCount: monthCnt,
      // Integer minor units, rounded half up — money never becomes a double.
      avgTicketMinor:
          monthCnt > 0 ? (monthVol + monthCnt ~/ 2) ~/ monthCnt : null,
      successRate: terminal > 0 ? completedTerminal / terminal : null,
      last7Days: last7,
    );
  }
}
