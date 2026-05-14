import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:banzami_sdk/banzami_sdk.dart' hide Consumer;

import 'config.dart';
import 'services/session_service.dart';
import 'screens/splash_screen.dart';
import 'screens/pin_screen.dart';
import 'screens/main_screen.dart';
import 'screens/onboarding/welcome_screen.dart';

class BanzamiApp extends StatelessWidget {
  const BanzamiApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => SessionService()..initialize()),
        // ConsumerPublicClient is provided here; the token is injected from
        // the session after the first build (see _home below).
        Provider(create: (_) => ConsumerPublicClient(
          baseUrl: AppConfig.publicApiUrl,
        )),
      ],
      child: Consumer<SessionService>(
        builder: (context, session, _) {
          // Keep the client's token in sync with the stored session token.
          if (session.session != null) {
            context.read<ConsumerPublicClient>().setToken(session.session!.token);
          }
          return MaterialApp(
            title:                      'Banzami',
            debugShowCheckedModeBanner: false,
            theme:                      _buildTheme(),
            home:                       _home(session),
          );
        },
      ),
    );
  }

  Widget _home(SessionService session) {
    if (!session.initialized) return const SplashScreen();
    if (!session.hasSession)  return const WelcomeScreen();
    if (session.isLocked)     return const PinScreen();
    return const MainScreen();
  }

  ThemeData _buildTheme() {
    final base = BanzamiTheme.light;
    return base.copyWith(
      textTheme: GoogleFonts.interTextTheme(base.textTheme),
    );
  }
}
