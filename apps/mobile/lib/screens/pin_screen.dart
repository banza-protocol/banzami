import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart';

import '../services/session_service.dart';
import '../widgets/banza_premium_dialog.dart';
import '../widgets/pin_pad.dart';
import 'main_screen.dart';
import 'onboarding/welcome_screen.dart';

/// PIN entry screen — used in two modes:
///
/// **Cold-start / session lock** (`isAppLock = false`, default):
///   On success, pushes MainScreen via pushReplacement (full navigation reset).
///
/// **App-lock overlay** (`isAppLock = true`):
///   On success, calls [onUnlocked] and pops itself so the previous route
///   (MainScreen or any pushed screen) is revealed.  Does NOT push MainScreen.
class PinScreen extends StatefulWidget {
  /// When true the screen is acting as an app-lock overlay, not the initial
  /// login screen.  Changes post-unlock navigation and adds a lock icon.
  final bool          isAppLock;

  /// Called immediately after a successful unlock when [isAppLock] is true.
  /// The guard uses this to reset its overlay state before the route pops.
  final VoidCallback? onUnlocked;

  const PinScreen({
    super.key,
    this.isAppLock  = false,
    this.onUnlocked,
  });

  // ── Global visibility flag ─────────────────────────────────────────────────
  //
  // Counts how many PinScreen instances are currently mounted. The lifecycle
  // guard reads this before pushing to prevent a second PIN screen appearing
  // on top of a cold-start PIN screen (which the guard did not push itself).
  static int _activeCount = 0;
  static bool get activeOnScreen => _activeCount > 0;

  @override
  State<PinScreen> createState() => _PinScreenState();
}

class _PinScreenState extends State<PinScreen> with WidgetsBindingObserver {
  String _pin         = '';
  bool   _error       = false;
  bool   _checking    = false;
  int    _padResetKey = 0;

  int       _failedAttempts = 0;
  DateTime? _lockoutUntil;

  @override
  void initState() {
    super.initState();
    PinScreen._activeCount++;
    debugPrint('[APP-LOCK] PinScreen.initState isAppLock=${widget.isAppLock} activeCount=${PinScreen._activeCount}');
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _tryBiometrics());
  }

  @override
  void dispose() {
    PinScreen._activeCount--;
    debugPrint('[APP-LOCK] PinScreen.dispose isAppLock=${widget.isAppLock} activeCount=${PinScreen._activeCount}');
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _tryBiometrics() async {
    final svc = context.read<SessionService>();
    if (svc.session?.biometricsEnabled != true) return;
    // Local expiry check is sufficient — calling checkAuth() here fires
    // onUnauthorized on 401, which logs the user out while they are still
    // on the PIN screen (race with PIN entry).
    if (svc.isTokenExpired) return;

    final ok = await svc.authenticateWithBiometrics();
    if (ok && mounted) {
      svc.unlock();
      if (widget.isAppLock) {
        widget.onUnlocked?.call();
        Navigator.of(context).pop();
      } else {
        Navigator.of(context).pushReplacement(
          PageRouteBuilder(
            pageBuilder: (_, __, ___) => const MainScreen(),
            transitionDuration: Duration.zero,
            reverseTransitionDuration: Duration.zero,
          ),
        );
      }
    }
  }

  bool get _isLockedOut {
    final until = _lockoutUntil;
    return until != null && DateTime.now().isBefore(until);
  }

  Future<void> _onPinComplete() async {
    if (_pin.length < kPinLength || _checking) return;

    if (_isLockedOut) {
      final secs = _lockoutUntil!.difference(DateTime.now()).inSeconds + 1;
      setState(() { _error = true; _pin = ''; _padResetKey += 1; });
      BanzaToast.showWarning(context, 'Demasiadas tentativas. Tente novamente em $secs segundos.');
      return;
    }

    setState(() { _checking = true; _error = false; });

    final svc    = context.read<SessionService>();
    final client = context.read<ConsumerPublicClient>();
    final ok     = await svc.verifyPin(_pin);

    if (!mounted) return;
    if (ok) {
      _failedAttempts = 0;
      _lockoutUntil   = null;
      try {
        final result = await client.login(
          handle: svc.session!.handle,
          pin:    _pin,
        );
        await svc.updateToken(result.token);
      } catch (_) {}
      svc.unlock();
      if (mounted) {
        if (widget.isAppLock) {
          widget.onUnlocked?.call();
          Navigator.of(context).pop();
        } else {
          Navigator.of(context).pushReplacement(
            PageRouteBuilder(
              pageBuilder: (_, __, ___) => const MainScreen(),
              transitionDuration: Duration.zero,
              reverseTransitionDuration: Duration.zero,
            ),
          );
        }
      }
    } else {
      _failedAttempts += 1;
      if (_failedAttempts >= 5) {
        _lockoutUntil = DateTime.now().add(const Duration(seconds: 30));
      }
      setState(() {
        _error        = true;
        _checking     = false;
        _pin          = '';
        _padResetKey += 1;
      });
    }
  }

  Future<void> _confirmLogout() async {
    final confirmed = await showBanzaDialog(
      context:      context,
      icon:         Icons.manage_accounts_rounded,
      title:        'Usar outra conta?',
      description:  'Vai sair desta conta neste dispositivo.\nPode entrar novamente quando quiser.',
      cancelLabel:  'Cancelar',
      confirmLabel: 'Continuar',
      variant:      BanzaDialogVariant.warning,
    );
    if (confirmed == true && mounted) {
      await context.read<SessionService>().logout();
      if (mounted) {
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const WelcomeScreen()),
          (_) => false,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.read<SessionService>().session;

    return Scaffold(
      backgroundColor: BanzaColors.offWhite,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const SizedBox(height: 24),

                  if (widget.isAppLock) ...[
                    Container(
                      width:  52,
                      height: 52,
                      decoration: BoxDecoration(
                        color:        const Color(0xFF3D0008).withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(
                        Icons.lock_rounded,
                        color: Color(0xFF3D0008),
                        size:  26,
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],

                  if (session?.displayName != null)
                    Text(
                      'Olá, ${session!.displayName}',
                      style: BanzaTextStyles.headingMd,
                      textAlign: TextAlign.center,
                    ),
                  const SizedBox(height: 8),
                  Text(
                    _isLockedOut
                        ? 'Conta bloqueada temporariamente.'
                        : _error
                            ? 'PIN incorrecto. Tente novamente.'
                            : 'Introduza o PIN',
                    style: BanzaTextStyles.bodyMd.copyWith(
                      color: _error ? BanzaColors.error : BanzaColors.gray400,
                    ),
                    textAlign: TextAlign.center,
                  ),

                  const SizedBox(height: 40),

                  PinPad(
                    key:       ValueKey(_padResetKey),
                    onChanged: (v) => setState(() { _pin = v; _error = false; }),
                    onComplete: _onPinComplete,
                    disabled:  _checking,
                    error:     _error,
                  ),

                  const SizedBox(height: 24),

                  if (session?.biometricsEnabled == true)
                    TextButton.icon(
                      onPressed: _tryBiometrics,
                      icon:  const Icon(Icons.fingerprint_rounded, color: BanzaColors.wine),
                      label: Text(
                        'Usar biometria',
                        style: BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.wine),
                      ),
                    ),

                  const SizedBox(height: 8),

                  TextButton(
                    onPressed: _confirmLogout,
                    child: Text(
                      'Usar outra conta',
                      style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
                    ),
                  ),

                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
