import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

import '../services/session_service.dart';
import '../widgets/pin_pad.dart';

/// PIN entry screen — shown when the app is locked (foreground resume or cold start
/// with an existing session).  Offers biometric unlock when enabled.
class PinScreen extends StatefulWidget {
  const PinScreen({super.key});

  @override
  State<PinScreen> createState() => _PinScreenState();
}

class _PinScreenState extends State<PinScreen> with WidgetsBindingObserver {
  String  _pin      = '';
  bool    _error    = false;
  bool    _checking = false;

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
    final svc = context.read<SessionService>();
    if (svc.session?.biometricsEnabled != true) return;
    final ok = await svc.authenticateWithBiometrics();
    if (ok && mounted) svc.unlock();
  }

  Future<void> _onPinComplete() async {
    if (_pin.length < kPinLength || _checking) return;
    setState(() { _checking = true; _error = false; });

    final svc = context.read<SessionService>();
    final ok  = await svc.verifyPin(_pin);

    if (!mounted) return;
    if (ok) {
      svc.unlock();
    } else {
      setState(() { _error = true; _checking = false; _pin = ''; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.read<SessionService>().session;

    return Scaffold(
      backgroundColor: BanzamiColors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            children: [
              const Spacer(flex: 2),

              // Greeting
              if (session?.displayName != null)
                Text(
                  'Olá, ${session!.displayName}',
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

              // PIN pad (manages its own dot display)
              PinPad(
                onChanged:  (v) => setState(() { _pin = v; _error = false; }),
                onComplete: _onPinComplete,
                disabled:   _checking,
              ),

              const Spacer(flex: 1),

              // Biometric shortcut
              if (session?.biometricsEnabled == true)
                TextButton.icon(
                  onPressed: _tryBiometrics,
                  icon:  const Icon(Icons.fingerprint_rounded, color: BanzamiColors.wine),
                  label: Text(
                    'Usar biometria',
                    style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.wine),
                  ),
                ),

              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
