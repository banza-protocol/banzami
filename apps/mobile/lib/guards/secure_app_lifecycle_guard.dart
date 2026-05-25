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
/// 2. **PIN / biometric lock with grace period** — after a genuine background
///    (AppLifecycleState.paused), the user must re-authenticate only if they
///    were away for more than [_kGraceSeconds] seconds (default: 30 s).
///    Brief app switches (e.g., glancing at notifications) do not trigger PIN.
///
/// 3. **Deep-link unlock** — when a Universal Link arrives while the app is
///    locked, [triggerUnlock] ensures the PIN screen is shown immediately and
///    the pending link is processed only after successful authentication.
///
/// 4. **Duplicate-push prevention** — before pushing the PIN screen the guard
///    checks [PinScreen.activeOnScreen] (global counter set by PinScreen
///    itself) and its own [_lockRoutePushed] flag.  A cold-start PinScreen
///    pushed by splash is therefore visible to the guard, and a second PIN
///    screen is never stacked on top of it.
///
/// Build marker: APPLOCK-GRACE-v3
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

  // After this many seconds in background, PIN is required on resume.
  static const int _kGraceSeconds = 30;

  bool      _privacyVisible  = false;
  bool      _didReachPaused  = false;
  DateTime? _pausedAt;

  // Guards against pushing PinScreen twice across lifecycle + deep-link paths.
  // Set true by THIS guard when it initiates a push; cleared when PIN pops.
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
    debugPrint('[APP-LOCK] lifecycle state=$state didReachPaused=$_didReachPaused lockRoutePushed=$_lockRoutePushed unlockRouteVisible=${PinScreen.activeOnScreen}');
    switch (state) {
      case AppLifecycleState.inactive:
      case AppLifecycleState.hidden:
        // Show privacy overlay immediately so the app-switcher screenshot
        // never captures financial data — even during the grace period.
        _showPrivacy();

      case AppLifecycleState.paused:
        _didReachPaused = true;
        _pausedAt       = DateTime.now();
        debugPrint('[APP-LOCK] pausedAt=${_pausedAt?.toIso8601String()}');
        _showPrivacy();
        // Do NOT lock the session here — the grace-period check in _onResumed
        // decides whether to lock.  If the process is killed while backgrounded
        // SessionService initialises with _locked=true on the next cold start.

      case AppLifecycleState.resumed:
        _onResumed();

      case AppLifecycleState.detached:
        break;
    }
  }

  void _showPrivacy() {
    if (!_privacyVisible) setState(() => _privacyVisible = true);
  }

  void _onResumed() {
    if (!_didReachPaused) {
      // Only inactive/hidden, no real background — clear overlay, no PIN needed.
      debugPrint('[APP-LOCK] _onResumed: briefInterruption (no pause) → clear overlay only');
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

    // ── Grace period check ─────────────────────────────────────────────────
    final now     = DateTime.now();
    final elapsed = _pausedAt != null
        ? now.difference(_pausedAt!).inSeconds
        : _kGraceSeconds + 1; // No timestamp recorded → force lock
    _pausedAt = null;

    debugPrint('[APP-LOCK] resumedAfterSeconds=$elapsed graceSeconds=$_kGraceSeconds');

    // Require unlock if: already locked (e.g. cold-start) OR grace expired.
    final requireUnlock = svc.isLocked || elapsed >= _kGraceSeconds;
    debugPrint('[APP-LOCK] requireUnlock=$requireUnlock routeSensitive=false');

    if (!requireUnlock) {
      // Within grace period and session is unlocked — just remove overlay.
      debugPrint('[APP-LOCK] graceApplied — removing overlay without PIN');
      if (mounted) setState(() => _privacyVisible = false);
      return;
    }

    // Lock the session now (may already be locked from cold-start).
    if (!svc.isLocked) {
      debugPrint('[APP-LOCK] graceExpired — locking session');
      svc.lock();
    }

    // ── Duplicate-push guard ───────────────────────────────────────────────
    // PinScreen.activeOnScreen catches cold-start PinScreen (pushed by splash,
    // not by this guard). _lockRoutePushed catches the guard's own pushes.
    final unlockInProgress = _lockRoutePushed || PinScreen.activeOnScreen;
    debugPrint('[APP-LOCK] requestUnlock reason=lifecycle unlockRouteVisible=${PinScreen.activeOnScreen} unlockInProgress=$unlockInProgress');

    if (unlockInProgress) {
      // PIN already on screen — just schedule overlay removal so the PIN
      // screen becomes visible once it renders.
      debugPrint('[APP-LOCK] PIN already on screen — scheduling overlay removal, no second push');
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _privacyVisible = false);
      });
      return;
    }

    _lockRoutePushed = true;
    debugPrint('[APP-LOCK] pushingPinScreen=true reason=lifecycle');

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
    _pendingUnlockCallbacks.add(onSuccess);
    debugPrint('[APP-LOCK] requestUnlock reason=deepLink callbackQueued=${_pendingUnlockCallbacks.length} unlockRouteVisible=${PinScreen.activeOnScreen} unlockInProgress=$_lockRoutePushed');

    final unlockInProgress = _lockRoutePushed || PinScreen.activeOnScreen;
    if (unlockInProgress) {
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

      debugPrint('[APP-LOCK] pushingPinScreen=true reason=deepLink');
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

      // *** CRITICAL ***
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
// Privacy overlay  —  build marker: APPLOCK-GRACE-v3
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
