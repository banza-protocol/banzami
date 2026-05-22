import 'dart:async';

import 'package:banza_flutter/banza_flutter.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../config.dart';
import 'push_notification_service.dart';

/// Polls for new incoming activity and fires local notifications.
/// Used as a foreground fallback — real push notifications arrive via FCM.
///
/// Start with [startPolling] when the consumer session is active.
/// Stop with [stopPolling] on logout or app background.
class TransferNotificationService {
  final ConsumerPublicClient _client;

  TransferNotificationService(this._client, {required String consumerId});

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
      final page = await _client.getActivity(limit: 10, directionFilter: 'INCOMING');
      if (page.items.isEmpty) return;

      if (_latestSeenId == null) {
        _latestSeenId = page.items.first.activityId;
        return;
      }

      final newIncoming = <ActivityItem>[];
      for (final item in page.items) {
        if (item.activityId == _latestSeenId) break;
        newIncoming.add(item);
      }

      _latestSeenId = page.items.first.activityId;

      for (final item in newIncoming) {
        await _notify(item);
      }
    } catch (_) {
      // Non-critical — swallow all errors.
    }
  }

  Future<void> _notify(ActivityItem item) async {
    final amount  = formatMinor(item.amountMinor, item.currency);
    final body    = item.note?.isNotEmpty == true
        ? item.note!
        : 'Transferência recebida';
    final prefix  = AppConfig.isSandbox ? '[SANDBOX] ' : '';

    await _plugin.show(
      _notifId++,
      '${prefix}Recebeu $amount',
      body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'banza_transfers',
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
