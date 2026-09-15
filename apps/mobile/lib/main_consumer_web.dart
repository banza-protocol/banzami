
import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app.dart';
import 'platform/web_session_client.dart';

// Web entry point for App Banzami (WEB-APP-001 — one Flutter codebase, three
// targets). The SAME app.dart, screens and widgets as iOS and Android — only
// the platform bootstrap differs (adapters at the edges):
//
//   • Transport: a WebSessionClient (credentialed + CSRF) instead of dart:io
//     certificate pinning. The browser owns TLS; the Consumer Bearer is held by
//     the same-origin BFF in an HttpOnly cookie, never by this JS (§8). Every
//     Consumer call is same-origin to the BFF, which re-attaches the Bearer
//     server-side (§6/§9).
//   • No Firebase / Crashlytics / push init — no web support here yet; realtime
//     while the app is open, plus Web Push later, is the web adapter (§23/§24).
//   • No SystemChrome orientation lock — a no-op on web.
//
// The Consumer experience — auth, wallet, send, receive, QR, history, receipts,
// profile — is the shared code. Nothing about money, identity or the visual
// system is reimplemented for the browser.
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('pt', null);
  runApp(BanzamiApp(pinnedClient: WebSessionClient(), deviceId: null));
}
