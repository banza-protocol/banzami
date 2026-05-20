import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart';

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
  String _pin         = '';
  bool   _error       = false;
  bool   _checking    = false;
  int    _padResetKey = 0;

  int       _failedAttempts = 0;
  DateTime? _lockoutUntil;

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
    if (svc.isTokenExpired) return;

    final client = context.read<ConsumerPublicClient>();
    try {
      await client.checkAuth();
    } on BanzamiApiException catch (e) {
      if (e.statusCode == 401) return;
    } catch (_) {
      // Network error — allow offline biometric unlock
    }

    final ok = await svc.authenticateWithBiometrics();
    if (ok && mounted) svc.unlock();
  }

  bool get _isLockedOut {
    final until = _lockoutUntil;
    return until != null && DateTime.now().isBefore(until);
  }

  Future<void> _onPinComplete() async {
    if (_pin.length < kPinLength || _checking) return;

    if (_isLockedOut) {
      final secs = _lockoutUntil!.difference(DateTime.now()).inSeconds + 1;
      setState(() { _error = true; _pin = ''; _padResetKey += 1; });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Demasiadas tentativas. Tente novamente em $secs segundos.'),
        duration: const Duration(seconds: 3),
      ));
      return;
    }

    setState(() { _checking = true; _error = false; });

    final svc    = context.read<SessionService>();
    final client = context.read<ConsumerPublicClient>();
    final ok     = await svc.verifyPin(_pin);

    if (!mounted) return;
    if (ok) {
      _failedAttempts = 0;
      _lockoutUntil   = null;
      try {
        final result = await client.login(
          handle: svc.session!.handle,
          pin:    _pin,
        );
        await svc.updateToken(result.token);
      } catch (_) {}
      svc.unlock();
    } else {
      _failedAttempts += 1;
      if (_failedAttempts >= 5) {
        _lockoutUntil = DateTime.now().add(const Duration(seconds: 30));
      }
      setState(() {
        _error        = true;
        _checking     = false;
        _pin          = '';
        _padResetKey += 1;
      });
    }
  }

  Future<void> _confirmLogout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Usar outra conta?'),
        content: const Text(
          'Vai sair e apagar todos os dados desta conta neste dispositivo. '
          'Pode entrar novamente quando quiser.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: BanzaColors.error),
            child: const Text('Remover'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await context.read<SessionService>().logout();
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.read<SessionService>().session;

    return Scaffold(
      backgroundColor: BanzaColors.white,
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

                  if (session?.displayName != null)
                    Text(
                      'Olá, ${session!.displayName}',
                      style: BanzaTextStyles.headingMd,
                      textAlign: TextAlign.center,
                    ),
                  const SizedBox(height: 8),
                  Text(
                    _isLockedOut
                        ? 'Conta bloqueada temporariamente.'
                        : _error
                            ? 'PIN incorrecto. Tente novamente.'
                            : 'Introduza o PIN',
                    style: BanzaTextStyles.bodyMd.copyWith(
                      color: _error ? BanzaColors.error : BanzaColors.gray400,
                    ),
                    textAlign: TextAlign.center,
                  ),

                  const SizedBox(height: 40),

                  PinPad(
                    key:       ValueKey(_padResetKey),
                    onChanged: (v) => setState(() { _pin = v; _error = false; }),
                    onComplete: _onPinComplete,
                    disabled:  _checking,
                    error:     _error,
                  ),

                  const SizedBox(height: 24),

                  if (session?.biometricsEnabled == true)
                    TextButton.icon(
                      onPressed: _tryBiometrics,
                      icon:  const Icon(Icons.fingerprint_rounded, color: BanzaColors.wine),
                      label: Text(
                        'Usar biometria',
                        style: BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.wine),
                      ),
                    ),

                  const SizedBox(height: 8),

                  TextButton(
                    onPressed: _confirmLogout,
                    child: Text(
                      'Usar outra conta',
                      style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
                    ),
                  ),

                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
