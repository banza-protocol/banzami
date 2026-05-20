import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:http/http.dart' show Client;
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart' hide Consumer;

import 'config.dart';
import 'services/session_service.dart';
import 'screens/splash_screen.dart';
import 'screens/pin_screen.dart';
import 'screens/main_screen.dart';
import 'screens/link_pay_screen.dart';
import 'screens/onboarding/welcome_screen.dart';

final _navigatorKey = GlobalKey<NavigatorState>();

class BanzamiApp extends StatefulWidget {
  final Client pinnedClient;

  const BanzamiApp({super.key, required this.pinnedClient});

  @override
  State<BanzamiApp> createState() => _BanzamiAppState();
}

class _BanzamiAppState extends State<BanzamiApp> {
  StreamSubscription<Uri>? _linkSub;

  @override
  void initState() {
    super.initState();
    final appLinks = AppLinks();
    // Cold start: app launched by tapping the deep link
    appLinks.getInitialLink().then((uri) { if (uri != null) _handleLink(uri); });
    // Warm start: app already running when link is opened
    _linkSub = appLinks.uriLinkStream.listen(_handleLink);
  }

  @override
  void dispose() {
    _linkSub?.cancel();
    super.dispose();
  }

  void _handleLink(Uri uri) {
    // banzami://pay/link/{slug}
    if (uri.host == 'pay' &&
        uri.pathSegments.length >= 2 &&
        uri.pathSegments[0] == 'link') {
      final slug = uri.pathSegments[1];
      _navigatorKey.currentState?.push(MaterialPageRoute(
        builder: (_) => LinkPayScreen(slug: slug),
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => SessionService()..initialize()),
        Provider(create: (_) => ConsumerPublicClient(
          baseUrl:    AppConfig.publicApiUrl,
          httpClient: widget.pinnedClient,
        )),
      ],
      child: Consumer<SessionService>(
        builder: (context, session, _) {
          final client = context.read<ConsumerPublicClient>();
          if (session.session != null) {
            client.setToken(session.session!.token);
          }
          // Auto-logout on 401: clears session and returns to WelcomeScreen.
          client.onUnauthorized = () => context.read<SessionService>().logout();
          return MaterialApp(
            title:                      'Banza',
            debugShowCheckedModeBanner: false,
            theme:                      _buildTheme(),
            navigatorKey:               _navigatorKey,
            home:                       _home(session),
          );
        },
      ),
    );
  }

  Widget _home(SessionService session) {
    if (!session.initialized) return const SplashScreen();
    FlutterNativeSplash.remove();
    if (!session.hasSession)  return const WelcomeScreen();
    if (session.isLocked)     return const PinScreen();
    return const MainScreen();
  }

  ThemeData _buildTheme() {
    final base = BanzaTheme.light;
    return base.copyWith(textTheme: base.textTheme.apply(fontFamily: 'Inter'));
  }
}
