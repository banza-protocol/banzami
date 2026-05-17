import 'dart:io';

import 'package:banzami_sdk/banzami_sdk.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:http/io_client.dart';
import 'app.dart';
import 'services/push_notification_service.dart';
import 'services/transfer_notification_service.dart';

void main() async {
  final binding = WidgetsFlutterBinding.ensureInitialized();
  FlutterNativeSplash.preserve(widgetsBinding: binding);

  await Firebase.initializeApp();
  await PushNotificationService.initialize();
  await TransferNotificationService.initialize();

  // In debug builds the server uses a Cloudflare Origin CA cert that Dart's
  // BoringSSL doesn't trust, so we bypass verification entirely.
  // In release/profile builds we use the pinned CA for maximum security.
  final pinnedClient = kDebugMode
      ? IOClient(HttpClient()..badCertificateCallback = (_, __, ___) => true)
      : await PinnedHttpClient.create();

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
