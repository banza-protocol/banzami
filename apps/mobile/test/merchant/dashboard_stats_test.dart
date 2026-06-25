import 'package:flutter_test/flutter_test.dart';
import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/merchant/widgets/merchant_dashboard_stats.dart';

MerchantTransaction _tx(String status, int amount, DateTime when) =>
    MerchantTransaction(
      id: 'tx-${when.microsecondsSinceEpoch}-$amount',
      status: status,
      amountMinor: amount,
      currency: 'AOA',
      merchantId: 'm1',
      createdAt: when,
    );

void main() {
  // Fixed "now" (local) so day math is deterministic regardless of timezone.
  final now = DateTime(2026, 6, 25, 12, 0);
  final today = DateTime(2026, 6, 25, 9, 0);
  final yesterday = DateTime(2026, 6, 24, 9, 0);
  final earlierMonth = DateTime(2026, 6, 3, 9, 0);

  group('MerchantDashboardStats.compute — real aggregation', () {
    test('empty input → zeros, optional figures null, 7 day buckets', () {
      final s = MerchantDashboardStats.empty(now);
      expect(s.todayVolumeMinor, 0);
      expect(s.todayCount, 0);
      expect(s.monthVolumeMinor, 0);
      expect(s.monthCount, 0);
      expect(s.avgTicketMinor, isNull);
      expect(s.successRate, isNull);
      expect(s.last7Days.length, 7);
      expect(s.has7DayVolume, isFalse);
    });

    test('today and month volume/count count only completed payments', () {
      final s = MerchantDashboardStats.compute([
        _tx('COMPLETED', 100000, today),
        _tx('PAID', 50000, today),
        _tx('PENDING', 999999, today), // excluded from volume/count
        _tx('COMPLETED', 200000, earlierMonth),
      ], now: now);

      expect(s.todayVolumeMinor, 150000); // 100000 + 50000
      expect(s.todayCount, 2);
      expect(s.monthVolumeMinor, 350000); // 150000 + 200000
      expect(s.monthCount, 3);
    });

    test('average ticket = month volume / month count (rounded)', () {
      final s = MerchantDashboardStats.compute([
        _tx('COMPLETED', 100000, today),
        _tx('COMPLETED', 50000, yesterday),
      ], now: now);
      expect(s.monthCount, 2);
      expect(s.avgTicketMinor, 75000);
    });

    test('average ticket is null (masked) when there are no completed payments', () {
      final s = MerchantDashboardStats.compute([
        _tx('PENDING', 100000, today),
        _tx('FAILED', 50000, today),
      ], now: now);
      expect(s.avgTicketMinor, isNull);
    });

    test('success rate = completed / (completed + failed); pending ignored', () {
      final s = MerchantDashboardStats.compute([
        _tx('COMPLETED', 1, today),
        _tx('PAID', 1, today),
        _tx('FAILED', 1, today),
        _tx('PENDING', 1, today), // not terminal → excluded from rate
      ], now: now);
      // 2 completed (COMPLETED + PAID) / (2 completed + 1 failed) = 2/3
      expect(s.successRate, closeTo(2 / 3, 1e-9));
    });

    test('success rate is null when there are no terminal transactions', () {
      final s = MerchantDashboardStats.compute([
        _tx('PENDING', 1, today),
      ], now: now);
      expect(s.successRate, isNull);
    });

    test('7-day buckets attribute volume to the correct local day', () {
      final s = MerchantDashboardStats.compute([
        _tx('COMPLETED', 100000, today),
        _tx('COMPLETED', 40000, yesterday),
        _tx('COMPLETED', 60000, yesterday),
      ], now: now);

      expect(s.last7Days.length, 7);
      expect(s.last7Days.last.day, DateTime(2026, 6, 25)); // today is newest
      expect(s.last7Days.last.volumeMinor, 100000);
      final y = s.last7Days.firstWhere((d) => d.day == DateTime(2026, 6, 24));
      expect(y.volumeMinor, 100000); // 40000 + 60000
      expect(s.has7DayVolume, isTrue);
    });

    test('transactions outside the 7-day window do not pollute the chart', () {
      final s = MerchantDashboardStats.compute([
        _tx('COMPLETED', 200000, earlierMonth), // 22 days before "today"
      ], now: now);
      // still counted in the month total, but not in any 7-day bucket
      expect(s.monthVolumeMinor, 200000);
      expect(s.last7Days.every((d) => d.volumeMinor == 0), isTrue);
    });
  });
}
