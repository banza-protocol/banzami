import 'dart:async';

import 'package:banza_flutter/banza_flutter.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'push_notification_service.dart';

/// Polls for new incoming transfers and fires local notifications.
/// Used as a foreground fallback — real push notifications arrive via FCM.
///
/// Start with [startPolling] when the consumer session is active.
/// Stop with [stopPolling] on logout or app background.
class TransferNotificationService {
  final ConsumerPublicClient _client;
  final String _consumerId;

  TransferNotificationService(this._client, {required String consumerId})
      : _consumerId = consumerId;

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
    _poll();
  }

  void stopPolling() {
    _timer?.cancel();
    _timer = null;
  }

  Future<void> _poll() async {
    try {
      final page = await _client.listTransfers(limit: 10);
      if (page.data.isEmpty) return;

      if (_latestSeenId == null) {
        _latestSeenId = page.data.first.id;
        return;
      }

      final newIncoming = <Transfer>[];
      for (final tx in page.data) {
        if (tx.id == _latestSeenId) break;
        if (tx.recipientId == _consumerId && tx.isCompleted) {
          newIncoming.add(tx);
        }
      }

      _latestSeenId = page.data.first.id;

      for (final tx in newIncoming) {
        await _notify(tx);
      }
    } catch (_) {
      // Non-critical — swallow all errors.
    }
  }

  Future<void> _notify(Transfer tx) async {
    final amount = formatMinor(tx.amountMinor, tx.currency);
    final body   = tx.description?.isNotEmpty == true
        ? tx.description!
        : 'Transferência recebida';

    await _plugin.show(
      _notifId++,
      'Recebeu $amount',
      body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'banzami_transfers',
          'Transferências',
          channelDescription: 'Alertas de transferências recebidas',
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
