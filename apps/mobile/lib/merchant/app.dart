import 'package:flutter/material.dart';
import 'package:http/http.dart' show Client;
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart' hide Consumer;

import 'config.dart';
import 'services/merchant_session_service.dart';
import 'screens/splash_screen.dart';
import 'screens/pin_screen.dart';
import 'screens/main_screen.dart';
import 'screens/onboarding/welcome_screen.dart';

class BanzamiMerchantApp extends StatelessWidget {
  final Client pinnedClient;

  const BanzamiMerchantApp({super.key, required this.pinnedClient});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(
          create: (_) => MerchantSessionService()..initialize(),
        ),
        ProxyProvider<MerchantSessionService, BanzaClient>(
          update: (_, session, prev) {
            final apiKey = session.session?.apiKey ?? '';
            if (prev != null && apiKey == prev.apiKey) return prev;
            return BanzaClient(
              baseUrl:    AppConfig.gatewayUrl,
              apiKey:     apiKey,
              httpClient: pinnedClient,
            );
          },
        ),
      ],
      child: Consumer<MerchantSessionService>(
        builder: (context, session, _) {
          return MaterialApp(
            title:                      'Banza Business',
            debugShowCheckedModeBanner: false,
            theme:                      _buildTheme(),
            home:                       _home(session),
          );
        },
      ),
    );
  }

  Widget _home(MerchantSessionService session) {
    if (!session.initialized) return const SplashScreen();
    if (!session.hasSession)  return const MerchantWelcomeScreen();
    if (session.isLocked)     return const MerchantPinScreen();
    return const MerchantMainScreen();
  }

  ThemeData _buildTheme() {
    final base = BanzaTheme.light;
    return base.copyWith(
      textTheme: base.textTheme.apply(fontFamily: 'Inter'),
    );
  }
}
