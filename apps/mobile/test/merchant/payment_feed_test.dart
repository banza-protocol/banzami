import 'package:flutter_test/flutter_test.dart';
import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/merchant/models/merchant_payment_entry.dart';
import 'package:banzami_mobile/merchant/widgets/merchant_dashboard_stats.dart';

MerchantPaymentEntry _acq(String id, String status, DateTime at) =>
    MerchantPaymentEntry.fromTransaction(MerchantTransaction(
      id: id,
      status: status,
      amountMinor: 1000,
      currency: 'AOA',
      merchantId: 'm1',
      createdAt: at,
    ));

MerchantPaymentEntry _wal(String id, String status, DateTime at) =>
    MerchantPaymentEntry.fromWalletPayment(MerchantWalletPayment(
      id: id,
      reference: '',
      amountMinor: 2500,
      currency: 'AOA',
      status: status,
      payerName: '@ana',
      createdAt: at,
      receiptAvailable: status == 'COMPLETED',
    ));

DateTime _t(int minute) => DateTime.utc(2026, 9, 11, 10, minute);

/// A fake cursor-paginated source serving [rows] (newest first) [size] at a
/// time, counting its calls.
class _Pages {
  final List<MerchantPaymentEntry> rows;
  final int size;
  int calls = 0;
  _Pages(this.rows, this.size);

  Future<MerchantPaymentPage> call(String? cursor) async {
    calls++;
    final start = cursor == null ? 0 : int.parse(cursor);
    final end = (start + size).clamp(0, rows.length);
    return (rows.sublist(start, end), end < rows.length ? '$end' : null);
  }
}

void main() {
  group('wallet-native payments are Business payments', () {
    test('a COMPLETED wallet payment is received and counts in the KPIs', () {
      final now = DateTime(2026, 9, 11, 12);
      final s = MerchantDashboardStats.compute([
        _wal('w1', 'COMPLETED', DateTime(2026, 9, 11, 9)),
        _wal('w2', 'PENDING', DateTime(2026, 9, 11, 9)),
        _acq('t1', 'CAPTURED', DateTime(2026, 9, 11, 9)),
      ], now: now);
      expect(s.todayCount, 2);
      expect(s.todayVolumeMinor, 3500);
    });

    test('wallet statuses read as Portuguese labels; payer is the title', () {
      expect(_wal('w', 'COMPLETED', _t(0)).title, '@ana');
      expect(_wal('w', 'COMPLETED', _t(0)).stateLabel, 'Pagamento recebido');
      expect(_wal('w', 'CANCELLED', _t(0)).stateLabel, 'Cancelado');
      expect(_wal('w', 'REVERSED', _t(0)).stateLabel, 'Anulado');
      expect(_wal('w', 'FAILED', _t(0)).amountSign, '');
    });
  });

  group('mergePaymentEntries', () {
    test('both sources, newest first, each payment once', () {
      final merged = mergePaymentEntries([
        [_acq('t1', 'CAPTURED', _t(5)), _acq('t2', 'CAPTURED', _t(1))],
        [_wal('w1', 'COMPLETED', _t(3)), _wal('w1', 'COMPLETED', _t(3))],
      ]);
      expect(merged.map((e) => e.id), ['t1', 'w1', 't2']);
    });
  });

  group('MerchantPaymentFeed', () {
    test('interleaves two sources in time order across pages', () async {
      final acq = _Pages([
        for (final m in [50, 40, 30, 20, 10]) _acq('t$m', 'CAPTURED', _t(m)),
      ], 2);
      final wal = _Pages([
        for (final m in [45, 35, 5]) _wal('w$m', 'COMPLETED', _t(m)),
      ], 2);
      final feed = MerchantPaymentFeed([acq.call, wal.call]);

      await feed.loadMore();
      // acquiring read down to :40, wallet down to :35 → only rows ≥ :40 are
      // safe: an older acquiring page could still hold :39.
      expect(feed.visible.map((e) => e.id), ['t50', 'w45', 't40']);

      while (feed.hasMore) {
        await feed.loadMore();
      }
      expect(feed.visible.map((e) => e.id),
          ['t50', 'w45', 't40', 'w35', 't30', 't20', 't10', 'w5']);
    });

    test('reset starts over from the newest page', () async {
      final acq = _Pages([_acq('t1', 'CAPTURED', _t(1))], 10);
      final wal = _Pages([_wal('w1', 'COMPLETED', _t(2))], 10);
      final feed = MerchantPaymentFeed([acq.call, wal.call]);
      await feed.loadMore();
      feed.reset();
      expect(feed.visible, isEmpty);
      await feed.loadMore();
      expect(feed.visible.map((e) => e.id), ['w1', 't1']);
      expect(acq.calls, 2);
    });
  });

  group('ReceivedPaymentTracker (foreground poller)', () {
    test('first look is silent; a new wallet payment is announced once', () {
      final tracker = ReceivedPaymentTracker();
      expect(tracker.newlyReceived([_acq('t1', 'CAPTURED', _t(1))]), isEmpty);

      final next = [
        _wal('w1', 'COMPLETED', _t(2)),
        _acq('t1', 'CAPTURED', _t(1)),
      ];
      expect(tracker.newlyReceived(next).map((e) => e.id), ['w1']);
      expect(tracker.newlyReceived(next), isEmpty);
    });

    test('a payment pending at first sight is announced when received', () {
      final tracker = ReceivedPaymentTracker();
      tracker.newlyReceived([_wal('w1', 'PENDING', _t(1))]);
      expect(
        tracker.newlyReceived([_wal('w1', 'COMPLETED', _t(1))]).map((e) => e.id),
        ['w1'],
      );
    });
  });
}
