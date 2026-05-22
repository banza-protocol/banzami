import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' show Client;
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart' hide Consumer;

import 'config.dart';
import 'services/session_service.dart';
import 'screens/splash_screen.dart';
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
    appLinks.getInitialLink().then((uri) { if (uri != null) _handleLink(uri); });
    _linkSub = appLinks.uriLinkStream.listen(_handleLink);
  }

  @override
  void dispose() {
    _linkSub?.cancel();
    super.dispose();
  }

  void _handleLink(Uri uri) {
    // banza://pay/link/{slug}
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
        // Session is NOT auto-initialized here — SplashScreen owns bootstrap.
        ChangeNotifierProvider(create: (_) => SessionService()),
        Provider(create: (_) => ConsumerPublicClient(
          baseUrl:     AppConfig.publicApiUrl,
          environment: AppConfig.isSandbox
              ? BanzaEnvironment.sandbox
              : BanzaEnvironment.production,
          httpClient: widget.pinnedClient,
        )),
      ],
      child: Consumer<SessionService>(
        builder: (context, session, _) {
          final client = context.read<ConsumerPublicClient>();
          if (session.session != null) {
            client.setToken(session.session!.token);
          }
          // Auto-logout on 401: clear session and return to WelcomeScreen.
          client.onUnauthorized = () {
            context.read<SessionService>().logout();
            _navigatorKey.currentState?.pushAndRemoveUntil(
              MaterialPageRoute(builder: (_) => const WelcomeScreen()),
              (_) => false,
            );
          };
          return MaterialApp(
            title:                      'Banza',
            debugShowCheckedModeBanner: false,
            theme:                      _buildTheme(),
            navigatorKey:               _navigatorKey,
            home:                       const SplashScreen(),
          );
        },
      ),
    );
  }

  ThemeData _buildTheme() {
    final base = BanzaTheme.light;
    return base.copyWith(textTheme: base.textTheme.apply(fontFamily: 'Inter'));
  }
}
