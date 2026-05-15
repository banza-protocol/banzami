import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:google_fonts/google_fonts.dart';

import 'merchant/app.dart';
import 'merchant/services/payment_notification_service.dart';
import 'services/push_notification_service.dart';

void main() async {
  final binding = WidgetsFlutterBinding.ensureInitialized();
  FlutterNativeSplash.preserve(widgetsBinding: binding);

  // Disable network font fetching — fonts must be bundled in the app or the
  // system default is used. Prevents network calls during App Store review.
  GoogleFonts.config.allowRuntimeFetching = false;

  await Firebase.initializeApp();
  await PushNotificationService.initialize();
  await PaymentNotificationService.initialize();

  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor:          Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    statusBarBrightness:     Brightness.dark,
  ));

  FlutterNativeSplash.remove();
  runApp(const BanzamiMerchantApp());
}
