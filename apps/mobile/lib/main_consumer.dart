import 'dart:async';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'app.dart';
import 'services/push_notification_service.dart';
import 'services/transfer_notification_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('pt', null);

  // Slow services run in background — must not block runApp.
  // iOS holds the native launch screen until Flutter paints its first frame,
  // so every await here is a blank red screen from the user's perspective.
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

  runApp(BanzamiApp(pinnedClient: pinnedClient));
}

Future<void> _initBackgroundServices() async {
  try {
    await Firebase.initializeApp().timeout(const Duration(seconds: 10));
    debugPrint('[FCM] Firebase initialized=true');
  } catch (e) {
    debugPrint('[FCM] Firebase initialized=false error=$e');
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
    await TransferNotificationService.initialize()
        .timeout(const Duration(seconds: 5));
  } catch (e) {
    debugPrint('[FCM] TransferNotificationService.initialize error=$e');
  }
}
