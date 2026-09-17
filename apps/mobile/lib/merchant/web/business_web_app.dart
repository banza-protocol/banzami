import 'package:banzami_flutter/banzami_flutter.dart' hide Consumer;
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

import 'business_login_screen.dart';
import 'business_shell.dart';
import 'merchant_web_session.dart';

/// App Banzami Business — the Web shell (ADR-066). One Flutter product, two
/// contexts: this is the `/business` context. It reuses the canonical
/// [BanzamiClient], models, QR renderer and design system; only the bootstrap,
/// the BFF-backed session and the responsive screens are Web-first. Payer actions
/// never live here — they are Consumer authority (`/`).
void runBusinessWeb(http.Client httpClient) {
  late final MerchantWebSession session;
  final client = BanzamiClient(
    // Same-origin BFF prefix; the BFF attaches the merchant JWT server-side and
    // renews it. The sentinel below is never a real credential.
    baseUrl: '/business/api',
    jwt: 'web-session',
    httpClient: httpClient,
    onUnauthorized: () => session.markLoggedOut(),
    refreshSession: () async => null, // the BFF owns refresh (ADR-066 §5)
  );
  session = MerchantWebSession(httpClient: httpClient, client: client);
  runApp(BusinessWebApp(session: session));
}

class BusinessWebApp extends StatelessWidget {
  final MerchantWebSession session;
  const BusinessWebApp({super.key, required this.session});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<MerchantWebSession>.value(value: session),
        Provider<BanzamiClient>.value(value: session.client),
      ],
      child: MaterialApp(
        title: 'App Banzami Business',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          scaffoldBackgroundColor: BanzamiColors.offWhite,
          colorScheme: ColorScheme.fromSeed(seedColor: BanzamiColors.primary),
        ),
        home: const _BusinessBoot(),
      ),
    );
  }
}

class _BusinessBoot extends StatefulWidget {
  const _BusinessBoot();
  @override
  State<_BusinessBoot> createState() => _BusinessBootState();
}

class _BusinessBootState extends State<_BusinessBoot> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<MerchantWebSession>().bootstrap();
    });
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<MerchantWebSession>();
    switch (session.state) {
      case BusinessWebState.booting:
        return const _BusinessSplash();
      case BusinessWebState.ready:
        return const BusinessWebShell();
      case BusinessWebState.loggedOut:
      case BusinessWebState.loggingIn:
        return const BusinessLoginScreen();
    }
  }
}

class _BusinessSplash extends StatelessWidget {
  const _BusinessSplash();
  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      body: Center(child: CircularProgressIndicator(color: BanzamiColors.primary)),
    );
  }
}
