import 'dart:async';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:flutter/foundation.dart' show kIsWeb, visibleForTesting;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../../services/push_notification_service.dart';
import '../models/merchant_payment_entry.dart';
import 'merchant_refresh_bus.dart';

/// Polls for newly received payments, signals the Business Home to refetch, and
/// (on native) fires local notifications.
///
/// The two jobs are deliberately separate. Detection and the refresh signal are
/// portable and run everywhere; the local notification needs a plugin that does
/// not exist on Web. They used to be one job, so gating the notification gated
/// the refresh too — and the Web Business Home simply never updated.
///
/// Start with [startPolling] when the merchant session is active.
/// Stop with [stopPolling] on logout or app background.
class PaymentNotificationService {
  final BanzamiClient _client;

  /// Injectable only so the Web branch is testable off a browser (kIsWeb is a
  /// compile-time false in the VM test host). Production always uses kIsWeb.
  final bool isWeb;

  PaymentNotificationService(this._client, {bool? isWeb}) : isWeb = isWeb ?? kIsWeb;

  // Delegates initialisation to PushNotificationService (single plugin instance).
  static final _plugin = FlutterLocalNotificationsPlugin();

  static Future<void> initialize() =>
      PushNotificationService.initialize();

  Timer?  _timer;
  final   _tracker = ReceivedPaymentTracker();
  int     _notifId = 0;

  /// How often a foregrounded Business asks whether it has been paid.
  ///
  /// It was 30 seconds, which is fine for a notification and far too slow for a
  /// balance: CLAUDE.md §2.6 puts the acceptable perceived latency at five
  /// seconds, and the merchant seeing the payment is the whole promise of the
  /// surface. The consumer path polls canonical reads every two seconds, but it
  /// does so SERVER-side behind one SSE stream; this is a client asking over the
  /// network, so it sits at the outer bound rather than matching that.
  ///
  /// Only while foregrounded — [stopPolling] runs on background and on logout.
  static const pollInterval = Duration(seconds: 5);

  void startPolling() {
    _timer?.cancel();
    _timer = Timer.periodic(pollInterval, (_) => _poll());
    _poll(); // immediate first check
  }

  void stopPolling() {
    _timer?.cancel();
    _timer = null;
  }

  // Both sources: acquiring transactions AND wallet-native payments. A QR,
  // link or session payment exists only in the second, so polling the first
  // alone never announced one.
  /// One poll. Exposed so the refresh-signal contract can be proven without a
  /// timer and without a browser.
  @visibleForTesting
  Future<void> pollOnce() => _poll();

  Future<void> _poll() async {
    try {
      final results = await Future.wait([
        _client
            .listMerchantTransactions(limit: 10)
            .then((p) => p.data.map(MerchantPaymentEntry.fromTransaction)),
        _client
            .listMerchantWalletPayments(limit: 10)
            .then((p) => p.items.map(MerchantPaymentEntry.fromWalletPayment)),
      ]);
      // The first poll only records what is already there.
      final received = _tracker.newlyReceived(mergePaymentEntries(results));
      if (received.isNotEmpty) {
        // Tell the Home to refetch BEFORE notifying. The signal carries no
        // amount and no balance — it says when to re-read, never what is true
        // (CLAUDE.md §2.1). This is the only thing the Web surface needs from
        // this service, and it must not depend on the notification plugin,
        // which does not exist there.
        MerchantRefreshBus.instance.signal();
      }
      if (isWeb) return; // no local-notification plugin on Web (ADR-066)
      for (final entry in received) {
        await _notify(entry);
      }
    } catch (_) {
      // Polling is non-critical — swallow all errors.
    }
  }

  Future<void> _notify(MerchantPaymentEntry tx) async {
    final amount = formatMinor(tx.amountMinor, tx.currency);
    final description = tx.description ?? tx.payer ?? 'Pagamento recebido';

    await _plugin.show(
      _notifId++,
      'Pagamento recebido — $amount',
      description,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'banzami_payments',
          'Pagamentos',
          channelDescription: 'Alertas de novos pagamentos recebidos',
          importance: Importance.high,
          priority:   Priority.high,
        ),
        iOS: DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
    );
  }
}
