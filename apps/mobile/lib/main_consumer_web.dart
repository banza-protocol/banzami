
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app.dart';
import 'merchant/app.dart';
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

  // One App Banzami Web, two product contexts (ADR-066). The shell is chosen from
  // the URL path: `/business…` boots the Business context; every other path is the
  // Consumer root, exactly as before. Payer routes always stay Consumer.
  final segments = Uri.base.pathSegments.where((s) => s.isNotEmpty).toList();
  final isBusiness = segments.isNotEmpty && segments.first == 'business';

  // Default status-bar intent for the web device shell (WebDesktopShell reads it):
  // the Consumer home is a LIGHT surface → dark icons (as in the reference); the
  // Business home is a RED surface → light icons. Individual coloured screens (the
  // Consumer welcome/onboarding) override this to light via an AnnotatedRegion.
  SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: isBusiness ? Brightness.light : Brightness.dark,
    statusBarBrightness: isBusiness ? Brightness.dark : Brightness.light,
  ));

  if (isBusiness) {
    // `/business` runs the ACTUAL native App Banzami Business (the same
    // `BanzamiMerchantApp` root, screens, session and design system as iOS /
    // Android) inside the WebDesktopShell — exactly as `/` runs the real
    // `BanzamiApp` (APP-BANZAMI-WEB-DUAL-APP-PARITY-001). There is NO Web-specific
    // Business product implementation: only the transport edge differs — a
    // WebSessionClient (credentialed + CSRF) to the same-origin BFF, which holds
    // the merchant JWT server-side and owns renewal (ADR-066).
    runApp(BanzamiMerchantApp(pinnedClient: WebSessionClient()));
    return;
  }
  runApp(BanzamiApp(pinnedClient: WebSessionClient(), deviceId: null));
}
