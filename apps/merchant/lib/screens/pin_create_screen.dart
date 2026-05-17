import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

import '../services/merchant_session_service.dart';
import '../widgets/pin_pad.dart';

/// Cria e confirma o PIN durante o onboarding (isSetup = true)
/// ou define um novo PIN (isSetup = false, não implementado ainda).
class PinCreateScreen extends StatefulWidget {
  final bool   isSetup;
  final String? merchantId;
  final String? merchantName;
  final String? merchantEmail;
  final String? walletId;
  final String? apiKey;
  final bool    verified;

  const PinCreateScreen({
    super.key,
    required this.isSetup,
    this.merchantId,
    this.merchantName,
    this.merchantEmail,
    this.walletId,
    this.apiKey,
    this.verified = false,
  });

  @override
  State<PinCreateScreen> createState() => _PinCreateScreenState();
}

class _PinCreateScreenState extends State<PinCreateScreen> {
  String  _pin        = '';
  String? _firstPin;
  bool    _confirming = false;
  bool    _error      = false;
  bool    _saving     = false;

  void _onPinComplete() async {
    if (_pin.length < kPinLength) return;

    if (!_confirming) {
      setState(() { _firstPin = _pin; _pin = ''; _confirming = true; });
      return;
    }

    if (_pin != _firstPin) {
      setState(() { _error = true; _pin = ''; _confirming = false; _firstPin = null; });
      return;
    }

    setState(() => _saving = true);
    final svc = context.read<MerchantSessionService>();
    await svc.createSession(
      merchantId:    widget.merchantId    ?? svc.session!.merchantId,
      merchantName:  widget.merchantName  ?? svc.session!.merchantName,
      merchantEmail: widget.merchantEmail ?? svc.session!.merchantEmail,
      walletId:      widget.walletId      ?? svc.session!.walletId,
      apiKey:        widget.apiKey        ?? svc.session!.apiKey,
      verified:      widget.verified,
      pin:           _pin,
    );
    // O app.dart detecta a sessão e navega para MainScreen automaticamente.
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.white,
      appBar: AppBar(
        backgroundColor: BanzamiColors.white,
        foregroundColor: BanzamiColors.gray900,
        elevation:       0,
        automaticallyImplyLeading: !widget.isSetup,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            children: [
              const Spacer(flex: 2),
              Text(
                _confirming ? 'Confirmar PIN' : 'Criar PIN',
                style: BanzamiTextStyles.headingMd,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                _error
                    ? 'Os PINs não coincidem. Tente novamente.'
                    : _confirming
                        ? 'Introduza o PIN novamente para confirmar.'
                        : 'Escolha um PIN de 6 dígitos para proteger o acesso.',
                style: BanzamiTextStyles.bodyMd.copyWith(
                  color: _error ? BanzamiColors.error : BanzamiColors.gray400,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 40),
              PinPad(
                onChanged:  (v) => setState(() { _pin = v; _error = false; }),
                onComplete: _onPinComplete,
                disabled:   _saving,
              ),
              const Spacer(flex: 1),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
