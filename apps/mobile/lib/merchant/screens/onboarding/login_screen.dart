import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../../../branding_assets.dart';
import '../../../widgets/pin_pad.dart';
import '../../services/merchant_session_service.dart';
import 'setup_screen.dart';

enum _Step { handle, pin }

/// Primary Banzami Business login: @business handle + PIN.
///
/// Step 1 collects the handle (with or without '@', normalised to lowercase).
/// Step 2 collects the PIN and exchanges handle+PIN for a merchant JWT
/// (BanzamiClient.loginMerchantHandlePin), then builds a unified handle session.
/// The legacy Merchant ID + API Key flow remains available as "credenciais de
/// integração".
class MerchantLoginScreen extends StatefulWidget {
  const MerchantLoginScreen({super.key});

  @override
  State<MerchantLoginScreen> createState() => _MerchantLoginScreenState();
}

class _MerchantLoginScreenState extends State<MerchantLoginScreen> {
  _Step _step = _Step.handle;

  final _handleCtrl = TextEditingController();
  final _formKey    = GlobalKey<FormState>();

  String  _pin     = '';
  bool    _loading = false;
  String? _error;

  // 3-30 chars, lowercase, starts/ends alphanumeric, underscore allowed.
  static final _handleRe = RegExp(r'^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$');

  @override
  void dispose() {
    _handleCtrl.dispose();
    super.dispose();
  }

  /// Normalised handle: lowercase, leading '@' stripped.
  String get _handle =>
      _handleCtrl.text.trim().toLowerCase().replaceFirst(RegExp(r'^@'), '');

