import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../widgets/pin_pad.dart';

/// Authenticated "Alterar PIN": current PIN → new PIN → confirm, then a
/// server-side change (POST /v1/me/pin). The server re-verifies the current PIN,
/// revokes other sessions and re-mints this one, so the app stays signed in.
/// Reached from Profile > PIN & Segurança.
enum _Step { current, next, confirm }

class ChangePinScreen extends StatefulWidget {
  const ChangePinScreen({super.key});

  @override
  State<ChangePinScreen> createState() => _ChangePinScreenState();
}

class _ChangePinScreenState extends State<ChangePinScreen> {
  _Step _step = _Step.current;
  String _currentPin = '';
  String _newPin = '';
  String _entry = '';
  bool _busy = false;
  bool _error = false;
  String? _apiError;

  String get _title {
    switch (_step) {
      case _Step.current:
        return 'PIN atual';
      case _Step.next:
        return 'Novo PIN';
      case _Step.confirm:
        return 'Confirme o novo PIN';
    }
  }

  String get _subtitle {
    if (_apiError != null) return _apiError!;
    if (_error) return 'Os PINs não coincidem. Tente novamente.';
    switch (_step) {
      case _Step.current:
        return 'Introduza o seu PIN atual para continuar';
      case _Step.next:
        return 'Escolha um novo PIN';
      case _Step.confirm:
        return 'Introduza novamente o novo PIN';
    }
  }

  void _onChanged(String pin) => setState(() {
        _entry = pin;
        _error = false;
        _apiError = null;
      });

  void _onComplete() {
    switch (_step) {
      case _Step.current:
        setState(() {
          _currentPin = _entry;
          _entry = '';
          _step = _Step.next;
        });
        return;
      case _Step.next:
        setState(() {
          _newPin = _entry;
          _entry = '';
          _step = _Step.confirm;
        });
        return;
      case _Step.confirm:
        if (_entry == _newPin) {
          _submit();
        } else {
          setState(() {
            _error = true;
            _entry = '';
            _newPin = '';
            _step = _Step.next;
          });
        }
    }
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    final client = context.read<ConsumerPublicClient>();
    try {
      await client.changePin(currentPin: _currentPin, newPin: _newPin);
      if (!mounted) return;
      BanzamiToast.showSuccess(context, 'PIN alterado.');
      Navigator.of(context).pop();
    } on BanzamiApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _entry = '';
        _newPin = '';
        if (e.statusCode == 403) {
          // Wrong current PIN — start over at the current-PIN step.
          _step = _Step.current;
          _currentPin = '';
          _apiError = 'PIN atual incorreto. Tente novamente.';
        } else {
          _step = _Step.current;
          _currentPin = '';
          _apiError = 'Não foi possível alterar o PIN. Tente novamente.';
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _entry = '';
        _newPin = '';
        _step = _Step.current;
        _currentPin = '';
        _apiError = 'Não foi possível alterar o PIN. Tente novamente.';
      });
    }
  }

  void _back() {
    if (_step == _Step.next) {
      setState(() {
        _step = _Step.current;
        _entry = '';
        _currentPin = '';
      });
    } else if (_step == _Step.confirm) {
      setState(() {
        _step = _Step.next;
        _entry = '';
        _newPin = '';
      });
    } else {
      Navigator.of(context).pop();
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
                          _subtitle,
                          style: BanzamiTextStyles.bodyMd.copyWith(
                            color: (_error || _apiError != null)
                                ? BanzamiColors.error
                                : BanzamiColors.gray400,
                          ),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 40),
                        if (_busy)
                          const CircularProgressIndicator(color: BanzamiColors.primary)
                        else
                          PinPad(
                            key: ValueKey(_step),
                            onChanged: _onChanged,
                            onComplete: _onComplete,
                          ),
                        const SizedBox(height: 48),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
