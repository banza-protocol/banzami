import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart';

import '../../branding_assets.dart';
import '../../services/session_service.dart';
import '../../widgets/pin_pad.dart';
import '../main_screen.dart';

enum _LoginStep { handle, pin }

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
    } catch (_) {
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
        consumerId:        result.consumer.id,
        walletId:          result.walletId,
        handle:            handle,
        displayName:       result.consumer.displayName,
        pin:               _pin,
        token:             result.token,
        verificationBadge: badge,
      );
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        PageRouteBuilder(
          pageBuilder:              (_, __, ___) => const MainScreen(),
          transitionDuration:        Duration.zero,
          reverseTransitionDuration: Duration.zero,
        ),
        (_) => false,
      );
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
      backgroundColor: BanzaColors.offWhite,
      appBar: const BanzaAppBar(title: 'Entrar'),
      body: SafeArea(
        child: _step == _LoginStep.handle ? _buildHandleStep() : _buildPinStep(),
      ),
    );
  }

  Widget _buildHandleStep() {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 40),

            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Image.asset(
                BrandingAssets.icon,
                height: 48,
                width:  48,
                fit:    BoxFit.cover,
              ),
            ),
            const SizedBox(height: 20),

            const Text('O seu @banza', style: BanzaTextStyles.displayMd),
            const SizedBox(height: 8),
            Text(
              'É o nome único que usa para receber pagamentos.',
              style: BanzaTextStyles.bodyMd.copyWith(
                color:  BanzaColors.gray400,
                height: 1.5,
              ),
            ),

            const SizedBox(height: 32),

            if (_error != null) ...[
              BanzaErrorBanner(message: _error!),
              const SizedBox(height: 16),
            ],

            TextFormField(
              controller:      _handleCtrl,
              decoration:      _fieldDecoration(hint: 'joaosilva', prefix: '@'),
              style:           BanzaTextStyles.bodyLg.copyWith(color: BanzaColors.black),
              cursorColor:     BanzaColors.wine,
              keyboardType:    TextInputType.visiblePassword,
              textInputAction: TextInputAction.done,
              autocorrect:     false,
              onFieldSubmitted: (_) => _continueToPin(),
              validator: (v) {
                if ((v?.trim() ?? '').isEmpty) return 'O @banza é obrigatório';
                return null;
              },
            ),

            const SizedBox(height: 28),

            BanzaPrimaryButton(
              label:     'Continuar',
              isLoading: _loading,
              onPressed: _loading ? null : _continueToPin,
            ),

            const SizedBox(height: 32),
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

  InputDecoration _fieldDecoration({required String hint, String? prefix}) =>
      InputDecoration(
        hintText:       hint,
        prefixText:     prefix,
        filled:         true,
        fillColor:      BanzaColors.gray100,
        contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
        border: const OutlineInputBorder(
          borderRadius: BanzaRadius.fieldAll,
          borderSide:   BorderSide.none,
        ),
        enabledBorder: const OutlineInputBorder(
          borderRadius: BanzaRadius.fieldAll,
          borderSide:   BorderSide.none,
        ),
        focusedBorder: const OutlineInputBorder(
          borderRadius: BanzaRadius.fieldAll,
          borderSide:   BorderSide(color: BanzaColors.wine, width: 1.5),
        ),
        errorBorder: const OutlineInputBorder(
          borderRadius: BanzaRadius.fieldAll,
          borderSide:   BorderSide(color: BanzaColors.error, width: 1.5),
        ),
        focusedErrorBorder: const OutlineInputBorder(
          borderRadius: BanzaRadius.fieldAll,
          borderSide:   BorderSide(color: BanzaColors.error, width: 1.5),
        ),
        hintStyle:  BanzaTextStyles.bodyLg.copyWith(color: BanzaColors.gray400),
        errorStyle: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.error),
      );
}
