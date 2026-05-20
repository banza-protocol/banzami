import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart';

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

      final badgeStr = result.consumer.verificationBadge;
      final badge = badgeStr == 'CONSUMER' ? VerificationBadgeType.consumer
                  : badgeStr == 'MERCHANT' ? VerificationBadgeType.merchant
                  : null;
      await svc.createSession(
        consumerId:         result.consumer.id,
        walletId:           result.walletId,
        handle:             handle,
        displayName:        result.consumer.displayName,
        pin:                _pin,
        token:              result.token,
        verificationBadge:  badge,
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
      backgroundColor: BanzaColors.white,
      appBar: AppBar(
        backgroundColor: BanzaColors.white,
        foregroundColor: BanzaColors.gray900,
        elevation:       0,
        title:           const Text('Entrar', style: BanzaTextStyles.headingSm),
      ),
      body: SafeArea(
        child: _step == _LoginStep.handle ? _buildHandleStep() : _buildPinStep(),
      ),
    );
  }

  Widget _buildHandleStep() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(BanzaSpacing.xl),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: BanzaSpacing.md),
            const Text('O seu @banza', style: BanzaTextStyles.headingMd),
            const SizedBox(height: BanzaSpacing.xs),
            Text(
              'É o nome único que usa para receber pagamentos.',
              style: BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray400),
            ),
            const SizedBox(height: BanzaSpacing.xl),
            if (_error != null) ...[
              Text(
                _error!,
                style: BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.error),
              ),
              const SizedBox(height: BanzaSpacing.sm),
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
            const SizedBox(height: BanzaSpacing.xxl),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _loading ? null : _continueToPin,
                style: ElevatedButton.styleFrom(
                  backgroundColor: BanzaColors.wine,
                  foregroundColor: BanzaColors.white,
                  padding:         const EdgeInsets.symmetric(vertical: 16),
                  shape:           RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                  textStyle: BanzaTextStyles.headingSm,
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
              const Text('Introduza o PIN', style: BanzaTextStyles.headingLg),
              const SizedBox(height: 8),
              Text(
                _error ?? '@${_handleCtrl.text.trim().toLowerCase()}',
                style: BanzaTextStyles.bodyMd.copyWith(
                  color: _error != null ? BanzaColors.error : BanzaColors.gray400,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 40),
              if (_loading)
                const CircularProgressIndicator(color: BanzaColors.wine)
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
