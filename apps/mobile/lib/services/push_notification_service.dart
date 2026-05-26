import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../config.dart';

// Mutable snapshot updated by subscribeConsumer/getToken for the debug panel.
Map<String, String> _fcmDiagSnapshot = {};

// Full FCM token — stored separately so the debug panel can pass it to the
// backend for direct-token delivery tests (snapshot only stores a truncated copy).
String? _fcmFullToken;

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
  static bool   _initialized = false;

  /// Full FCM registration token — exposed for direct-token debug push delivery.
  static String? get fcmToken => _fcmFullToken;

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
      debugPrint('[FCM] onMessage fired '
          'type=${msg.data["type"]} '
          'title=${msg.notification?.title} '
          'hasNotification=${msg.notification != null} '
          'hasCallback=${onForegroundMessage != null}');
      if (onForegroundMessage != null) {
        onForegroundMessage!(msg);
      } else {
        debugPrint('[FCM] onForegroundMessage not set — falling back to local notification');
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

    // Token refresh — update stored token when FCM rotates the registration.
    _messaging.onTokenRefresh.listen((newToken) {
      debugPrint('[FCM] token refresh — updating stored token');
      _fcmFullToken = newToken;
      _fcmDiagSnapshot['fcm_token'] =
          '${newToken.substring(0, newToken.length.clamp(0, 8))}…'
          '${newToken.substring((newToken.length - 4).clamp(0, newToken.length))}';
      // Re-subscription is topic-based; new token auto-applies to existing subscriptions.
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
      _fcmDiagSnapshot['apns_token'] = 'unavailable';
      return null;
    }
    _fcmDiagSnapshot['apns_token'] = 'present';
    final token = await _messaging.getToken();
    if (token != null) {
      _fcmFullToken = token;
      _fcmDiagSnapshot['fcm_token'] =
          '${token.substring(0, token.length.clamp(0, 8))}…${token.substring((token.length - 4).clamp(0, token.length))}';
    }
    debugPrint('[FCM] APNs token=present FCM token=${_fcmDiagSnapshot["fcm_token"] ?? "null"}');
    return token;
  }

  // ── Topic subscription ─────────────────────────────────────────────────────

  /// Subscribes to a consumer topic with sandbox isolation.
  /// Use this for the logged-in consumer: topic = consumer_<id> or sandbox_consumer_<id>.
  static Future<void> subscribeConsumer(String consumerId) async {
    final topic = AppConfig.isSandbox
        ? 'sandbox_consumer_$consumerId'
        : 'consumer_$consumerId';
    _fcmDiagSnapshot['consumer_id']     = consumerId;
    _fcmDiagSnapshot['subscribed_topic'] = topic;
    _fcmDiagSnapshot['environment']     = AppConfig.isSandbox ? 'SANDBOX' : 'PRODUCTION';
    debugPrint('[FCM] AppConfig.isSandbox=${AppConfig.isSandbox} consumerId=$consumerId');
    debugPrint('[FCM] subscribing topic=$topic');
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
      _fcmDiagSnapshot['subscribe_success'] = 'false (APNs unavailable)';
      return;
    }
    try {
      await _messaging.subscribeToTopic(topic);
      _fcmDiagSnapshot['subscribe_success'] = 'true';
      debugPrint('[FCM] subscribe success=true topic=$topic');
    } catch (e) {
      _fcmDiagSnapshot['subscribe_success'] = 'false ($e)';
      debugPrint('[FCM] subscribe success=false topic=$topic error=$e');
    }
  }

  // ── Diagnostics ────────────────────────────────────────────────────────────

  /// Returns a snapshot of current FCM state for the debug panel.
  /// Safe to call at any time — returns what was last recorded.
  static Future<Map<String, String>> diagnostics() async {
    // Re-check permission status live.
    final settings = await _messaging.getNotificationSettings();
    final status   = settings.authorizationStatus;
    return {
      'permission':        status.toString().replaceAll('AuthorizationStatus.', ''),
      'environment':       _fcmDiagSnapshot['environment']      ?? (AppConfig.isSandbox ? 'SANDBOX' : 'PRODUCTION'),
      'consumer_id':       _fcmDiagSnapshot['consumer_id']      ?? '—',
      'subscribed_topic':  _fcmDiagSnapshot['subscribed_topic'] ?? '—',
      'apns_token':        _fcmDiagSnapshot['apns_token']       ?? '—',
      'fcm_token':         _fcmDiagSnapshot['fcm_token']        ?? '—',
      'subscribe_success': _fcmDiagSnapshot['subscribe_success'] ?? '—',
    };
  }

  // ── APNs helper ─────────────────────────────────────────────────────────────

  // iOS registers with APNs asynchronously. Returns the token once available,
  // or null after 30 s (simulator / missing entitlement).
  static Future<String?> _getApnsToken() async {
    for (var i = 0; i < 30; i++) {
      final apns = await _messaging.getAPNSToken();
      if (apns != null) {
        if (i > 0) debugPrint('[FCM] APNs token available after ${i}s');
        return apns;
      }
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
