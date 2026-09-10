import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../services/merchant_reauth.dart';
import '../services/merchant_session_service.dart';
import '../../widgets/banzami_premium_dialog.dart';
import '../../widgets/pin_pad.dart';

/// Ecrã de desbloqueio — mostrado quando a sessão está bloqueada.
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

  /// Shown under the title when the PIN is not only a lock: the server session
  /// has ended, or it could not be renewed.
  String? _notice;

  Future<void> _tryBiometrics() async {
    final svc = context.read<MerchantSessionService>();
    if (svc.session?.biometricsEnabled != true) return;
    // Biometrics prove the person, not the session. With a dead or dying token
    // they would unlock onto screens whose every call fails — so only the PIN,
    // which re-authenticates against Banzami, can reopen an expired session.
    if (svc.sessionExpired || svc.isTokenExpired()) return;
    final ok = await svc.authenticateWithBiometrics();
    if (ok && mounted) svc.unlock();
  }

  Future<void> _onPinComplete() async {
    if (_pin.length < kPinLength || _checking) return;
    setState(() { _checking = true; _error = false; _notice = null; });

    final svc = context.read<MerchantSessionService>();
    // The device's own check first: a wrong PIN is refused here, without
    // spending one of the server's lockout attempts.
    final ok  = await svc.verifyPin(_pin);
    if (!mounted) return;
    if (!ok) {
      setState(() { _error = true; _checking = false; _pin = ''; _padResetKey += 1; });
      return;
    }

    // An API-key session renews its own token; the PIN only unlocks the device.
    if (svc.session?.isHandleLogin != true) {
      svc.unlock();
      return;
    }

    // A handle session: every unlock re-authenticates, so the token behind the
    // screens is always one Banzami just issued for the handle's current owner.
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
          // Nothing learned about the session. A still-valid token may be used;
          // an expired one must not be presented as if it were.
          if (!svc.sessionExpired && !svc.isTokenExpired()) {
            svc.unlock();
            return;
          }
          _notice = 'Sem ligação ao Banzami. Não foi possível renovar a sessão — tente novamente.';
        case ReauthFailure.locked:
          _notice = 'Conta temporariamente bloqueada. Tente novamente mais tarde.';
        case ReauthFailure.refused:
          // The PIN matches this device but Banzami refused it: it was changed,
          // or the account was suspended or reassigned. The session here is
          // over, and nothing it remembered is kept.
          await svc.clearAccount();
          return;
      }
      setState(() { _checking = false; _pin = ''; _padResetKey += 1; });
    }
  }

  Future<void> _confirmSwitchAccount() async {
    final svc = context.read<MerchantSessionService>();
    final confirm = await showBanzamiDialog(
      context:      context,
      icon:         Icons.swap_horiz_rounded,
      title:        'Usar outra conta?',
      description:  'A conta actual será removida.\nPode reconectar quando quiser.',
      cancelLabel:  'Cancelar',
      confirmLabel: 'Remover',
      variant:      BanzamiDialogVariant.warning,
    );
    if (confirm == true) await svc.clearAccount();
  }

  @override
  Widget build(BuildContext context) {
    final session = context.read<MerchantSessionService>().session;

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
                    session?.merchantName ?? 'Banzami',
                    style: BanzamiTextStyles.headingMd,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _error
                        ? 'PIN incorrecto. Tente novamente.'
                        : _notice ?? (context.watch<MerchantSessionService>().sessionExpired
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
                  if (session?.biometricsEnabled == true &&
                      !context.watch<MerchantSessionService>().sessionExpired)
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
