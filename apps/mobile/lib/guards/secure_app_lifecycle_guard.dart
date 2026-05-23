import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../branding_assets.dart';
import '../services/session_service.dart';
import '../screens/pin_screen.dart';

/// Wraps the entire navigator (via MaterialApp.builder) to provide
/// banking-grade foreground protection:
///
/// 1. **Privacy overlay** — shown instantly on AppLifecycleState.inactive so
///    the app-switcher screenshot never captures financial data.  Shows the
///    Banza logo + "Banza protegido" on a wine background.
///
/// 2. **PIN / biometric lock** — whenever the app returns from a genuine
///    background (AppLifecycleState.paused), the user must re-authenticate
///    before any content is revealed.
///
/// Brief foreground interruptions (notification centre, control centre) that
/// never reach AppLifecycleState.paused dismiss the privacy overlay silently —
/// no PIN is required.
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
      _SecureAppLifecycleGuardState();
}

class _SecureAppLifecycleGuardState extends State<SecureAppLifecycleGuard>
    with WidgetsBindingObserver {

  // Whether the privacy overlay (dark wine screen) is currently shown.
  bool _privacyVisible = false;

  // True once AppLifecycleState.paused is reached; reset on resume.
  // Prevents PIN from being required on brief foreground interruptions.
  bool _didReachPaused = false;

  // Guards against pushing the lock route twice if resumed fires more
  // than once before the route is fully on the stack.
  bool _lockRoutePushed = false;

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
    switch (state) {
      case AppLifecycleState.inactive:
      case AppLifecycleState.hidden:
        // App lost focus (control centre, notification shade, incoming call…).
        // Show the privacy overlay immediately so the app-switcher screenshot
        // captures the branded overlay rather than financial content.
        _showPrivacy();

      case AppLifecycleState.paused:
        // App fully backgrounded.  Record the fact and lock the session so
        // that any pending biometric prompt is also invalidated.
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
      // Brief interruption — no background reached.  Just dismiss the overlay.
      if (mounted) setState(() => _privacyVisible = false);
      return;
    }
    _didReachPaused = false;

    final ctx = widget.navigatorKey.currentContext;
    final svc = ctx?.read<SessionService>();

    if (svc == null || !svc.hasSession) {
      // No authenticated session — just clear the overlay.
      if (mounted) setState(() => _privacyVisible = false);
      return;
    }

    // App was genuinely backgrounded with an active session.
    // Always require PIN / biometric on return.
    if (_lockRoutePushed) return;
    _lockRoutePushed = true;

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
      // Route was popped by means other than onUnlocked (e.g. logout clears
      // the whole stack via pushAndRemoveUntil).  Reset guard state so the
      // next background → resume cycle works correctly.
      if (mounted) {
        setState(() {
          _lockRoutePushed = false;
          _privacyVisible  = false;
        });
      }
    });

    // Remove the privacy overlay after one frame — by then the PIN screen's
    // Scaffold has rendered and covers the app content, so there is no flash.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) setState(() => _privacyVisible = false);
    });
  }

  // Called by PinScreen when isAppLock = true and unlock succeeds.
  void _onUnlocked() {
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
    // Rebuild when session is cleared so the overlay auto-hides after logout
    // (svc.hasSession becomes false → effectiveOverlay = false).
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
// Privacy overlay
// =============================================================================

class _PrivacyOverlay extends StatelessWidget {
  const _PrivacyOverlay();

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: Material(
        color: const Color(0xFF3D0008), // Banza wine
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
