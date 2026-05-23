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

  // Dedup guard: iOS sends the launch URI via both getInitialLink() and
  // uriLinkStream. Ignore the same URI if handled within the last 3 seconds.
  String?   _lastHandledUri;
  DateTime? _lastHandledAt;

  bool _isDuplicateLink(Uri uri) {
    if (_lastHandledUri == null || _lastHandledAt == null) return false;
    final age = DateTime.now().difference(_lastHandledAt!);
    return age < const Duration(seconds: 3) && uri.toString() == _lastHandledUri;
  }

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
    if (_isDuplicateLink(uri)) return;
    _lastHandledUri = uri.toString();
    _lastHandledAt  = DateTime.now();

    // ── Universal links: https://pay.banzami.org/* ──────────────────────────
    if (uri.scheme == 'https' && uri.host == 'pay.banzami.org') {
      _handleUniversalLink(uri);
      return;
    }

    // ── Custom scheme: banza://pay/... ─────────────────────────────────────
    if (uri.scheme != 'banza' || uri.host != 'pay') return;
    _handleBanzaScheme(uri);
  }

  // https://pay.banzami.org/r/{code}[?sandbox=1]
  // https://pay.banzami.org/u/{handle}[?amount=&currency=]
  void _handleUniversalLink(Uri uri) {
    final segs = uri.pathSegments;
    if (segs.isEmpty) return;

    switch (segs[0]) {
      case 'r':
        // Payment-request link — maps 1:1 to banza://pay?request={code}
        if (segs.length >= 2) _openPaymentRequest(segs[1]);

      case 'u':
        // Handle-based pay link — maps to banza://pay/u/{handle}
        if (segs.length >= 2) _openHandlePay(uri, segs[1]);
    }
  }

  void _handleBanzaScheme(Uri uri) {
    final segs = uri.pathSegments;

    // banza://pay/link/{slug}
    if (segs.isNotEmpty && segs[0] == 'link' && segs.length >= 2) {
      _navigatorKey.currentState?.push(MaterialPageRoute(
        builder: (_) => LinkPayScreen(slug: segs[1]),
      ));
      return;
    }

    // banza://pay/u/{handle}?amount={minor}&currency={currency}
    if (segs.isNotEmpty && segs[0] == 'u' && segs.length >= 2) {
      _openHandlePay(uri, segs[1]);
      return;
    }

    // banza://pay?request={code}
    if (segs.isEmpty) {
      final code = uri.queryParameters['request'];
      if (code != null && code.isNotEmpty) _openPaymentRequest(code);
    }
  }

  void _openPaymentRequest(String code) {
    final ctx = _navigatorKey.currentContext;
    if (ctx == null) return;
    final session = ctx.read<SessionService>().session;
    if (session == null) return;
    final client = ctx.read<ConsumerPublicClient>();
    client.getConsumerPayLinkByCode(code).then((link) {
      if (!link.isActive) return;
      _navigatorKey.currentState?.push(MaterialPageRoute(
        builder: (_) => BanzamiPaymentRequestScreen(
          client:               client,
          recipientHandle:      link.receiverHandle,
          recipientDisplayName: link.receiverDisplayName,
          amountMinor:          link.amountMinor,
          note:                 link.note,
          currency:             link.currency,
          locked:               link.locked,
          ownHandle:            session.handle,
          linkCode:             link.linkCode,
          onSuccess:            (_) {},
          isSandbox:            AppConfig.isSandbox,
        ),
      ));
    }).catchError((_) {});
  }

  void _openHandlePay(Uri uri, String handle) {
    final ctx = _navigatorKey.currentContext;
    if (ctx == null) return;
    final session = ctx.read<SessionService>().session;
    if (session == null) return;
    final client  = ctx.read<ConsumerPublicClient>();
    final rawAmt  = uri.queryParameters['amount'];
    final amount  = rawAmt != null ? int.tryParse(rawAmt) : null;

    if (amount != null && amount > 0) {
      _navigatorKey.currentState?.push(MaterialPageRoute(
        builder: (_) => BanzamiPaymentRequestScreen(
          client:          client,
          recipientHandle: handle,
          amountMinor:     amount,
          locked:          true,
          ownHandle:       session.handle,
          onSuccess:       (_) {},
          isSandbox:       AppConfig.isSandbox,
        ),
      ));
    } else {
      _navigatorKey.currentState?.push(MaterialPageRoute(
        builder: (_) => BanzamiSendScreen(
          client:        client,
          ownHandle:     session.handle,
          onSuccess:     (_) {},
          isSandbox:     AppConfig.isSandbox,
          initialHandle: handle,
        ),
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
