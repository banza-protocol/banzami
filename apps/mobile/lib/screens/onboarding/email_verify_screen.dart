import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import 'setup_pin_screen.dart';

/// Signup step between "Criar conta" and "Crie o seu PIN": confirm the 6-digit
/// code emailed to the address, proving the person controls it. On success the
/// opaque verification token is carried to SetupPinScreen, which passes it to
/// register so the account is created with a verified email. This is email
/// ownership, NOT identity verification (no KYC in Sandbox).
class EmailVerifyScreen extends StatefulWidget {
  final String handle;
  final String displayName;
  final String email;

  const EmailVerifyScreen({
    super.key,
    required this.handle,
    required this.displayName,
    required this.email,
  });

  @override
  State<EmailVerifyScreen> createState() => _EmailVerifyScreenState();
}

class _EmailVerifyScreenState extends State<EmailVerifyScreen> {
  final _codeCtrl = TextEditingController();
  bool _busy = false;
  bool _resending = false;
  String? _error;

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final code = _codeCtrl.text.trim();
    if (code.length != 6) {
      setState(() => _error = 'Introduza o código de 6 dígitos.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final token = await context
          .read<ConsumerPublicClient>()
          .verifyEmailOtp(email: widget.email, code: code);
      if (!mounted) return;
      Navigator.of(context).push(BanzamiPageRoute(
        page: SetupPinScreen(
          handle: widget.handle,
          displayName: widget.displayName,
          email: widget.email,
          emailVerificationToken: token,
        ),
      ));
      setState(() => _busy = false);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Código inválido ou expirado. Verifique ou peça um novo.';
      });
    }
  }

  Future<void> _resend() async {
    setState(() {
      _resending = true;
      _error = null;
    });
    try {
      await context.read<ConsumerPublicClient>().requestEmailOtp(email: widget.email);
      if (mounted) BanzamiToast.showSuccess(context, 'Enviámos um novo código.');
    } catch (_) {
      if (mounted) BanzamiToast.showWarning(context, 'Não foi possível reenviar o código.');
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return BanzamiScaffold(
      backgroundColor: BanzamiColors.white,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AppScreenHeader(
              title: 'Confirme o email',
              onBack: _busy ? null : () => Navigator.of(context).maybePop(),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 24),
                    Text(
                      'Enviámos um código de 6 dígitos para ${widget.email}. Introduza-o para confirmar o seu email.',
                      style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
                    ),
                    const SizedBox(height: 24),
                    TextField(
                      controller: _codeCtrl,
                      autofocus: true,
                      keyboardType: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(6),
                      ],
                      textAlign: TextAlign.center,
                      style: BanzamiTextStyles.headingSm.copyWith(letterSpacing: 8),
                      decoration: const InputDecoration(hintText: '000000'),
                      onSubmitted: (_) => _verify(),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(_error!, style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error)),
                    ],
                    const SizedBox(height: 28),
                    BanzamiPrimaryButton(
                      label: 'Verificar',
                      isLoading: _busy,
                      onPressed: _busy ? null : _verify,
                    ),
                    const SizedBox(height: 8),
                    BanzamiGhostButton(
                      label: _resending ? 'A reenviar...' : 'Reenviar código',
                      onPressed: _resending ? null : _resend,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
