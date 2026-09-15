import 'dart:async';

import 'app.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:intl/date_symbol_data_local.dart';

// Web entry point for App Banzami (WEB-APP-VISUAL-PARITY-001 / one Flutter
// codebase, three targets). The SAME app.dart, screens and widgets as iOS and
// Android — only the platform bootstrap differs (adapters at the edges):
//   • no dart:io certificate pinning — the browser owns TLS, so a plain
//     http.Client (BrowserClient on web) is used;
//   • no Firebase / Crashlytics / push init (no web support here yet — realtime
//     while the app is open, plus Web Push later, is the web adapter);
//   • no SystemChrome orientation lock (a no-op on web).
// The Consumer experience — auth, wallet, send, receive, QR, history, receipts,
// profile — is the shared code.
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('pt', null);
  runApp(BanzamiApp(pinnedClient: http.Client(), deviceId: null));
}
