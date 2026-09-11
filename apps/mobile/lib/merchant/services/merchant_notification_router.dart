import 'package:flutter/foundation.dart';

/// Routes the Business App's push notifications.
///
/// The gateway sends a Business two kinds (services/api-gateway notify/fcm.go):
/// `payment_received` (a wallet or acquiring payment) and `payment_link_paid`
/// (a payment link was paid). Neither carries an id to open a single receipt,
/// so both lead to the Business's history, where the payment and its receipt
/// are. Before this router only the consumer app set a tap handler: tapping a
/// Business notification did nothing, and `payment_link_paid` was ignored in
/// the foreground.
class MerchantNotificationRouter {
  MerchantNotificationRouter._();

  static const paymentTypes = {'payment_received', 'payment_link_paid'};

  /// A tapped notification's data, waiting for the main screen — on a cold
  /// start (the tap arrives before the session has loaded) or while the app
  /// is behind the PIN. The main screen consumes it once it is showing.
  static final ValueNotifier<Map<String, String>?> pendingTap = ValueNotifier(null);

  /// Installed as PushNotificationService.onTap by the Business flavor, before
  /// Firebase initialises (so the cold-start getInitialMessage is not lost).
  static void handleTap(Map<String, dynamic> data) {
    pendingTap.value = data.map((k, v) => MapEntry(k, v.toString()));
  }

  static bool isPayment(Map<String, dynamic> data) =>
      paymentTypes.contains(data['type']?.toString());

  /// A notification from the other environment than the signed-in session's
  /// opens nothing. LIVE is canonical (PRODUCTION accepted from older
  /// senders); a missing environment is accepted, an unknown one is not.
  static bool isForEnvironment(Map<String, dynamic> data, String sessionEnvironment) {
    final env = data['environment']?.toString().trim().toUpperCase() ?? '';
    if (env.isEmpty) return true;
    final sandboxSession = sessionEnvironment.toUpperCase() == 'SANDBOX';
    if (sandboxSession) return env == 'SANDBOX';
    return env == 'LIVE' || env == 'PRODUCTION';
  }

  /// Whether a notification should take the signed-in Business to its history.
  static bool opensHistory(Map<String, dynamic> data, String sessionEnvironment) =>
      isPayment(data) && isForEnvironment(data, sessionEnvironment);
}
