import 'package:firebase_core/firebase_core.dart';

import '../../services/push_notification_service.dart';

/// This device's registration for a Business's push notifications.
///
/// The Business App receives a Business's payment notifications through the
/// FCM topic the gateway named for it (A6-06,
/// [PushNotificationService.joinServerTopic]); the legacy id-derived topics
/// ([PushNotificationService.legacyMerchantTopics]) are only ever left. There
/// is no per-device token registered with Banzami. Ending the session must take the
/// device off that topic, or a signed-out phone keeps announcing the
/// Business's payments. [MerchantSessionService] owns that; this interface is
/// what it calls, so the behaviour can be tested without Firebase.
abstract interface class MerchantPushRegistration {
  /// Stops this device receiving [topic]. May throw or never complete (no
  /// network): callers treat it as best effort and never wait on it.
  Future<void> unsubscribe(String topic);
}

/// Firebase Cloud Messaging. The platform SDKs keep a topic operation that
/// could not reach FCM (no network) and retry it, so dispatching the
/// unsubscription is what matters; the Dart future is not awaited.
class FirebaseMerchantPushRegistration implements MerchantPushRegistration {
  const FirebaseMerchantPushRegistration();

  @override
  Future<void> unsubscribe(String topic) async {
    // Firebase never started (it failed at launch): nothing was subscribed.
    if (Firebase.apps.isEmpty) return;
    await PushNotificationService.unsubscribeFromTopic(topic);
  }
}
