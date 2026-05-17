import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

import '../../services/session_service.dart';
import '../../widgets/pin_pad.dart';

enum _LoginStep { handle, pin }

/// Login screen for returning consumers — enter @handle then PIN.
///
/// Calls POST /v1/auth/token on the public-api. On success fetches the
/// consumer profile and wallet, stores everything in [SessionService].
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  _LoginStep _step = _LoginStep.handle;

  final _handleCtrl = TextEditingController();
  final _formKey    = GlobalKey<FormState>();

  String  _pin      = '';
  bool    _loading  = false;
  String? _error;

  @override
  void dispose() {
    _handleCtrl.dispose();
    super.dispose();
  }

  Future<void> _continueToPin() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _loading = true; _error = null; });

    final handle = _handleCtrl.text.trim().toLowerCase();
    final client = context.read<ConsumerPublicClient>();

    try {
      final exists = await client.handleExists(handle);
      if (!mounted) return;
      if (!exists) {
        setState(() {
          _error   = '@$handle não está registado.';
          _loading = false;
        });
        return;
      }
      setState(() { _step = _LoginStep.pin; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error   = 'Erro de ligação. Verifique a internet e tente novamente.';
        _loading = false;
      });
    }
  }

  Future<void> _login() async {
    if (_pin.length < kPinLength || _loading) return;
    setState(() { _loading = true; _error = null; });

    final handle = _handleCtrl.text.trim().toLowerCase();
    final client = context.read<ConsumerPublicClient>();
    final svc    = context.read<SessionService>();

    try {
      final result = await client.login(handle: handle, pin: _pin);

      await svc.createSession(
        consumerId:  result.consumer.id,
        walletId:    result.walletId,
        handle:      handle,
        displayName: result.consumer.displayName,
        pin:         _pin,
        token:       result.token,
      );
      if (!mounted) return;
      Navigator.of(context).popUntil((route) => route.isFirst);
    } on BanzamiApiException catch (e) {
      setState(() {
        _error   = e.code == 'INVALID_CREDENTIALS'
            ? '@banza ou PIN incorrecto.'
            : e.message;
        _loading = false;
        _pin     = '';
      });
    } catch (_) {
      setState(() {
        _error   = 'Erro de ligação. Verifique a internet e tente novamente.';
        _loading = false;
        _pin     = '';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.white,
      appBar: AppBar(
        backgroundColor: BanzamiColors.white,
        foregroundColor: BanzamiColors.gray900,
        elevation:       0,
        title:           const Text('Entrar', style: BanzamiTextStyles.headingSm),
      ),
      body: SafeArea(
        child: _step == _LoginStep.handle ? _buildHandleStep() : _buildPinStep(),
      ),
    );
  }

  Widget _buildHandleStep() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: BanzamiSpacing.md),
            const Text('O seu @banza', style: BanzamiTextStyles.headingMd),
            const SizedBox(height: BanzamiSpacing.xs),
            Text(
              'É o nome único que usa para receber pagamentos.',
              style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
            ),
            const SizedBox(height: BanzamiSpacing.xl),
            if (_error != null) ...[
              Text(
                _error!,
                style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.error),
              ),
              const SizedBox(height: BanzamiSpacing.sm),
            ],
            TextFormField(
              controller:      _handleCtrl,
              decoration:      const InputDecoration(
                labelText:  '@banza',
                prefixText: '@',
                hintText:   'joaosilva',
              ),
              keyboardType:    TextInputType.visiblePassword,
              textInputAction: TextInputAction.done,
              autocorrect:     false,
              onFieldSubmitted: (_) => _continueToPin(),
              validator: (v) {
                final val = v?.trim() ?? '';
                if (val.isEmpty) return 'O @banza é obrigatório';
                return null;
              },
            ),
            const SizedBox(height: BanzamiSpacing.xxl),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _loading ? null : _continueToPin,
                style: ElevatedButton.styleFrom(
                  backgroundColor: BanzamiColors.wine,
                  foregroundColor: BanzamiColors.white,
                  padding:         const EdgeInsets.symmetric(vertical: 16),
                  shape:           RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                  textStyle: BanzamiTextStyles.headingSm,
                ),
                child: const Text('Continuar'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPinStep() {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const SizedBox(height: 24),
              const Text('Introduza o PIN', style: BanzamiTextStyles.headingLg),
              const SizedBox(height: 8),
              Text(
                _error ?? '@${_handleCtrl.text.trim().toLowerCase()}',
                style: BanzamiTextStyles.bodyMd.copyWith(
                  color: _error != null ? BanzamiColors.error : BanzamiColors.gray400,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 40),
              if (_loading)
                const CircularProgressIndicator(color: BanzamiColors.wine)
              else
                PinPad(
                  onChanged:  (v) => setState(() { _pin = v; _error = null; }),
                  onComplete: _login,
                ),
              const SizedBox(height: 48),
            ],
          ),
        ),
      ),
    );
  }
}
