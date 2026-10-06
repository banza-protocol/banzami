import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../../widgets/pin_pad.dart';
import '../../widgets/otp_code_field.dart';

/// "Esqueci o PIN" — unauthenticated PIN recovery.
///
/// @handle → a code is emailed to the account's verified email → confirm the
/// code → set a new PIN. The request step is deliberately non-committal
/// ("if eligible, we sent a code") so it never reveals whether an account
/// exists or has an email. A successful reset revokes every session server-side,
/// so the person signs in again with the new PIN.
///
/// The code step uses the SAME segmented OtpCodeField + resend countdown as
/// account creation (email_verify_screen), so recovery and signup share one
/// verification experience.
enum _Step { handle, code, newPin, confirmPin }

class ForgotPinScreen extends StatefulWidget {
  final String? initialHandle;
  const ForgotPinScreen({super.key, this.initialHandle});

  @override
  State<ForgotPinScreen> createState() => _ForgotPinScreenState();
}

class _ForgotPinScreenState extends State<ForgotPinScreen> with WidgetsBindingObserver {
  static const int _codeLength = 6;
  static const int _resendCooldownSecs = 60;

  _Step _step = _Step.handle;
  final _handleCtrl = TextEditingController();
  final _codeCtrl = TextEditingController();
  String _handle = '';
  String _resetToken = '';
  String _newPin = '';
  String _entry = '';
  bool _busy = false;
  bool _resending = false;
  bool _pinMismatch = false;
  bool _hasError = false;
  String? _error;

