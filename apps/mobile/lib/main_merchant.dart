import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'merchant/app.dart';
import 'merchant/services/payment_notification_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

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

  runApp(const BanzamiMerchantApp());
}
