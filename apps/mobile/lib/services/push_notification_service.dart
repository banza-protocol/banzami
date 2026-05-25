import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../config.dart';

// Top-level handler required by firebase_messaging for background/terminated messages.
// Firebase shows the OS notification automatically when the message has a notification
// payload, so we only need to ensure Firebase is initialized.
@pragma('vm:entry-point')
Future<void> _onBackgroundMessage(RemoteMessage message) async {
  await Firebase.initializeApp();
  debugPrint('[FCM] background message type=${message.data["type"]} '
      'title=${message.notification?.title}');
}

class PushNotificationService {
  PushNotificationService._();

  static final _messaging   = FirebaseMessaging.instance;
  static final _localPlugin = FlutterLocalNotificationsPlugin();
  static bool  _initialized = false;

  // ── Callbacks set by the app layer ──────────────────────────────────────────

  /// Called when a notification arrives while the app is in the foreground.
  /// Set by MainScreen to show a BanzaToast using its BuildContext.
  static void Function(RemoteMessage)? onForegroundMessage;

  /// Called when the user taps a notification (background or terminated state).
  /// Set by app.dart to handle routing.
  static void Function(RemoteMessage)? onTap;

  // ── Initialization ─────────────────────────────────────────────────────────

  /// Called once at app startup, after Firebase.initializeApp().
  static Future<void> initialize() async {
    if (_initialized) return;

    debugPrint('[FCM] initializing');

    FirebaseMessaging.onBackgroundMessage(_onBackgroundMessage);

    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const darwin  = DarwinInitializationSettings(
      requestAlertPermission: false, // permission asked separately via requestPermission()
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await _localPlugin.initialize(
      const InitializationSettings(android: android, iOS: darwin, macOS: darwin),
      onDidReceiveNotificationResponse: (details) {
        // Local notification tap (foreground notification shown as OS banner).
        debugPrint('[FCM] local notification tapped payload=${details.payload}');
      },
    );

    // Foreground: show in-app BanzaToast via callback, or fall back to local OS notification.
    FirebaseMessaging.onMessage.listen((msg) {
      debugPrint('[FCM] foreground message type=${msg.data["type"]} '
          'title=${msg.notification?.title}');
      if (onForegroundMessage != null) {
        onForegroundMessage!(msg);
      } else {
        _showLocal(msg);
      }
    });

    // Background tap (app was in background, user tapped notification).
    FirebaseMessaging.onMessageOpenedApp.listen((msg) {
      debugPrint('[FCM] notification opened from background '
          'type=${msg.data["type"]} route=${msg.data["route"]}');
      onTap?.call(msg);
    });

    // Terminated tap (app was closed, user tapped notification — check on startup).
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) {
      debugPrint('[FCM] opened from terminated '
          'type=${initial.data["type"]} route=${initial.data["route"]}');
      // Defer to post-frame so the navigator is ready.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        onTap?.call(initial);
      });
    }

    // iOS foreground presentation — let Firebase show the OS banner too,
    // so the app works correctly even if onForegroundMessage is not set yet.
    await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
      alert: false, // we handle it ourselves via onForegroundMessage / BanzaToast
      badge: true,
      sound: true,
    );

    // Token refresh — update backend subscription when FCM rotates the token.
    _messaging.onTokenRefresh.listen((newToken) {
      debugPrint('[FCM] token refresh — re-subscribing');
      // Re-subscription is topic-based; no backend call needed.
      // The new token auto-applies to existing topic subscriptions in Firebase.
    });

    _initialized = true;
    debugPrint('[FCM] initialized');
  }

  // ── Permission ─────────────────────────────────────────────────────────────

  /// Requests notification permission on iOS (Android 13+ asks at runtime too).
  /// Returns true if the user granted (or provisional) permission.
  static Future<bool> requestPermission() async {
    final settings = await _messaging.requestPermission(
      alert:       true,
      badge:       true,
      sound:       true,
      provisional: false,
    );
    final status = settings.authorizationStatus;
    debugPrint('[FCM] permission status=$status');
    return status == AuthorizationStatus.authorized ||
           status == AuthorizationStatus.provisional;
  }

  // ── Token ──────────────────────────────────────────────────────────────────

  /// Returns the FCM registration token, waiting for APNs token first on iOS.
  /// Returns null on simulator or when APNs entitlement is missing.
  static Future<String?> getToken() async {
    final apns = await _getApnsToken();
    if (apns == null) {
      debugPrint('[FCM] APNs token unavailable — skipping getToken()');
      return null;
    }
    final token = await _messaging.getToken();
    debugPrint('[FCM] token=${token?.substring(0, token.length.clamp(0, 16))}...');
    return token;
  }

  // ── Topic subscription ─────────────────────────────────────────────────────

  /// Subscribes to a consumer topic with sandbox isolation.
  /// Use this for the logged-in consumer: topic = consumer_<id> or sandbox_consumer_<id>.
  static Future<void> subscribeConsumer(String consumerId) async {
    final topic = AppConfig.isSandbox
        ? 'sandbox_consumer_$consumerId'
        : 'consumer_$consumerId';
    await _subscribeTopic(topic);
  }

  /// Subscribes to a merchant topic with sandbox isolation.
  static Future<void> subscribeMerchant(String merchantId) async {
    final topic = AppConfig.isSandbox
        ? 'sandbox_merchant_$merchantId'
        : 'merchant_$merchantId';
    await _subscribeTopic(topic);
  }

  /// Generic topic subscription — still exposed for backward compatibility.
  static Future<void> subscribeToTopic(String topic) => _subscribeTopic(topic);

  static Future<void> unsubscribeFromTopic(String topic) =>
      _messaging.unsubscribeFromTopic(topic);

  static Future<void> _subscribeTopic(String topic) async {
    final apns = await _getApnsToken();
    if (apns == null) {
      debugPrint('[FCM] APNs unavailable — skipping subscribeToTopic($topic)');
      return;
    }
    await _messaging.subscribeToTopic(topic);
    debugPrint('[FCM] subscribed topic=$topic');
  }

  // ── APNs helper ─────────────────────────────────────────────────────────────

  // iOS registers with APNs asynchronously. Returns the token once available,
  // or null after 30 s (simulator / missing entitlement).
  static Future<String?> _getApnsToken() async {
    for (var i = 0; i < 30; i++) {
      final apns = await _messaging.getAPNSToken();
      if (apns != null) return apns;
      await Future.delayed(const Duration(seconds: 1));
    }
    debugPrint('[FCM] APNs token not available after 30 s');
    return null;
  }

  // ── Local notification fallback ────────────────────────────────────────────

  // Shows a local OS notification when onForegroundMessage is not set.
  static Future<void> _showLocal(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;

    final data        = message.data;
    final channelId   = data['channel_id']   as String? ?? 'banza_push';
    final channelName = data['channel_name'] as String? ?? 'Banza';

    await _localPlugin.show(
      notification.hashCode,
      notification.title,
      notification.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          channelId,
          channelName,
          importance: Importance.high,
          priority:   Priority.high,
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
    );
  }
}
