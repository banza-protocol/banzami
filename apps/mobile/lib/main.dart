import 'package:banza_flutter/banza_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final pinnedClient = await PinnedHttpClient.create();

  // Lock orientation to portrait — standard for payment apps.
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor:            Colors.transparent,
    statusBarIconBrightness:   Brightness.light,
    statusBarBrightness:       Brightness.dark,
  ));

  runApp(BanzamiApp(pinnedClient: pinnedClient));
}
