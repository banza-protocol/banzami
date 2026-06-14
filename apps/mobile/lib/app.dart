import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' show Client;
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart' hide Consumer;

import 'config.dart';
import 'guards/secure_app_lifecycle_guard.dart';
import 'services/notification_router.dart';
import 'services/push_notification_service.dart';
import 'services/session_service.dart';
import 'screens/splash_screen.dart';
import 'screens/link_pay_screen.dart';
import 'screens/onboarding/welcome_screen.dart';

final _navigatorKey = GlobalKey<NavigatorState>();
final _guardKey     = GlobalKey<SecureAppLifecycleGuardState>();

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

  // ── Cold-start deferred link ───────────────────────────────────────────────
  // On cold start the deep link fires before SplashScreen has bootstrapped the
  // session. We park the code here and process it as soon as the session loads.
  String?   _pendingRequestCode;

  // ── Locked deep link ───────────────────────────────────────────────────────
  // When a Universal Link arrives while the session is locked, we park the URI
  // here and process it only after the user successfully unlocks.
  Uri?      _pendingDeepLinkUri;

  // ── Notification tap ───────────────────────────────────────────────────────
  // When a push notification is tapped while the session is locked, we park
  // the message here and process it after the user successfully unlocks.
  RemoteMessage? _pendingNotificationMsg;

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
    PushNotificationService.onTap = _handleNotificationTap;
  }

  @override
  void dispose() {
    PushNotificationService.onTap = null;
    _linkSub?.cancel();
    super.dispose();
  }

  // ── Notification tap handling ──────────────────────────────────────────────

  void _handleNotificationTap(RemoteMessage msg) {
    debugPrint('[FCM-ROUTE] tap received type=${msg.data["type"]} '
        'route=${msg.data["route"]} transfer_id=${msg.data["transfer_id"]}');

    final ctx        = _navigatorKey.currentContext;
    final guardState = _guardKey.currentState;
    final svc        = ctx?.read<SessionService>();

    debugPrint('[FCM-ROUTE] locked=${svc?.isLocked}');

    if (svc != null && svc.hasSession && svc.isLocked) {
      debugPrint('[FCM-ROUTE] pending=true — parking and triggering unlock');
      _pendingNotificationMsg = msg;
      guardState?.triggerUnlock(_onNotificationUnlocked);
      return;
    }

    _routeToNotification(msg);
  }

  void _onNotificationUnlocked() {
    final msg = _pendingNotificationMsg;
    _pendingNotificationMsg = null;
    if (msg != null) _routeToNotification(msg);
  }

  void _routeToNotification(RemoteMessage msg) {
    final ctx = _navigatorKey.currentContext;
    final nav = _navigatorKey.currentState;
    if (ctx == null || nav == null) return;

    final svc    = ctx.read<SessionService>();
    final client = ctx.read<ConsumerPublicClient>();
    final handle = svc.session?.handle ?? '';

    BanzamiNotificationRouter.route(
      data:         msg.data.map((k, v) => MapEntry(k, v.toString())),
      toastContext: ctx,
      navigator:    nav,
      client:       client,
      ownHandle:    handle,
    );
  }

  void _handleLink(Uri uri, {String source = 'unknown'}) {
    final norm = _normalizeUri(uri);
    debugPrint('[deep-link] received source=$source uri=$uri normalized=$norm');

    // Duplicate guard — but allow re-processing the same URI after unlock.
    if (_pendingDeepLinkUri == null && _isDuplicateLink(uri)) {
      final age = DateTime.now().difference(_lastHandledAt!).inMilliseconds;
      debugPrint('[deep-link] ignoredDuplicate=true last=$_lastHandledNorm age=${age}ms');
      return;
    }
    debugPrint('[deep-link] ignoredDuplicate=false → handling');
    _lastHandledNorm = norm;
    _lastHandledAt   = DateTime.now();

    // ── Lock gate ──────────────────────────────────────────────────────────
    final ctx        = _navigatorKey.currentContext;
    final guardState = _guardKey.currentState;
    final svc        = ctx?.read<SessionService>();
    debugPrint('[deep-link] lockGate: ctx=${ctx != null} guardState=${guardState != null} '
        'hasSession=${svc?.hasSession} isLocked=${svc?.isLocked} '
        'pendingDeepLink=$_pendingDeepLinkUri');

    if (svc != null && svc.hasSession && svc.isLocked) {
      debugPrint('[deep-link] appLocked=true → parking uri and triggering unlock');
      _pendingDeepLinkUri = uri;
      if (guardState != null) {
        guardState.triggerUnlock(_onDeepLinkUnlocked);
      } else {
        // Guard not mounted yet (very early cold start). The Consumer builder
        // will retry once the session finishes loading.
        debugPrint('[deep-link] guardState=null — will retry from Consumer builder');
      }
      return;
    }

    // ── Universal links: https://pay.banzami.org/* ──────────────────────────
    if (uri.scheme == 'https' && uri.host == 'pay.banzami.org') {
      _handleUniversalLink(uri);
      return;
    }

    // ── Custom scheme: banza://pay/... ─────────────────────────────────────
    if (uri.scheme != 'banza' || uri.host != 'pay') return;
    _handleBanzamiScheme(uri);
  }

  // Called by the guard after successful unlock when a deep link was pending.
  void _onDeepLinkUnlocked() {
    final uri = _pendingDeepLinkUri;
    _pendingDeepLinkUri = null;
    if (uri == null) return;
    debugPrint('[deep-link] unlocked → processing pending uri=$uri');

    if (uri.scheme == 'https' && uri.host == 'pay.banzami.org') {
      _handleUniversalLink(uri);
    } else if (uri.scheme == 'banza' && uri.host == 'pay') {
      _handleBanzamiScheme(uri);
    }
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

  void _handleBanzamiScheme(Uri uri) {
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
    final svc     = ctx.read<SessionService>();
    final session = svc.session;
    if (session == null) {
      // Cold start: session not ready yet — park and retry when session loads.
      debugPrint('[deep-link] sessionNull=true code=$code — deferred');
      _pendingRequestCode = code;
      return;
    }
    if (svc.isLocked) {
      // Security gate: should not reach here — _handleLink catches this first.
      debugPrint('[deep-link] SECURITY appLocked=true — rejecting payment open');
      return;
    }
    _pendingRequestCode = null; // clear any stale pending
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
              ? BanzamiEnvironment.sandbox
              : BanzamiEnvironment.production,
          httpClient: widget.pinnedClient,
        )),
      ],
      child: Consumer<SessionService>(
        builder: (context, session, _) {
          final client = context.read<ConsumerPublicClient>();
          if (session.session != null) {
            client.setToken(session.session!.token);
            // Cold-start deep link: session now ready — process any deferred code.
            final pending = _pendingRequestCode;
            if (pending != null) {
              if (session.isLocked && _pendingDeepLinkUri == null) {
                // Session loaded but locked — park URI and show PIN before
                // processing the payment link.
                _pendingDeepLinkUri = Uri.parse('banza://pay?request=$pending');
                _pendingRequestCode = null;
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  debugPrint('[deep-link] coldStart+locked → triggering unlock code=$pending');
                  _guardKey.currentState?.triggerUnlock(_onDeepLinkUnlocked);
                });
              } else if (!session.isLocked) {
                _pendingRequestCode = null;
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  debugPrint('[deep-link] processingDeferred=true code=$pending');
                  _openPaymentRequest(pending);
                });
              }
            }
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
            title:                      'Banzami',
            debugShowCheckedModeBanner: false,
            theme:                      _buildTheme(),
            navigatorKey:               _navigatorKey,
            home:                       const SplashScreen(),
            builder: (_, child) => SecureAppLifecycleGuard(
              key:          _guardKey,
              navigatorKey: _navigatorKey,
              child:        child!,
            ),
          );
        },
      ),
    );
  }

  ThemeData _buildTheme() {
    final base = BanzamiTheme.light;
    return base.copyWith(textTheme: base.textTheme.apply(fontFamily: 'Inter'));
  }
}
