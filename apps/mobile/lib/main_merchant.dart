import 'dart:async';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'merchant/app.dart';
import 'merchant/services/merchant_notification_router.dart';
import 'merchant/services/payment_notification_service.dart';
import 'services/push_notification_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('pt', null);

  // Business notification taps (including the cold-start one Firebase
  // delivers during initialisation) are parked for the main screen.
  PushNotificationService.onTap = (msg) => MerchantNotificationRouter.handleTap(msg.data);

  // Slow services run in the background — they must NEVER block runApp.
  // iOS holds the native launch screen until Flutter paints its first frame,
  // so every await before runApp is a frozen red splash from the user's
  // perspective. (This mirrors main_consumer.dart.)
  unawaited(_initBackgroundServices());

  final pinnedClient = await PinnedHttpClient.create();

  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor:          Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    statusBarBrightness:     Brightness.dark,
  ));

  runApp(BanzamiMerchantApp(pinnedClient: pinnedClient));
}

/// Firebase, Crashlytics and notification setup — each guarded with a timeout
/// and try/catch so a slow or failing service can never wedge startup.
Future<void> _initBackgroundServices() async {
  try {
    await Firebase.initializeApp().timeout(const Duration(seconds: 10));
  } catch (e) {
    debugPrint('[FCM] Firebase init error=$e');
  }

  FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
  PlatformDispatcher.instance.onError = (error, stack) {
    FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
    return true;
  };
  try {
    await FirebaseCrashlytics.instance
        .setCrashlyticsCollectionEnabled(!kDebugMode)
        .timeout(const Duration(seconds: 5));
  } catch (e) {
    debugPrint('[FCM] Crashlytics init error=$e');
  }

  try {
    await PushNotificationService.initialize()
        .timeout(const Duration(seconds: 10));
  } catch (e) {
    debugPrint('[FCM] PushNotificationService.initialize error=$e');
  }

  try {
    await PaymentNotificationService.initialize()
        .timeout(const Duration(seconds: 5));
  } catch (e) {
    debugPrint('[PAY] PaymentNotificationService.initialize error=$e');
  }
}
