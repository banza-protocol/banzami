import 'package:flutter/material.dart';
import 'package:http/http.dart' show Client;
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart' hide Consumer;

import 'config.dart';
import 'services/merchant_reauth.dart';
import 'services/merchant_session_service.dart';
import 'screens/splash_screen.dart';
import 'screens/pin_screen.dart';
import 'screens/main_screen.dart';
import 'screens/onboarding/welcome_screen.dart';
import 'widgets/merchant_privacy_shield.dart';

/// The session a cached BanzamiClient was built for (MerchantSession.clientKey).
final _clientKeys = Expando<String>('business client session');

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
            final key = session.session?.clientKey ?? '';
            // Rebuild only when the Business or the way it signed in changes —
            // not on every session notify (a biometric toggle) and NOT on an
            // access-token renewal: the client renewed it itself, and a new
            // client mid-burst would lose the one shared renewal.
            if (prev != null && _clientKeys[prev] == key) return prev;
            // The client renews an expired access token with the refresh token
            // (no PIN), and when Banzami refuses the session for good it ends
            // it — once, however many requests fail together: tokens and
            // identity are cleared and sign-in is shown. An outage ends nothing.
            final client = buildBusinessClient(
              session:    session,
              baseUrl:    AppConfig.gatewayUrl,
              httpClient: pinnedClient,
            );
            _clientKeys[client] = key;
            return client;
          },
        ),
      ],
      child: MaterialApp(
        title:                      'Banzami Business',
        debugShowCheckedModeBanner: false,
        theme:                      _buildTheme(),
        home:                       const _MerchantBoot(),
        // The app-switcher snapshot never shows the Business's data.
        builder: (_, child) => MerchantPrivacyShield(child: child!),
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

  MerchantSessionService? _session;
  MerchantRoute?          _route;

  Future<void> _boot() async {
    final session = context.read<MerchantSessionService>();
    // Wait for the longer of: minimum splash duration OR session load.
    await Future.wait([
      Future<void>.delayed(const Duration(milliseconds: 1200)),
      session.initialize(),
    ]);
    if (!mounted) return;
    _session = session..addListener(_onSessionChanged);
    _route   = session.route;
    setState(() => _ready = true);
  }

  /// Leaving the signed-in state — the session ended, was signed out, or the
  /// device locked — also closes every screen pushed over the home (payout,
  /// KYB, charge…). Those routes sit above this widget in the navigator, so
  /// swapping the home to the PIN / sign-in screen alone would leave them on
  /// top, still showing the Business and still calling Banzami.
  void _onSessionChanged() {
    final next = _session!.route;
    final left = _route == MerchantRoute.signedIn && next != MerchantRoute.signedIn;
    _route = next;
    if (left && mounted) Navigator.of(context).popUntil((r) => r.isFirst);
  }

  @override
  void dispose() {
    _session?.removeListener(_onSessionChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const SplashScreen();

    // Bootstrap done → reactive routing. The Consumer swaps screens on
    // login / logout / lock / unlock (unchanged behaviour).
    return Consumer<MerchantSessionService>(
      builder: (context, session, _) {
        switch (session.route) {
          case MerchantRoute.welcome:
            return const MerchantWelcomeScreen();
          // One screen for both: the device lock over a live session, and
          // sign-in (remembered @handle + PIN) once the session has ended. The
          // same element survives the switch, so a PIN typed to unlock a
          // session that turns out to have ended goes on to sign in.
          case MerchantRoute.signIn:
          case MerchantRoute.locked:
            return const MerchantPinScreen();
          case MerchantRoute.signedIn:
            return const MerchantMainScreen();
        }
      },
    );
  }
}
