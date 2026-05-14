import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

import '../../services/session_service.dart';
import '../../widgets/pin_pad.dart';

enum _Step { enter, confirm }

/// Step 2 of onboarding: create and confirm a 6-digit PIN, then register
/// the consumer account on the server (POST /v1/auth/register) and persist
/// the session locally.
class SetupPinScreen extends StatefulWidget {
  final String  handle;
  final String? displayName;

  const SetupPinScreen({
    super.key,
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
  String? _apiError;

  String get _title => _step == _Step.enter ? 'Crie o seu PIN' : 'Confirme o PIN';

  String get _subtitle {
    if (_apiError != null) return _apiError!;
    if (_error) return 'PINs não coincidem. Tente novamente.';
    return _step == _Step.enter
        ? 'Será pedido sempre que abrir a app'
        : 'Introduza novamente o PIN';
  }

  void _onChanged(String pin) => setState(() { _currentPin = pin; _error = false; _apiError = null; });

  void _onComplete() {
    if (_step == _Step.enter) {
      setState(() {
        _firstPin   = _currentPin;
        _currentPin = '';
        _step       = _Step.confirm;
      });
      return;
    }

    if (_currentPin == _firstPin) {
      _register();
    } else {
      setState(() { _error = true; _currentPin = ''; _step = _Step.enter; _firstPin = ''; });
    }
  }

  Future<void> _register() async {
    setState(() => _saving = true);

    final client = context.read<ConsumerPublicClient>();
    final svc    = context.read<SessionService>();

    try {
      final reg = await client.register(
        handle:      widget.handle,
        displayName: widget.displayName,
        pin:         _currentPin,
      );

      await svc.createSession(
        consumerId:  reg.consumer.id,
        walletId:    reg.walletId,
        handle:      widget.handle,
        displayName: widget.displayName,
        pin:         _currentPin,
        token:       reg.token,
      );

      if (!mounted) return;

      final canBio = await svc.canUseBiometrics();
      if (!mounted) return;
      if (canBio) _showBiometricsPrompt();
      // SessionService notifies listeners → app.dart rebuilds → MainScreen shown.
    } on BanzamiApiException catch (e) {
      setState(() {
        _apiError   = e.code == 'HANDLE_TAKEN'
            ? 'Este @handle já está em uso. Volte atrás e escolha outro.'
            : e.message;
        _saving     = false;
        _step       = _Step.enter;
        _firstPin   = '';
        _currentPin = '';
      });
    } catch (_) {
      setState(() {
        _apiError   = 'Erro de ligação. Verifique a internet e tente novamente.';
        _saving     = false;
        _step       = _Step.enter;
        _firstPin   = '';
        _currentPin = '';
      });
    }
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
        automaticallyImplyLeading: _step == _Step.enter && !_saving,
        leading: _step == _Step.confirm
            ? IconButton(
                icon:      const Icon(Icons.arrow_back_rounded),
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
                  color: (_error || _apiError != null)
                      ? BanzamiColors.error
                      : BanzamiColors.gray400,
                ),
                textAlign: TextAlign.center,
              ),

              const SizedBox(height: 40),

              if (_saving)
                const CircularProgressIndicator(color: BanzamiColors.wine)
              else
                PinPad(
                  key:        ValueKey(_step),
                  onChanged:  _onChanged,
                  onComplete: _onComplete,
                ),

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
                padding:         const EdgeInsets.symmetric(vertical: 14),
                shape:           RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
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
