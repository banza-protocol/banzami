import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../../widgets/otp_code_field.dart';
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

class _EmailVerifyScreenState extends State<EmailVerifyScreen>
    with WidgetsBindingObserver {
  static const int _codeLength = 6;
  static const int _resendCooldownSecs = 60;

  final _codeCtrl = TextEditingController();
  bool _busy = false;
  bool _resending = false;
  bool _hasError = false;
  String? _error;

  // Countdown is derived from an END TIME, not a decremented counter, so a missed
  // or throttled tick (backgrounded app) never desyncs it: every tick and every
  // resume recomputes the remaining seconds from the clock.
  DateTime? _cooldownEndsAt;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // The previous screen already sent the first code; start the cooldown here.
    _startCooldown(_resendCooldownSecs);
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _codeCtrl.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Re-read the countdown against the clock when coming back to the foreground.
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

  Future<void> _verify() async {
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
      await context.read<ConsumerPublicClient>().requestEmailOtp(email: widget.email);
      if (!mounted) return;
      _codeCtrl.clear();
      BanzamiToast.showSuccess(context, 'Enviámos um novo código.');
      _startCooldown(_resendCooldownSecs);
    } on BanzamiApiException catch (e) {
      if (!mounted) return;
      // The backend is still cooling down: never let the UI look ready to resend.
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

  @override
  Widget build(BuildContext context) {
    final complete = _codeCtrl.text.length == _codeLength;
    final remaining = _remaining;
    final canResend = remaining <= 0 && !_resending;

    final String resendLabel = _resending
        ? 'A reenviar...'
        : remaining > 0
            ? 'Reenviar código em ${_mmss(remaining)}'
            : 'Reenviar código';

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
                      'Enviámos um código de $_codeLength dígitos para ${widget.email}. '
                      'Introduza-o para confirmar o seu email.',
                      style: BanzamiTextStyles.bodyMd
                          .copyWith(color: BanzamiColors.gray400),
                    ),
                    const SizedBox(height: 28),
                    OtpCodeField(
                      controller: _codeCtrl,
                      length: _codeLength,
                      enabled: !_busy,
                      autofocus: true,
                      hasError: _hasError,
                      onChanged: (_) {
                        // Natural correction clears the error state as the person edits.
                        if (_hasError || _error != null) {
                          setState(() {
                            _hasError = false;
                            _error = null;
                          });
                        } else {
                          setState(() {}); // keep the "Verificar" enabled-state in sync
                        }
                      },
                      onCompleted: (_) => _verify(), // auto-confirm on the 6th digit
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        _error!,
                        style: BanzamiTextStyles.bodySm
                            .copyWith(color: BanzamiColors.error),
                      ),
                    ],
                    const SizedBox(height: 28),
                    BanzamiPrimaryButton(
                      label: 'Verificar',
                      isLoading: _busy,
                      onPressed: (complete && !_busy) ? _verify : null,
                    ),
                    const SizedBox(height: 8),
                    BanzamiGhostButton(
                      label: resendLabel,
                      onPressed: canResend ? _resend : null,
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
