import 'package:firebase_core/firebase_core.dart';

import 'push_notification_service.dart';

/// This device's subscription to an account's push notifications.
///
/// Notifications reach a phone through the FCM topic the server named for the
/// account (A6-06, [PushNotificationService.joinServerTopic]) — the device
/// also leaves the legacy id-derived topics
/// ([PushNotificationService.legacyConsumerTopics]); Banzami keeps no
/// per-device token. Signing out must take the device off those topics, or
/// the next person to sign in on this phone keeps receiving the previous
/// account's notifications. The session service calls this interface so the
/// behaviour can be tested without Firebase.
abstract interface class PushTopicRegistration {
  /// Stops this device receiving [topic]. May throw or never complete (no
  /// network): callers treat it as best effort and never wait on it.
  Future<void> unsubscribe(String topic);
}

/// Firebase Cloud Messaging. The platform SDKs keep a topic operation that
/// could not reach FCM and retry it, so dispatching is what matters.
class FirebasePushTopicRegistration implements PushTopicRegistration {
  const FirebasePushTopicRegistration();

  @override
  Future<void> unsubscribe(String topic) async {
    // Firebase never started (it failed at launch): nothing was subscribed.
    if (Firebase.apps.isEmpty) return;
    await PushNotificationService.unsubscribeFromTopic(topic);
  }
}