  Future<void> _continueToPin() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _loading = true; _error = null; });

    final handle = _handle;
    try {
      // Only prompt for a PIN if the business account exists and can sign in.
      final r = await context.read<BanzamiClient>().lookupMerchantHandle(handle);
      if (!mounted) return;
      if (!r.exists) {
        // If the account lives in the other environment, say so explicitly rather
        // than a misleading "não encontrada" (ADR-025).
        setState(() { _error = _notFoundMessage(r.otherEnvironment); _loading = false; });
        return;
      }
      if (!r.canLogin) {
        setState(() { _error = _statusMessage(r.status); _loading = false; });
        return;
      }
      setState(() { _step = _Step.pin; _loading = false; _pin = ''; });
    } on BanzamiNetworkException {
      if (mounted) setState(() { _error = 'Não foi possível conectar. Tente novamente.'; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _error = 'Não foi possível conectar. Tente novamente.'; _loading = false; });
    }
  }

  // When the handle isn't in this app's environment, name where it lives (if the
  // gateway could tell us) instead of a flat "não encontrada" (ADR-025).
  static String _notFoundMessage(String? otherEnvironment) {
    switch (otherEnvironment) {
      case 'LIVE':
        return 'Esta conta pertence ao ambiente de produção (LIVE).';
      case 'SANDBOX':
        return 'Esta conta pertence ao ambiente de testes (SANDBOX).';
      default:
        return 'Conta Business não encontrada.';
    }
  }

  static String _statusMessage(String status) {
    switch (status) {
      case 'PENDING':  return 'A sua conta Business ainda está em análise.';
      case 'REJECTED': return 'Esta conta Business não foi aprovada.';
      case 'SUSPENDED':
      case 'CLOSED':   return 'Esta conta Business está suspensa.';
      default:         return 'Não é possível entrar nesta conta Business.';
    }
  }

  Future<void> _login() async {
    if (_pin.length < kPinLength || _loading) return;
    setState(() { _loading = true; _error = null; });

    final handle = _handle;
    final client = context.read<BanzamiClient>();
    final svc    = context.read<MerchantSessionService>();

    try {
      final auth = await client.loginMerchantHandlePin(handle: handle, pin: _pin);
      final merchantId = _claimFromJwt(auth.token, 'merchant_id');
      if (merchantId == null) throw const FormatException('missing merchant_id');

      client.setJwt(auth.token, expiresAt: auth.expiresAt);
      final merchant = await client.getMerchant(merchantId);
      final wallet   = await client.getMerchantWallet();

      await svc.createHandleSession(
        merchantId:    merchant.id,
        merchantName:  merchant.name,
        merchantEmail: merchant.email,
        walletId:      wallet.id,
        jwt:           auth.token,
        jwtExpiresAt:  auth.expiresAt,
        handle:        handle,
        environment:   auth.environment,
        pin:           _pin,
        verified:      merchant.verified,
      );
      if (!mounted) return;
      Navigator.of(context).popUntil((r) => r.isFirst);
    } on BanzamiApiException catch (e) {
      setState(() {
        _loading = false;
        _pin     = '';
        _error   = e.statusCode == 429
            ? 'Conta temporariamente bloqueada. Tente novamente mais tarde.'
            : 'PIN incorreto.';
      });
    } on BanzamiNetworkException {
      setState(() {
        _loading = false; _pin = '';
        _error   = 'Não foi possível conectar. Tente novamente.';
      });
    } catch (_) {
      setState(() {
        _loading = false; _pin = '';
        _error   = 'Não foi possível conectar. Tente novamente.';
      });
    }
  }

  /// Reads a string claim from a JWT payload without verifying the signature
  /// (the token comes from our own backend; this is only to extract merchant_id).
  static String? _claimFromJwt(String jwt, String key) {
    final parts = jwt.split('.');
    if (parts.length != 3) return null;
    try {
      var p = parts[1].replaceAll('-', '+').replaceAll('_', '/');
      while (p.length % 4 != 0) {
        p += '=';
      }
      final map = jsonDecode(utf8.decode(base64.decode(p))) as Map<String, dynamic>;
      final v = map[key];
      return v is String ? v : null;
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return BanzamiScaffold(
      appBar: BanzamiAppBar(
        title:  'Entrar',
        onBack: _step == _Step.pin
            ? () => setState(() { _step = _Step.handle; _error = null; })
            : null,
      ),
      body: SafeArea(
        child: _step == _Step.handle ? _buildHandleStep() : _buildPinStep(),
      ),
    );
  }

  Widget _buildHandleStep() {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.xl),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: BanzamiSpacing.xxl),
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Image.asset(BrandingAssets.businessIcon, height: 48, width: 48, fit: BoxFit.cover),
            ),
            const SizedBox(height: BanzamiSpacing.lg),
            const Text('Entrar na sua conta Business', style: BanzamiTextStyles.displayMd),
            const SizedBox(height: BanzamiSpacing.sm),
            Text(
              'Use o identificador do seu negócio para entrar.',
              style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400, height: 1.5),
            ),
            const SizedBox(height: BanzamiSpacing.xl),

            if (_error != null) ...[
              BanzamiErrorBanner(message: _error!),
              const SizedBox(height: BanzamiSpacing.lg),
            ],

            TextFormField(
              controller:       _handleCtrl,
              decoration:       _fieldDecoration(hint: 'cantina_alex', prefix: '@'),
              style:            BanzamiTextStyles.bodyLg.copyWith(color: BanzamiColors.black),
              cursorColor:      BanzamiColors.primary,
              keyboardType:     TextInputType.visiblePassword,
              textInputAction:  TextInputAction.done,
              autocorrect:      false,
              onFieldSubmitted: (_) => _continueToPin(),
              validator: (v) {
                final h = (v ?? '').trim().toLowerCase().replaceFirst(RegExp(r'^@'), '');
                if (h.isEmpty || !_handleRe.hasMatch(h)) return '@banza inválido.';
                return null;
              },
            ),

            const SizedBox(height: BanzamiSpacing.xl),
            BanzamiPrimaryButton(
              label:     'Continuar',
              isLoading: _loading,
              onPressed: _loading ? null : _continueToPin,
            ),

            const SizedBox(height: BanzamiSpacing.md),
            BanzamiGhostButton(
              label:     'Entrar com credenciais de integração',
              color:     BanzamiColors.gray600,
              onPressed: () => Navigator.of(context).push(
                BanzamiPageRoute(page: const MerchantSetupScreen()),
              ),
            ),
            const SizedBox(height: BanzamiSpacing.xxl),
          ],
        ),
      ),
    );
  }

  Widget _buildPinStep() {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.xxl),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const SizedBox(height: BanzamiSpacing.xl),
              const Text('Digite o PIN Business', style: BanzamiTextStyles.headingLg),
              const SizedBox(height: BanzamiSpacing.sm),
              Text(
                _error ?? '@$_handle',
                style: BanzamiTextStyles.bodyMd.copyWith(
                  color: _error != null ? BanzamiColors.error : BanzamiColors.gray400,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: BanzamiSpacing.xxl + 8),
              if (_loading)
                const CircularProgressIndicator(color: BanzamiColors.primary)
              else
                PinPad(
                  onChanged:  (v) => setState(() { _pin = v; _error = null; }),
                  onComplete: _login,
                ),
              const SizedBox(height: BanzamiSpacing.section),
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
        fillColor:      BanzamiColors.gray100,
        contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
        border: const OutlineInputBorder(
          borderRadius: BanzamiRadius.fieldAll, borderSide: BorderSide.none,
        ),
        enabledBorder: const OutlineInputBorder(
          borderRadius: BanzamiRadius.fieldAll, borderSide: BorderSide.none,
        ),
        focusedBorder: const OutlineInputBorder(
          borderRadius: BanzamiRadius.fieldAll,
          borderSide:   BorderSide(color: BanzamiColors.primary, width: 1.5),
        ),
        errorBorder: const OutlineInputBorder(
          borderRadius: BanzamiRadius.fieldAll,
          borderSide:   BorderSide(color: BanzamiColors.error, width: 1.5),
        ),
        focusedErrorBorder: const OutlineInputBorder(
          borderRadius: BanzamiRadius.fieldAll,
          borderSide:   BorderSide(color: BanzamiColors.error, width: 1.5),
        ),
        hintStyle:  BanzamiTextStyles.bodyLg.copyWith(color: BanzamiColors.gray400),
        errorStyle: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error),
      );
}
