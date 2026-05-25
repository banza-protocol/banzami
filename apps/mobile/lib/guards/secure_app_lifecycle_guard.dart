import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../branding_assets.dart';
import '../services/session_service.dart';
import '../screens/pin_screen.dart';

/// Wraps the entire navigator (via MaterialApp.builder) to provide
/// banking-grade foreground protection:
///
/// 1. **Privacy overlay** — shown instantly on AppLifecycleState.inactive so
///    the app-switcher screenshot never captures financial data.
///
/// 2. **PIN / biometric lock** — whenever the app returns from a genuine
///    background (AppLifecycleState.paused), the user must re-authenticate
///    before any content is revealed.
///
/// 3. **Deep-link unlock** — when a Universal Link arrives while the app is
///    locked, [triggerUnlock] ensures the PIN screen is shown immediately and
///    the pending link is processed only after successful authentication.
///
/// Build marker: APPLOCK-DL-FIX-v2
class SecureAppLifecycleGuard extends StatefulWidget {
  final Widget                    child;
  final GlobalKey<NavigatorState> navigatorKey;

  const SecureAppLifecycleGuard({
    super.key,
    required this.child,
    required this.navigatorKey,
  });

  @override
  State<SecureAppLifecycleGuard> createState() =>
      SecureAppLifecycleGuardState();
}