  // Resend cooldown, clock-derived so a background/foreground round-trip resumes
  // the correct remaining time (never the full window again).
  DateTime? _cooldownEndsAt;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (widget.initialHandle != null) {
      _handleCtrl.text = widget.initialHandle!;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _handleCtrl.dispose();
    _codeCtrl.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) setState(() {});
  }

  int get _remaining {
    final end = _cooldownEndsAt;
    if (end == null) return 0;
    final left = end.difference(DateTime.now()).inSeconds;
    return left > 0 ? left : 0;
  }

  void _startCooldown(int seconds) {
    _timer?.cancel();
    _cooldownEndsAt = DateTime.now().add(Duration(seconds: seconds));
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      if (_remaining <= 0) t.cancel();
      setState(() {});
    });
    setState(() {});
  }

  String _mmss(int totalSeconds) {
    final m = (totalSeconds ~/ 60).toString().padLeft(2, '0');
    final s = (totalSeconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  String get _title {
    switch (_step) {
      case _Step.handle:
        return 'Esqueci o PIN';
      case _Step.code:
        return 'Código de verificação';
      case _Step.newPin:
        return 'Novo PIN';
      case _Step.confirmPin:
        return 'Confirme o novo PIN';
    }
  }

  ConsumerPublicClient get _client => context.read<ConsumerPublicClient>();

  Future<void> _submitHandle() async {
    final h = _handleCtrl.text.trim().replaceAll('@', '').toLowerCase();
    if (h.isEmpty) {
      setState(() => _error = 'Introduza o seu @banza.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _handle = h;
    });
    try {
      // Anti-enumeration: this never tells us whether a code was really sent.
      await _client.requestPinReset(handle: h);
    } catch (_) {
      // Even a transport error should not reveal account existence — proceed to
      // the code step regardless; a wrong/absent code simply will not verify.
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _step = _Step.code;
      _hasError = false;
      _codeCtrl.clear();
    });
    _startCooldown(_resendCooldownSecs);
  }

  Future<void> _submitCode() async {
    if (_busy) return; // dedup: one verification in flight at a time
    final code = _codeCtrl.text.trim();
    if (code.length != _codeLength) {
      setState(() => _error = 'Introduza o código de $_codeLength dígitos.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _hasError = false;
    });
    try {
      final token = await _client.verifyPinReset(handle: _handle, code: code);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _resetToken = token;
        _step = _Step.newPin;
      });
    } catch (_) {
      if (!mounted) return;
      // Keep the digits visible so the person can fix them or ask for a new code.
      setState(() {
        _busy = false;
        _hasError = true;
        _error = 'Código inválido ou expirado. Verifique ou peça um novo.';
      });
    }
  }

  Future<void> _resend() async {
    if (_resending || _remaining > 0) return; // dedup + respect the cooldown
    setState(() {
      _resending = true;
      _error = null;
      _hasError = false;
    });
    try {
      await _client.requestPinReset(handle: _handle);
      if (!mounted) return;
      _codeCtrl.clear();
      BanzamiToast.showSuccess(context, 'Enviámos um novo código.');
      _startCooldown(_resendCooldownSecs);
    } on BanzamiApiException catch (e) {
      if (!mounted) return;
      if (e.statusCode == 429) {
        BanzamiToast.showWarning(context, 'Aguarde para reenviar o código.');
        _startCooldown(_resendCooldownSecs);
      } else {
        BanzamiToast.showWarning(context, 'Não foi possível reenviar o código.');
      }
    } catch (_) {
      if (mounted) {
        BanzamiToast.showWarning(context, 'Não foi possível reenviar o código.');
      }
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  void _onPinChanged(String pin) => setState(() {
        _entry = pin;
        _pinMismatch = false;
      });

  void _onPinComplete() {
    if (_step == _Step.newPin) {
      setState(() {
        _newPin = _entry;
        _entry = '';
        _step = _Step.confirmPin;
      });
      return;
    }
    if (_entry == _newPin) {
      _submitNewPin();
    } else {
      setState(() {
        _pinMismatch = true;
        _entry = '';
        _newPin = '';
        _step = _Step.newPin;
      });
    }
  }

  Future<void> _submitNewPin() async {
    setState(() => _busy = true);
    try {
      await _client.confirmPinReset(resetToken: _resetToken, newPin: _newPin);
      if (!mounted) return;
      BanzamiToast.showSuccess(context, 'PIN redefinido. Inicie sessão com o novo PIN.');
      Navigator.of(context).pop();
    } catch (_) {
      if (!mounted) return;
      // The reset authorization expired or the account is not eligible. Send the
      // person back to the start of the flow.
      setState(() {
        _busy = false;
        _step = _Step.handle;
        _newPin = '';
        _entry = '';
        _resetToken = '';
        _error = 'Não foi possível redefinir o PIN. Comece novamente.';
      });
    }
  }

  void _back() {
    switch (_step) {
      case _Step.handle:
        Navigator.of(context).pop();
        break;
      case _Step.code:
        _timer?.cancel();
        setState(() {
          _step = _Step.handle;
          _hasError = false;
          _error = null;
        });
        break;
      case _Step.newPin:
        setState(() => _step = _Step.code);
        break;
      case _Step.confirmPin:
        setState(() {
          _step = _Step.newPin;
          _newPin = '';
          _entry = '';
        });
        break;
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
            AppScreenHeader(title: _title, onBack: _busy ? null : _back),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: (_busy && _step != _Step.code)
                    ? const Padding(
                        padding: EdgeInsets.only(top: 80),
                        child: Center(
                          child: CircularProgressIndicator(color: BanzamiColors.primary),
                        ),
                      )
                    : _body(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    switch (_step) {
      case _Step.handle:
        return _handleStep();
      case _Step.code:
        return _codeStep();
      case _Step.newPin:
      case _Step.confirmPin:
        return _pinStep();
    }
  }

  Widget _handleStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 24),
        Text(
          'Introduza o seu @banza. Se a conta tiver um email verificado, enviamos um código para o redefinir.',
          style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
        ),
        const SizedBox(height: 24),
        TextField(
          controller: _handleCtrl,
          autocorrect: false,
          enableSuggestions: false,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _submitHandle(),
          decoration: const InputDecoration(prefixText: '@', hintText: 'ana'),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error)),
        ],
        const SizedBox(height: 32),
        BanzamiPrimaryButton(label: 'Enviar código', onPressed: _submitHandle),
      ],
    );
  }

  Widget _codeStep() {
    final complete = _codeCtrl.text.length == _codeLength;
    final remaining = _remaining;
    final canResend = remaining <= 0 && !_resending;
    final String resendLabel = _resending
        ? 'A reenviar...'
        : remaining > 0
            ? 'Reenviar código em ${_mmss(remaining)}'
            : 'Reenviar código';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 24),
        Text(
          'Se os dados corresponderem a uma conta elegível, enviámos um código de $_codeLength dígitos para o email associado. Introduza-o abaixo.',
          style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
        ),
        const SizedBox(height: 28),
        OtpCodeField(
          controller: _codeCtrl,
          length: _codeLength,
          enabled: !_busy,
          autofocus: true,
          hasError: _hasError,
          onChanged: (_) {
            if (_hasError || _error != null) {
              setState(() {
                _hasError = false;
                _error = null;
              });
            } else {
              setState(() {}); // keep "Verificar" enabled-state in sync
            }
          },
          onCompleted: (_) => _submitCode(), // auto-confirm on the 6th digit
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error)),
        ],
        const SizedBox(height: 28),
        BanzamiPrimaryButton(
          label: 'Verificar',
          isLoading: _busy,
          onPressed: (complete && !_busy) ? _submitCode : null,
        ),
        const SizedBox(height: 8),
        BanzamiGhostButton(
          label: resendLabel,
          onPressed: canResend ? _resend : null,
        ),
      ],
    );
  }

  Widget _pinStep() {
    return Column(
      children: [
        const SizedBox(height: 24),
        Text(
          _pinMismatch
              ? 'Os PINs não coincidem. Tente novamente.'
              : (_step == _Step.newPin ? 'Escolha um novo PIN' : 'Introduza novamente o novo PIN'),
          style: BanzamiTextStyles.bodyMd.copyWith(
            color: _pinMismatch ? BanzamiColors.error : BanzamiColors.gray400,
          ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 40),
        PinPad(
          key: ValueKey(_step),
          onChanged: _onPinChanged,
          onComplete: _onPinComplete,
        ),
        const SizedBox(height: 48),
      ],
    );
  }
}
