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

  // ── URI dedup guard ────────────────────────────────────────────────────────
  // iOS fires both getInitialLink() and uriLinkStream with the same launch URI
  // on cold start. Normalized form strips the ?sandbox param so that
  // banza://pay?request=X and banza://pay?request=X&sandbox=1 are treated
  // identically for dedup purposes.
  String?   _lastHandledNorm;
  DateTime? _lastHandledAt;

  // ── Route guard ────────────────────────────────────────────────────────────
  // Tracks the payment request code currently visible on screen so we never
  // push a second PaymentRequestScreen for the same code.
  String?   _currentPaymentCode;

  String _normalizeUri(Uri uri) {
    final params = Map<String, String>.from(uri.queryParameters)..remove('sandbox');
    return Uri(
      scheme: uri.scheme,
      host:   uri.host,
      port:   uri.hasPort ? uri.port : null,
      path:   uri.path,
      queryParameters: params.isEmpty ? null : params,
    ).toString();
  }

  bool _isDuplicateLink(Uri uri) {
    if (_lastHandledNorm == null || _lastHandledAt == null) return false;
    final age = DateTime.now().difference(_lastHandledAt!);
    return age < const Duration(seconds: 5) && _normalizeUri(uri) == _lastHandledNorm;
  }

  @override
  void initState() {
    super.initState();
    final appLinks = AppLinks();
    appLinks.getInitialLink().then((uri) {
      if (uri != null) _handleLink(uri, source: 'initial');
    });
    _linkSub = appLinks.uriLinkStream.listen(
      (uri) => _handleLink(uri, source: 'stream'),
    );
  }

  @override
  void dispose() {
    _linkSub?.cancel();
    super.dispose();
  }

  void _handleLink(Uri uri, {String source = 'unknown'}) {
    final norm = _normalizeUri(uri);
    debugPrint('[deep-link] received source=$source uri=$uri normalized=$norm');

    if (_isDuplicateLink(uri)) {
      final age = DateTime.now().difference(_lastHandledAt!).inMilliseconds;
      debugPrint('[deep-link] ignoredDuplicate=true last=$_lastHandledNorm age=${age}ms');
      return;
    }
    debugPrint('[deep-link] ignoredDuplicate=false → handling');
    _lastHandledNorm = norm;
    _lastHandledAt   = DateTime.now();

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
    // Route guard: never push two PaymentRequestScreens for the same code.
    if (_currentPaymentCode == code) {
      debugPrint('[deep-link] routeAlreadyOpen=true code=$code — skip push');
      return;
    }

    final ctx = _navigatorKey.currentContext;
    if (ctx == null) return;
    final session = ctx.read<SessionService>().session;
    if (session == null) return;
    final client = ctx.read<ConsumerPublicClient>();

    debugPrint('[deep-link] fetching pay link code=$code');
    client.getConsumerPayLinkByCode(code).then((link) {
      if (!link.isActive) {
        debugPrint('[deep-link] link not active — skip push');
        return;
      }
      final nav = _navigatorKey.currentState;
      if (nav == null) return;

      _currentPaymentCode = code;
      debugPrint('[deep-link] pushing PaymentRequestScreen code=$code');
      nav.push(MaterialPageRoute(
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
      )).then((_) {
        _currentPaymentCode = null;
        debugPrint('[deep-link] PaymentRequestScreen popped code=$code');
      });
    }).catchError((e) {
      debugPrint('[deep-link] error fetching pay link: $e');
    });
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
