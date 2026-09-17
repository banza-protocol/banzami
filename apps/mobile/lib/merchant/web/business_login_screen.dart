import 'package:banzami_flutter/banzami_flutter.dart' hide Consumer;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'merchant_web_session.dart';

/// Business Web sign-in — the canonical @handle + PIN contract (ADR-066). No
/// password, no secret key, no biometrics. The BFF holds the merchant JWT.
class BusinessLoginScreen extends StatefulWidget {
  const BusinessLoginScreen({super.key});
  @override
  State<BusinessLoginScreen> createState() => _BusinessLoginScreenState();
}

class _BusinessLoginScreenState extends State<BusinessLoginScreen> {
  final _handle = TextEditingController();
  final _pin = TextEditingController();

  Future<void> _submit() async {
    final session = context.read<MerchantWebSession>();
    FocusScope.of(context).unfocus();
    final err = await session.login(_handle.text, _pin.text);
    if (err != null && mounted) _pin.clear();
  }

  @override
  void dispose() {
    _handle.dispose();
    _pin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<MerchantWebSession>();
    final busy = session.state == BusinessWebState.loggingIn;
    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('App Banzami', style: TextStyle(fontSize: 15, color: BanzamiColors.gray400, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  const Text('Business', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: BanzamiColors.gray900)),
                  const SizedBox(height: 8),
                  const Text('Entre com o seu @banza e PIN para receber pagamentos.',
                      style: TextStyle(fontSize: 15, color: BanzamiColors.gray400, height: 1.4)),
                  const SizedBox(height: 28),
                  const Align(alignment: Alignment.centerLeft, child: Text('O seu @banza', style: TextStyle(fontSize: 13, color: BanzamiColors.gray400, fontWeight: FontWeight.w600))),
                  const SizedBox(height: 6),
                  Semantics(
                    label: 'O seu @banza',
                    textField: true,
                    child: TextField(
                      controller: _handle,
                      autocorrect: false,
                      enableSuggestions: false,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                        hintText: 'ana_negocio',
                        prefixText: '@ ',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Align(alignment: Alignment.centerLeft, child: Text('PIN', style: TextStyle(fontSize: 13, color: BanzamiColors.gray400, fontWeight: FontWeight.w600))),
                  const SizedBox(height: 6),
                  Semantics(
                    label: 'PIN',
                    textField: true,
                    child: TextField(
                      controller: _pin,
                      obscureText: true,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(8)],
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => busy ? null : _submit(),
                      decoration: const InputDecoration(
                        hintText: '••••••',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  if (session.error != null) ...[
                    const SizedBox(height: 12),
                    Text(session.error!, style: const TextStyle(color: BanzamiColors.error, fontSize: 14)),
                  ],
                  const SizedBox(height: 24),
                  BanzamiPrimaryButton(
                    label: 'Entrar',
                    isLoading: busy,
                    onPressed: busy ? null : _submit,
                  ),
                  // No in-app "Ir para a conta Pessoal": the Personal↔Business
                  // switch lives only in the outer web shell
                  // (APP-BANZAMI-WEB-DUAL-SHELL-001).
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
