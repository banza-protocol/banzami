import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app.dart';
import 'services/transfer_notification_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await TransferNotificationService.initialize();

  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor:          Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    statusBarBrightness:     Brightness.dark,
  ));

  runApp(const BanzamiApp());
}
