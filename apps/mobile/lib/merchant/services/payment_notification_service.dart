import 'dart:async';

import 'package:banza_flutter/banza_flutter.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../../services/push_notification_service.dart';

/// Polls for new completed transactions and fires local notifications.
/// Used as a foreground fallback — real push notifications arrive via FCM.
///
/// Start with [startPolling] when the merchant session is active.
/// Stop with [stopPolling] on logout or app background.
class PaymentNotificationService {
  final BanzaClient _client;

  PaymentNotificationService(this._client);

  // Delegates initialisation to PushNotificationService (single plugin instance).
  static final _plugin = FlutterLocalNotificationsPlugin();

  static Future<void> initialize() =>
      PushNotificationService.initialize();

  Timer?  _timer;
  String? _latestSeenId;
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

  Future<void> _poll() async {
    try {
      final page = await _client.listMerchantTransactions(limit: 10);
      if (page.data.isEmpty) return;

      // On first poll just record the latest ID — no notification.
      if (_latestSeenId == null) {
        _latestSeenId = page.data.first.id;
        return;
      }

      final newTxs = <MerchantTransaction>[];
      for (final tx in page.data) {
        if (tx.id == _latestSeenId) break;
        if (tx.isCompleted) newTxs.add(tx);
      }

      if (newTxs.isEmpty) {
        // Update marker even if none are completed, so we don't re-check old ones.
        _latestSeenId = page.data.first.id;
        return;
      }

      _latestSeenId = page.data.first.id;

      for (final tx in newTxs) {
        await _notify(tx);
      }
    } catch (_) {
      // Polling is non-critical — swallow all errors.
    }
  }

  Future<void> _notify(MerchantTransaction tx) async {
    final amount = formatMinor(tx.amountMinor, tx.currency);
    final description = tx.description?.isNotEmpty == true
        ? tx.description!
        : 'Pagamento recebido';

    await _plugin.show(
      _notifId++,
      'Pagamento recebido — $amount',
      description,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'banza_payments',
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