class SecureAppLifecycleGuardState extends State<SecureAppLifecycleGuard>
    with WidgetsBindingObserver {

  bool _privacyVisible  = false;
  bool _didReachPaused  = false;

  // Guards against pushing PinScreen twice across lifecycle + deep-link paths.
  bool _lockRoutePushed = false;

  // Callbacks registered externally (deep-link) that fire after unlock.
  final List<VoidCallback> _pendingUnlockCallbacks = [];

  // ── Observer registration ──────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    debugPrint('[APP-LOCK] lifecycle state=$state didReachPaused=$_didReachPaused lockRoutePushed=$_lockRoutePushed');
    switch (state) {
      case AppLifecycleState.inactive:
      case AppLifecycleState.hidden:
        _showPrivacy();

      case AppLifecycleState.paused:
        _didReachPaused = true;
        _showPrivacy();
        _lockSession();

      case AppLifecycleState.resumed:
        _onResumed();

      case AppLifecycleState.detached:
        break;
    }
  }

  void _showPrivacy() {
    if (!_privacyVisible) setState(() => _privacyVisible = true);
  }

  void _lockSession() {
    final ctx = widget.navigatorKey.currentContext;
    if (ctx != null && ctx.mounted) {
      ctx.read<SessionService>().lock();
    }
  }

  void _onResumed() {
    if (!_didReachPaused) {
      debugPrint('[APP-LOCK] _onResumed: briefInterruption → clear overlay only');
      if (mounted) setState(() => _privacyVisible = false);
      return;
    }
    _didReachPaused = false;

    final ctx = widget.navigatorKey.currentContext;
    final svc = ctx?.read<SessionService>();

    if (svc == null || !svc.hasSession) {
      debugPrint('[APP-LOCK] _onResumed: no session → clear overlay');
      if (mounted) setState(() => _privacyVisible = false);
      return;
    }

    debugPrint('[APP-LOCK] _onResumed: hasSession=true lockRoutePushed=$_lockRoutePushed');

    if (_lockRoutePushed) {
      // triggerUnlock() already pushed PIN (or is about to via postFrameCallback).
      // We still need to ensure the overlay is removed once the PIN frame renders.
      debugPrint('[APP-LOCK] _onResumed: PIN already pushed — scheduling overlay removal');
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _privacyVisible = false);
      });
      return;
    }

    _lockRoutePushed = true;
    debugPrint('[APP-LOCK] _onResumed: pushing PinScreen via lifecycle path');

    widget.navigatorKey.currentState?.push(
      PageRouteBuilder<void>(
        opaque:                    true,
        barrierDismissible:        false,
        transitionDuration:        Duration.zero,
        reverseTransitionDuration: Duration.zero,
        pageBuilder:               (_, __, ___) => PinScreen(
          isAppLock:  true,
          onUnlocked: _onUnlocked,
        ),
      ),
    ).then((_) {
      debugPrint('[APP-LOCK] _onResumed: PinScreen popped (logout or other)');
      if (mounted) {
        setState(() {
          _lockRoutePushed = false;
          _privacyVisible  = false;
        });
        _pendingUnlockCallbacks.clear();
      }
    });

    // Remove the privacy overlay after one frame — PIN Scaffold has rendered
    // and covers app content, so no flash of financial data.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) setState(() => _privacyVisible = false);
    });
  }

  // ── External API ───────────────────────────────────────────────────────────

  /// Called by deep-link handling when a Universal Link arrives while locked.
  /// Ensures PIN screen is visible and queues [onSuccess] for post-unlock.
  /// Safe to call multiple times — only one PinScreen is ever on the stack.
  void triggerUnlock(VoidCallback onSuccess) {
    debugPrint('[APP-LOCK] triggerUnlock: entered lockRoutePushed=$_lockRoutePushed overlayVisible=$_privacyVisible');
    _pendingUnlockCallbacks.add(onSuccess);
    debugPrint('[APP-LOCK] triggerUnlock: callbackQueued count=${_pendingUnlockCallbacks.length}');

    if (_lockRoutePushed) {
      // PIN already on screen (or scheduled). Callback queued — done.
      debugPrint('[APP-LOCK] triggerUnlock: PIN already active — callback queued only');
      return;
    }
    _lockRoutePushed = true;

    // Show the privacy overlay so financial content is never uncovered
    // while the PIN screen is being pushed.
    if (!_privacyVisible) setState(() => _privacyVisible = true);

    // Use postFrameCallback to guarantee the navigator is fully mounted
    // before attempting to push a route (critical for cold starts and
    // Universal Links that arrive before the first frame).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;

      final nav = widget.navigatorKey.currentState;
      debugPrint('[APP-LOCK] triggerUnlock: navigatorAvailable=${nav != null} context=${widget.navigatorKey.currentContext != null}');

      if (nav == null) {
        // Navigator not yet ready (very early cold start). Reset the flag so
        // the Consumer builder can retry on the next notifyListeners cycle.
        debugPrint('[APP-LOCK] triggerUnlock: navigator null — resetting lockRoutePushed for retry');
        _lockRoutePushed = false;
        return;
      }

      debugPrint('[APP-LOCK] triggerUnlock: pushing PinScreen');
      nav.push(
        PageRouteBuilder<void>(
          opaque:                    true,
          barrierDismissible:        false,
          transitionDuration:        Duration.zero,
          reverseTransitionDuration: Duration.zero,
          pageBuilder:               (_, __, ___) => PinScreen(
            isAppLock:  true,
            onUnlocked: _onUnlocked,
          ),
        ),
      ).then((_) {
        debugPrint('[APP-LOCK] triggerUnlock: PinScreen popped');
        if (mounted) {
          setState(() {
            _lockRoutePushed = false;
            _privacyVisible  = false;
          });
          _pendingUnlockCallbacks.clear();
        }
      });

      // *** CRITICAL FIX ***
      // Remove the privacy overlay after one frame so the PIN screen becomes
      // visible. Without this, the overlay stays on top of the navigator and
      // the user never sees the PIN — stuck on "Banza protegido".
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _privacyVisible = false);
      });
    });
  }

  // Called by PinScreen when isAppLock=true and unlock succeeds.
  void _onUnlocked() {
    debugPrint('[APP-LOCK] _onUnlocked: callbacks=${_pendingUnlockCallbacks.length}');
    for (final cb in _pendingUnlockCallbacks) {
      cb();
    }
    _pendingUnlockCallbacks.clear();

    if (mounted) {
      setState(() {
        _privacyVisible  = false;
        _lockRoutePushed = false;
      });
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Consumer<SessionService>(
      builder: (context, svc, _) {
        final effectiveOverlay = _privacyVisible && svc.hasSession;
        return Stack(
          children: [
            widget.child,
            if (effectiveOverlay) const _PrivacyOverlay(),
          ],
        );
      },
    );
  }
}

// =============================================================================
// Privacy overlay  —  build marker: APPLOCK-DL-FIX-v2
// =============================================================================

class _PrivacyOverlay extends StatelessWidget {
  const _PrivacyOverlay();

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: Material(
        color: const Color(0xFF3D0008),
        child: SafeArea(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SizedBox(
                width:  72,
                height: 72,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: Image.asset(BrandingAssets.icon),
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                'Banza protegido',
                style: TextStyle(
                  color:      Colors.white,
                  fontSize:   17,
                  fontWeight: FontWeight.w600,
                  fontFamily: 'Inter',
                  decoration: TextDecoration.none,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Desbloqueie para continuar',
                style: TextStyle(
                  color:      Colors.white.withValues(alpha: 0.55),
                  fontSize:   14,
                  fontFamily: 'Inter',
                  decoration: TextDecoration.none,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
