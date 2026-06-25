import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

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

  Future<void> _tryBiometrics() async {
    final svc = context.read<MerchantSessionService>();
    if (svc.session?.biometricsEnabled != true) return;
    final ok = await svc.authenticateWithBiometrics();
    if (ok && mounted) svc.unlock();
  }

  Future<void> _onPinComplete() async {
    if (_pin.length < kPinLength || _checking) return;
    setState(() { _checking = true; _error = false; });

    final svc = context.read<MerchantSessionService>();
    final ok  = await svc.verifyPin(_pin);

    if (!mounted) return;
    if (ok) {
      svc.unlock();
    } else {
      setState(() { _error = true; _checking = false; _pin = ''; _padResetKey += 1; });
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
                    _error ? 'PIN incorrecto. Tente novamente.' : 'Introduza o PIN',
                    style: BanzamiTextStyles.bodyMd.copyWith(
                      color: _error ? BanzamiColors.error : BanzamiColors.gray400,
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
                      icon:  const Icon(Icons.fingerprint_rounded, color: BanzamiColors.primary),
                      label: Text('Usar biometria',
                          style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.primary)),
                    ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: _confirmSwitchAccount,
                    child: Text('Usar outra conta',
                        style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
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
