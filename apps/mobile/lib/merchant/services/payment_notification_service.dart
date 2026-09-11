import 'dart:async';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../../services/push_notification_service.dart';
import '../models/merchant_payment_entry.dart';

/// Polls for newly received payments and fires local notifications.
/// Used as a foreground fallback — real push notifications arrive via FCM.
///
/// Start with [startPolling] when the merchant session is active.
/// Stop with [stopPolling] on logout or app background.
class PaymentNotificationService {
  final BanzamiClient _client;

  PaymentNotificationService(this._client);

  // Delegates initialisation to PushNotificationService (single plugin instance).
  static final _plugin = FlutterLocalNotificationsPlugin();

  static Future<void> initialize() =>
      PushNotificationService.initialize();

  Timer?  _timer;
  final   _tracker = ReceivedPaymentTracker();
  int     _notifId = 0;

  void startPolling() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _poll());
    _poll(); // immediate first check
  }

  void stopPolling() {
    _timer?.cancel();
    _timer = null;
  }

  // Both sources: acquiring transactions AND wallet-native payments. A QR,
  // link or session payment exists only in the second, so polling the first
  // alone never announced one.
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
      for (final entry in _tracker.newlyReceived(mergePaymentEntries(results))) {
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
