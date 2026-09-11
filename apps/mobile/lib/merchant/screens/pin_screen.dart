import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../services/merchant_reauth.dart';
import '../services/merchant_session_service.dart';
import '../../widgets/banzami_premium_dialog.dart';
import '../../widgets/pin_pad.dart';

/// Ecrã de desbloqueio e de nova entrada.
///
/// Over a live session it is the device lock: the PIN is checked on the device
/// and an expired access token is renewed with the refresh token — the PIN is
/// not sent. Once the session has ENDED it is sign-in for the remembered
/// @handle: the PIN re-authenticates against Banzami.
class MerchantPinScreen extends StatefulWidget {
  const MerchantPinScreen({super.key});

  @override
  State<MerchantPinScreen> createState() => _MerchantPinScreenState();
}

class _MerchantPinScreenState extends State<MerchantPinScreen>
    with WidgetsBindingObserver {
  String _pin         = '';
  bool   _error       = false;
  bool   _checking    = false;
  int    _padResetKey = 0;

  // The device lock over a live session is checked on the device, so it has
  // its own attempt limit (as in the consumer app): after [kPinMaxAttempts]
  // wrong PINs the pad waits [kPinLockout] before trying again.
  static const int      kPinMaxAttempts = 5;
  static const Duration kPinLockout     = Duration(seconds: 30);
  int       _failedAttempts = 0;
  DateTime? _lockoutUntil;

  bool get _isLockedOut {
    final until = _lockoutUntil;
    return until != null && DateTime.now().isBefore(until);
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _tryBiometrics());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Shown under the title when something other than a wrong PIN stopped the
  /// sign-in (no connection, a server lockout).
  String? _notice;

  Future<void> _tryBiometrics() async {
    final svc = context.read<MerchantSessionService>();
    // Biometrics prove the person on this device, so they can lift the device
    // lock over a LIVE session (its access token renewed with the refresh
    // token, if needed). They are not a credential Banzami knows: an ended
    // session needs the PIN to sign in again.
    if (svc.route != MerchantRoute.locked || svc.sessionExpired) return;
    final s = svc.session!;
    if (!s.biometricsEnabled) return;
    if (s.isHandleLogin && !s.canRenew && svc.isTokenExpired()) return;
    final ok = await svc.authenticateWithBiometrics();
    if (!ok || !mounted) return;
    if (s.isHandleLogin) {
      final r = await resumeBusinessSession(client: context.read<BanzamiClient>(), session: svc);
      if (!mounted || r == SessionResume.ended) return; // now on sign-in: PIN
    }
    svc.unlock();
  }

  Future<void> _onPinComplete() async {
    if (_pin.length < kPinLength || _checking) return;
    if (_isLockedOut) {
      final secs = _lockoutUntil!.difference(DateTime.now()).inSeconds + 1;
      setState(() {
        _notice = 'Demasiadas tentativas. Tente novamente em $secs segundos.';
        _pin = ''; _padResetKey += 1;
      });
      return;
    }
    setState(() { _checking = true; _error = false; _notice = null; });

    final svc = context.read<MerchantSessionService>();
    // The device's own check first: a wrong PIN is refused here, without
    // spending one of the server's lockout attempts.
    final ok  = await svc.verifyPin(_pin);
    if (!mounted) return;
    if (!ok) {
      _failedAttempts += 1;
      if (_failedAttempts >= kPinMaxAttempts) {
        _failedAttempts = 0;
        _lockoutUntil   = DateTime.now().add(kPinLockout);
      }
      setState(() { _error = true; _checking = false; _pin = ''; _padResetKey += 1; });
      return;
    }
    _failedAttempts = 0;
    _lockoutUntil   = null;

    // A live Business session: the PIN is a device lock and stays on the
    // device. An expired access token is renewed with the refresh token.
    if (svc.route == MerchantRoute.locked) {
      final r = await resumeBusinessSession(client: context.read<BanzamiClient>(), session: svc);
      if (!mounted) return;
      if (r != SessionResume.ended) {
        // Renewed — or Banzami is unreachable, which ends nothing: the screens
        // say it is temporarily unavailable and renew on the next call.
        svc.unlock();
        return;
      }
      // The session has ended (the app is now on sign-in): the PIN just
      // entered signs in again.
    }

    // Sign-in: the session ended (or predates refresh tokens). The remembered
    // @handle + this PIN re-authenticate against Banzami and open a new
    // session, refresh token included.
    try {
      await reauthenticateBusiness(
        client:  context.read<BanzamiClient>(),
        session: svc,
        pin:     _pin,
      );
    } on ReauthException catch (e) {
      if (!mounted) return;
      switch (e.failure) {
        case ReauthFailure.offline:
          _notice = 'Sem ligação ao Banzami. Não foi possível entrar — tente novamente.';
        case ReauthFailure.unavailable:
          // An outage is not a refusal: nothing on this device is cleared.
          _notice = 'O Banzami está temporariamente indisponível. Não foi possível entrar — tente novamente.';
        case ReauthFailure.locked:
          _notice = 'Conta temporariamente bloqueada. Tente novamente mais tarde.';
        case ReauthFailure.refused:
          // A definitive 401: the PIN matches this device but Banzami refused
          // it — it was changed, or the account was suspended or reassigned.
          // Nothing this device remembered is kept.
          await svc.clearAccount();
          return;
      }
      setState(() { _checking = false; _pin = ''; _padResetKey += 1; });
    }
  }

  Future<void> _confirmSwitchAccount() async {
    final svc    = context.read<MerchantSessionService>();
    final client = context.read<BanzamiClient>();
    final confirm = await showBanzamiDialog(
      context:      context,
      icon:         Icons.swap_horiz_rounded,
      title:        'Usar outra conta?',
      description:  'A conta actual será removida.\nPode reconectar quando quiser.',
      cancelLabel:  'Cancelar',
      confirmLabel: 'Remover',
      variant:      BanzamiDialogVariant.warning,
    );
    if (confirm == true) {
      await signOutBusiness(client: client, session: svc, removeAccount: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final svc     = context.watch<MerchantSessionService>();
    final session = svc.session;
    // Signing in again after the session ended: nothing about the Business is
    // shown but its public @handle — not a profile that looks signed in.
    final title = session?.merchantName ??
        (svc.signInHandle != null ? '@${svc.signInHandle}' : 'Banzami');

    return Scaffold(
      backgroundColor: BanzamiColors.white,
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
                  Text(
                    title,
                    style: BanzamiTextStyles.headingMd,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _error
                        ? 'PIN incorrecto. Tente novamente.'
                        : _notice ?? (svc.sessionExpired
                            ? 'A sessão terminou. Introduza o PIN para continuar.'
                            : 'Introduza o PIN'),
                    style: BanzamiTextStyles.bodyMd.copyWith(
                      color: (_error || _notice != null) ? BanzamiColors.error : BanzamiColors.gray400,
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
                  if (session?.biometricsEnabled == true && !svc.sessionExpired)
                    BanzamiGhostButton(label: 'Usar biometria', onPressed: _tryBiometrics),
                  const SizedBox(height: 8),
                  BanzamiGhostButton(
                    label:     'Usar outra conta',
                    color:     BanzamiColors.gray400,
                    onPressed: _confirmSwitchAccount,
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
