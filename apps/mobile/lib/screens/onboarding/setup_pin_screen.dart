import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

import '../../services/session_service.dart';
import '../../widgets/pin_pad.dart';

enum _Step { enter, confirm }

/// Step 2 of onboarding: create and confirm a 6-digit PIN, then persist
/// the session and (optionally) enable biometrics.
class SetupPinScreen extends StatefulWidget {
  final String  consumerId;
  final String  walletId;
  final String  handle;
  final String? displayName;

  const SetupPinScreen({
    super.key,
    required this.consumerId,
    required this.walletId,
    required this.handle,
    this.displayName,
  });

  @override
  State<SetupPinScreen> createState() => _SetupPinScreenState();
}

class _SetupPinScreenState extends State<SetupPinScreen> {
  _Step   _step       = _Step.enter;
  String  _firstPin   = '';
  String  _currentPin = '';
  bool    _error      = false;
  bool    _saving     = false;

  String get _title => _step == _Step.enter
      ? 'Crie o seu PIN'
      : 'Confirme o PIN';

  String get _subtitle => _step == _Step.enter
      ? 'Será pedido sempre que abrir a app'
      : _error ? 'PINs não coincidem. Tente novamente.' : 'Introduza novamente o PIN';

  void _onChanged(String pin) => setState(() { _currentPin = pin; _error = false; });

  void _onComplete() {
    if (_step == _Step.enter) {
      setState(() {
        _firstPin   = _currentPin;
        _currentPin = '';
        _step       = _Step.confirm;
      });
      return;
    }

    // Confirm step
    if (_currentPin == _firstPin) {
      _save();
    } else {
      setState(() { _error = true; _currentPin = ''; _step = _Step.enter; _firstPin = ''; });
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final svc = context.read<SessionService>();
    await svc.createSession(
      consumerId:  widget.consumerId,
      walletId:    widget.walletId,
      handle:      widget.handle,
      displayName: widget.displayName,
      pin:         _currentPin,
    );

    if (!mounted) return;

    // Offer biometrics if available
    final canBio = await svc.canUseBiometrics();
    if (!mounted) return;

    if (canBio) {
      _showBiometricsPrompt();
    }
    // SessionService.unlock() is already called inside createSession;
    // app.dart's Consumer will rebuild and route to MainScreen automatically.
  }

  void _showBiometricsPrompt() {
    showModalBottomSheet<void>(
      context:       context,
      isDismissible: false,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _BiometricsSheet(
        onEnable: () async {
          Navigator.pop(context);
          await context.read<SessionService>().enableBiometrics();
        },
        onSkip: () => Navigator.pop(context),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.white,
      appBar: AppBar(
        backgroundColor: BanzamiColors.white,
        foregroundColor: BanzamiColors.gray900,
        elevation:       0,
        automaticallyImplyLeading: _step == _Step.enter,
        leading: _step == _Step.confirm
            ? IconButton(
                icon: const Icon(Icons.arrow_back_rounded),
                onPressed: () => setState(() {
                  _step = _Step.enter; _firstPin = ''; _currentPin = ''; _error = false;
                }),
              )
            : null,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            children: [
              const Spacer(flex: 2),

              Text(_title, style: BanzamiTextStyles.headingLg),
              const SizedBox(height: 8),
              Text(
                _subtitle,
                style: BanzamiTextStyles.bodyMd.copyWith(
                  color: _error ? BanzamiColors.error : BanzamiColors.gray400,
                ),
                textAlign: TextAlign.center,
              ),

              const SizedBox(height: 40),

              if (!_saving)
                PinPad(
                  key:        ValueKey(_step),
                  onChanged:  _onChanged,
                  onComplete: _onComplete,
                )
              else
                const CircularProgressIndicator(color: BanzamiColors.wine),

              const Spacer(flex: 3),
            ],
          ),
        ),
      ),
    );
  }
}

class _BiometricsSheet extends StatelessWidget {
  final VoidCallback onEnable;
  final VoidCallback onSkip;

  const _BiometricsSheet({required this.onEnable, required this.onSkip});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.fingerprint_rounded, size: 56, color: BanzamiColors.wine),
          const SizedBox(height: BanzamiSpacing.lg),
          const Text('Activar biometria?', style: BanzamiTextStyles.headingMd),
          const SizedBox(height: BanzamiSpacing.sm),
          Text(
            'Use Face ID ou impressão digital para entrar mais rapidamente.',
            style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: BanzamiSpacing.xl),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: onEnable,
              style: ElevatedButton.styleFrom(
                backgroundColor: BanzamiColors.wine,
                foregroundColor: BanzamiColors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Activar'),
            ),
          ),
          const SizedBox(height: BanzamiSpacing.sm),
          TextButton(
            onPressed: onSkip,
            child: Text('Agora não',
              style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
          ),
          const SizedBox(height: BanzamiSpacing.md),
        ],
      ),
    );
  }
}
