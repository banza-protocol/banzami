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
        // Session is NOT auto-initialized here — the splash (_MerchantBoot) owns
        // bootstrap, exactly like the consumer app's SplashScreen.
        ChangeNotifierProvider(create: (_) => MerchantSessionService()),
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
              // Banzami refused the session. It used to LOCK the app, and the
              // PIN screen then checked the PIN on the device and unlocked the
              // same dead token — a verified-looking profile over a home screen
              // that could never load. Now the session is marked expired (once,
              // however many requests fail together) and the PIN re-authenticates
              // against Banzami before anything is shown again.
              onUnauthorized: session.markExpired,
            );
          },
        ),
      ],
      child: MaterialApp(
        title:                      'Banzami Business',
        debugShowCheckedModeBanner: false,
        theme:                      _buildTheme(),
        home:                       const _MerchantBoot(),
      ),
    );
  }

  ThemeData _buildTheme() {
    final base = BanzamiTheme.light;
    return base.copyWith(
      textTheme: base.textTheme.apply(fontFamily: 'Inter'),
    );
  }
}

/// Boot step — mirrors the consumer app's SplashScreen logic exactly:
/// show the animated welcome (SplashScreen) for at least the animation duration
/// (1200 ms) WHILE the session initializes, then hand off to the reactive router
/// (login / lock / main). Owning the splash here — via local widget state set
/// from a post-frame callback — guarantees the animated welcome always renders
/// fully on cold start, independent of how fast the session loads.
class _MerchantBoot extends StatefulWidget {
  const _MerchantBoot();

  @override
  State<_MerchantBoot> createState() => _MerchantBootState();
}

class _MerchantBootState extends State<_MerchantBoot> {
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    // After the first frame (so the splash is on screen and animating).
    WidgetsBinding.instance.addPostFrameCallback((_) => _boot());
  }

  Future<void> _boot() async {
    final session = context.read<MerchantSessionService>();
    // Wait for the longer of: minimum splash duration OR session load.
    await Future.wait([
      Future<void>.delayed(const Duration(milliseconds: 1200)),
      session.initialize(),
    ]);
    if (mounted) setState(() => _ready = true);
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const SplashScreen();

    // Bootstrap done → reactive routing. The Consumer swaps screens on
    // login / logout / lock / unlock (unchanged behaviour).
    return Consumer<MerchantSessionService>(
      builder: (context, session, _) {
        if (!session.hasSession) return const MerchantWelcomeScreen();
        if (session.isLocked)    return const MerchantPinScreen();
        return const MerchantMainScreen();
      },
    );
  }
}
