import 'dart:async';

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
  /// Set by MainScreen to show a BanzamiToast using its BuildContext.
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

    // Foreground: show in-app BanzamiToast via callback, or fall back to local OS notification.
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
      alert: false, // we handle it ourselves via onForegroundMessage / BanzamiToast
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
  //
  // A6-06. FCM does not check who subscribes to a topic, and Banzami's Firebase
  // client configuration is public. An account's topic is therefore named by
  // the server — a keyed hash of the account id — and disclosed only to the
  // account's own session (consumer: public-api GET /v1/me/push-topic;
  // Business: gateway GET /v1/merchant/push-topic). This app subscribes to
  // exactly the name it is given and never derives a topic from an id.
  //
  // The id-derived names below are the LEGACY topics (anyone who knew the id
  // could subscribe to them). The server no longer publishes to them; the
  // device only ever leaves them.

  /// The legacy topics a consumer's notifications went to before A6-06, in
  /// both environments. Left, never joined.
  static List<String> legacyConsumerTopics(String consumerId) => [
        'consumer_$consumerId',
        'sandbox_consumer_$consumerId',
      ];

  /// The legacy topics a Business's notifications went to before A6-06, in
  /// both environments. Left, never joined.
  static List<String> legacyMerchantTopics(String merchantId) => [
        'merchant_$merchantId',
        'sandbox_merchant_$merchantId',
      ];

  /// Joins the signed-in account's topic, exactly as the server names it
  /// ([fetchTopic] asks the account's own session), and leaves [legacyTopics].
  ///
  /// No topic from the server (not configured there, or the request failed):
  /// the device joins nothing — push stays off rather than falling back to a
  /// guessable name. [remember] is called with the topic BEFORE subscribing,
  /// so a sign-out that happens meanwhile knows what to leave. [stillWanted]
  /// is checked before subscribing (and again after the APNs wait): a session
  /// that ended meanwhile has already left, and subscribing would undo that.
  ///
  /// Returns the topic joined, or null.
  static Future<String?> joinServerTopic({
    required Future<String?> Function() fetchTopic,
    required List<String> legacyTopics,
    FutureOr<void> Function(String topic)? remember,
    bool Function()? stillWanted,
    PushTopicOps ops = const FirebasePushTopicOps(),
  }) async {
    for (final legacy in legacyTopics) {
      unawaited(Future.sync(() => ops.unsubscribe(legacy)).catchError((Object e) {
        debugPrint('[FCM] could not leave a legacy topic: ${e.runtimeType}');
      }));
    }

    String? topic;
    try {
      topic = await fetchTopic();
    } catch (e) {
      debugPrint('[FCM] could not fetch the push topic: ${e.runtimeType}');
    }
    if (topic == null || topic.isEmpty || legacyTopics.contains(topic)) {
      debugPrint('[FCM] no push topic from the server — not subscribing');
      _fcmDiagSnapshot['subscribed_topic'] = '— (none from the server)';
      return null;
    }
    if (stillWanted != null && !stillWanted()) return null;

    await remember?.call(topic);
    _fcmDiagSnapshot['subscribed_topic'] = _masked(topic);
    await ops.subscribe(topic, stillWanted: stillWanted);
    return topic;
  }

  /// A topic as it may appear in a log or the debug panel: enough to tell
  /// two apart, not enough to subscribe with.
  static String _masked(String topic) =>
      topic.length <= 12 ? '…' : '${topic.substring(0, 12)}…';

  static Future<void> unsubscribeFromTopic(String topic) =>
      _messaging.unsubscribeFromTopic(topic);

  static Future<void> _subscribeTopic(String topic, {bool Function()? stillWanted}) async {
    final apns = await _getApnsToken();
    if (apns == null) {
      debugPrint('[FCM] APNs unavailable — skipping subscribeToTopic');
      _fcmDiagSnapshot['subscribe_success'] = 'false (APNs unavailable)';
      return;
    }
    if (stillWanted != null && !stillWanted()) {
      debugPrint('[FCM] session ended before subscribing — skipping subscribeToTopic');
      return;
    }
    try {
      await _messaging.subscribeToTopic(topic);
      _fcmDiagSnapshot['subscribe_success'] = 'true';
      debugPrint('[FCM] subscribe success=true topic=${_masked(topic)}');
    } catch (e) {
      _fcmDiagSnapshot['subscribe_success'] = 'false ($e)';
      debugPrint('[FCM] subscribe success=false topic=${_masked(topic)} error=${e.runtimeType}');
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
      'environment':       AppConfig.isSandbox ? 'SANDBOX' : 'PRODUCTION',
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
    final channelId   = data['channel_id']   as String? ?? 'banzami_push';
    final channelName = data['channel_name'] as String? ?? 'Banzami';

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

/// The FCM topic operations [PushNotificationService.joinServerTopic] makes;
/// a test passes its own to see what the device would join and leave.
abstract interface class PushTopicOps {
  Future<void> subscribe(String topic, {bool Function()? stillWanted});
  Future<void> unsubscribe(String topic);
}

/// Firebase Cloud Messaging.
class FirebasePushTopicOps implements PushTopicOps {
  const FirebasePushTopicOps();

  @override
  Future<void> subscribe(String topic, {bool Function()? stillWanted}) async {
    if (Firebase.apps.isEmpty) return; // Firebase never started
    await PushNotificationService._subscribeTopic(topic, stillWanted: stillWanted);
  }

  @override
  Future<void> unsubscribe(String topic) async {
    if (Firebase.apps.isEmpty) return;
    await PushNotificationService.unsubscribeFromTopic(topic);
  }
}
