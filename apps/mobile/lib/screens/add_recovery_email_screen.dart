import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

/// Authenticated "Adicionar email de recuperação" for a (typically legacy)
/// account that has no verified email yet. email → OTP → associate. After this,
/// "Esqueci o PIN" works for the account. This is enrolment only, not an
/// arbitrary email change (changing an existing email has its own policy).
enum _Step { email, code }

class AddRecoveryEmailScreen extends StatefulWidget {
  const AddRecoveryEmailScreen({super.key});

  @override
  State<AddRecoveryEmailScreen> createState() => _AddRecoveryEmailScreenState();
}

class _AddRecoveryEmailScreenState extends State<AddRecoveryEmailScreen> {
  static final _emailRe = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
  _Step _step = _Step.email;
  final _emailCtrl = TextEditingController();
  final _codeCtrl = TextEditingController();
  String _email = '';
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _codeCtrl.dispose();
    super.dispose();
  }

  ConsumerPublicClient get _client => context.read<ConsumerPublicClient>();

  Future<void> _sendCode() async {
    final email = _emailCtrl.text.trim().toLowerCase();
    if (email.length > 254 || !_emailRe.hasMatch(email)) {
      setState(() => _error = 'Introduza um email válido.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _client.requestRecoveryEmailOtp(email: email);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _email = email;
        _step = _Step.code;
      });
    } on BanzamiApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = switch (e.statusCode) {
          409 => 'Esta conta já tem um email de recuperação.',
          429 => 'Demasiados pedidos. Tente novamente dentro de momentos.',
          _ => 'Não foi possível enviar o código. Tente novamente.',
        };
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Não foi possível enviar o código. Tente novamente.';
      });
    }
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
      await _client.verifyRecoveryEmailOtp(email: _email, code: code);
      if (!mounted) return;
      BanzamiToast.showSuccess(context, 'Email de recuperação adicionado.');
      Navigator.of(context).pop(true);
    } on BanzamiApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = switch (e.statusCode) {
          409 => 'Este email já está associado a outra conta.',
          _ => 'Código inválido ou expirado. Verifique ou peça um novo.',
        };
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Código inválido ou expirado. Verifique ou peça um novo.';
      });
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
              title: 'Email de recuperação',
              onBack: _busy
                  ? null
                  : () {
                      if (_step == _Step.code) {
                        setState(() => _step = _Step.email);
                      } else {
                        Navigator.of(context).pop();
                      }
                    },
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: _step == _Step.email ? _emailStep() : _codeStep(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _emailStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 24),
        Text(
          'Adiciona um email verificado para poderes recuperar o PIN caso te esqueças dele.',
          style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
        ),
        const SizedBox(height: 24),
        TextField(
          controller: _emailCtrl,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          autofillHints: const [AutofillHints.email],
          decoration: const InputDecoration(hintText: 'ana@exemplo.ao'),
          onSubmitted: (_) => _sendCode(),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error)),
        ],
        const SizedBox(height: 28),
        BanzamiPrimaryButton(label: 'Enviar código', isLoading: _busy, onPressed: _busy ? null : _sendCode),
      ],
    );
  }

  Widget _codeStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 24),
        Text(
          'Enviámos um código de 6 dígitos para $_email. Introduza-o para confirmar.',
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
        BanzamiPrimaryButton(label: 'Confirmar', isLoading: _busy, onPressed: _busy ? null : _verify),
      ],
    );
  }
}
