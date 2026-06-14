import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart' hide Consumer;

import 'config.dart';
import 'services/merchant_session_service.dart';
import 'screens/splash_screen.dart';
import 'screens/pin_screen.dart';
import 'screens/main_screen.dart';
import 'screens/onboarding/welcome_screen.dart';

class BanzamiMerchantApp extends StatelessWidget {
  const BanzamiMerchantApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(
          create: (_) => MerchantSessionService()..initialize(),
        ),
        ProxyProvider<MerchantSessionService, BanzamiClient>(
          update: (_, session, prev) {
            final apiKey = session.session?.apiKey ?? '';
            if (prev != null && apiKey == prev.apiKey) return prev;
            return BanzamiClient(
              baseUrl: AppConfig.gatewayUrl,
              apiKey:  apiKey,
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
    final base = ThemeData(
      colorScheme: ColorScheme.fromSeed(
        seedColor:  BanzamiColors.wine,
        primary:    BanzamiColors.wine,
        brightness: Brightness.light,
      ),
      useMaterial3: true,
    );
    return base.copyWith(
      textTheme: GoogleFonts.interTextTheme(base.textTheme),
      appBarTheme: const AppBarTheme(
        surfaceTintColor: Colors.transparent,
        elevation:        0,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled:      true,
        fillColor:   BanzamiColors.gray100,
        border:      OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide:   BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide:   const BorderSide(color: BanzamiColors.wine, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide:   const BorderSide(color: BanzamiColors.error, width: 1.5),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide:   const BorderSide(color: BanzamiColors.error, width: 1.5),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      navigationBarTheme: NavigationBarThemeData(
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return BanzamiTextStyles.label.copyWith(
            color: selected ? BanzamiColors.wine : BanzamiColors.gray400,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
            color: selected ? BanzamiColors.wine : BanzamiColors.gray400,
            size:  24,
          );
        }),
      ),
    );
  }
}
