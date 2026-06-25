import 'package:flutter/material.dart';
import 'package:http/http.dart' show Client;
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart' hide Consumer;

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
        ProxyProvider<MerchantSessionService, BanzamiClient>(
          update: (_, session, prev) {
            final s = session.session;
            final auth = s?.authIdentity ?? '';
            // Rebuild only when the auth credential changes — not on every
            // session notify (e.g. a biometric toggle). Works for both an API
            // key (exchanged for a JWT) and a pre-issued handle-login JWT.
            if (prev != null && auth == prev.authIdentity) return prev;
            return BanzamiClient(
              baseUrl:      AppConfig.gatewayUrl,
              apiKey:       s?.apiKey ?? '',
              jwt:          s?.jwt,
              jwtExpiresAt: s?.jwtExpiresAt,
              httpClient:   pinnedClient,
            );
          },
        ),
      ],
      child: Consumer<MerchantSessionService>(
        builder: (context, session, _) {
          return MaterialApp(
            title:                      'Banzami Business',
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
    final base = BanzamiTheme.light;
    return base.copyWith(
      textTheme: base.textTheme.apply(fontFamily: 'Inter'),
    );
  }
}
