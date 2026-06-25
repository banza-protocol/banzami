import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../services/merchant_session_service.dart';
import '../../widgets/pin_pad.dart';

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
  int     _padKey     = 0;

  void _onPinComplete() async {
    if (_pin.length < kPinLength) return;

    if (!_confirming) {
      setState(() { _firstPin = _pin; _pin = ''; _confirming = true; _padKey++; });
      return;
    }

    if (_pin != _firstPin) {
      setState(() { _error = true; _pin = ''; _confirming = false; _firstPin = null; _padKey++; });
      return;
    }

    setState(() => _saving = true);
    final svc = context.read<MerchantSessionService>();
    await svc.createSession(
      merchantId:    widget.merchantId    ?? svc.session!.merchantId,
      merchantName:  widget.merchantName  ?? svc.session!.merchantName,
      merchantEmail: widget.merchantEmail ?? svc.session!.merchantEmail,
      walletId:      widget.walletId      ?? svc.session!.walletId,
      apiKey:        widget.apiKey        ?? svc.session!.apiKey ?? '',
      verified:      widget.verified,
      pin:           _pin,
    );
    if (!mounted) return;
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    return BanzamiScaffold(
      backgroundColor: BanzamiColors.white,
      appBar: BanzamiAppBar(
        showBack:        !widget.isSetup,
        backgroundColor: BanzamiColors.white,
      ),
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
                    key:        ValueKey(_padKey),
                    onChanged:  (v) => setState(() { _pin = v; _error = false; }),
                    onComplete: _onPinComplete,
                    disabled:   _saving,
                  ),
                  const SizedBox(height: 48),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
