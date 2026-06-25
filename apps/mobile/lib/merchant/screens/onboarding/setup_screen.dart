import 'package:flutter/material.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../../config.dart';
import '../pin_create_screen.dart';

/// Ecrã de configuração inicial — o comerciante introduz o seu Merchant ID
/// e API Key (obtidos na dashboard web do Banzami em banzami.com).
class MerchantSetupScreen extends StatefulWidget {
  const MerchantSetupScreen({super.key});

  @override
  State<MerchantSetupScreen> createState() => _MerchantSetupScreenState();
}

class _MerchantSetupScreenState extends State<MerchantSetupScreen> {
  final _formKey    = GlobalKey<FormState>();
  final _idCtrl     = TextEditingController();
  final _keyCtrl    = TextEditingController();
  bool  _loading    = false;
  bool  _obscureKey = true;
  String? _error;

  @override
  void dispose() {
    _idCtrl.dispose();
    _keyCtrl.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _loading = true; _error = null; });

    final merchantId = _idCtrl.text.trim();
    final apiKey     = _keyCtrl.text.trim();

    try {
      final client = BanzamiClient(
        baseUrl: AppConfig.gatewayUrl,
        apiKey:  apiKey,
      );
      final merchant = await client.getMerchant(merchantId);

      if (!merchant.isActive) {
        setState(() { _error = 'Esta conta de negócio está suspensa ou encerrada.'; });
        return;
      }

      final wallet = await client.getMerchantWallet();

      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => PinCreateScreen(
            isSetup:       true,
            merchantId:    merchant.id,
            merchantName:  merchant.name,
            merchantEmail: merchant.email,
            walletId:      wallet.id,
            apiKey:        apiKey,
            verified:      merchant.verified,
          ),
        ),
      );
    } on BanzamiApiException catch (e) {
      setState(() {
        _error = e.statusCode == 404
            ? 'Merchant ID não encontrado. Verifique e tente novamente.'
            : 'Credenciais inválidas. Verifique a sua API Key.';
      });
    } on BanzamiNetworkException {
      setState(() { _error = 'Sem ligação. Verifique a sua rede.'; });
    } catch (_) {
      setState(() { _error = 'Ocorreu um erro inesperado. Tente novamente.'; });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return BanzamiScaffold(
      appBar: const BanzamiAppBar(title: 'Configurar conta'),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(BanzamiSpacing.xl),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: BanzamiSpacing.sm),
              const Text('Credenciais da sua conta', style: BanzamiTextStyles.displayMd),
              const SizedBox(height: BanzamiSpacing.sm),
              Text(
                'Conecte a sua conta de negócio Banzami para começar a receber pagamentos.',
                style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
              ),
              const SizedBox(height: BanzamiSpacing.xl),

              TextFormField(
                controller:        _idCtrl,
                decoration: const InputDecoration(
                  labelText:  'Merchant ID',
                  hintText:   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
                  prefixIcon: Icon(Icons.storefront_outlined),
                ),
                autocorrect:       false,
                enableSuggestions: false,
                validator: (v) => (v == null || v.trim().isEmpty)
                    ? 'Introduza o Merchant ID'
                    : null,
              ),
              const SizedBox(height: BanzamiSpacing.lg),

              TextFormField(
                controller:  _keyCtrl,
                obscureText: _obscureKey,
                decoration: InputDecoration(
                  labelText:  'API Key',
                  hintText:   'bz_live_...',
                  prefixIcon: const Icon(Icons.key_outlined),
                  suffixIcon: IconButton(
                    icon: Icon(_obscureKey
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined),
                    onPressed: () => setState(() => _obscureKey = !_obscureKey),
                  ),
                ),
                autocorrect:       false,
                enableSuggestions: false,
                validator: (v) => (v == null || v.trim().isEmpty)
                    ? 'Introduza a API Key'
                    : null,
              ),

              const SizedBox(height: BanzamiSpacing.lg),
              BanzamiCard(
                color:   BanzamiColors.gray100,
                shadow:  const [],
                padding: const EdgeInsets.all(BanzamiSpacing.lg),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Icon(Icons.info_outline_rounded, size: 18, color: BanzamiColors.gray400),
                  const SizedBox(width: BanzamiSpacing.sm),
                  Expanded(child: Text(
                    'Encontra estas credenciais no painel web do Banzami (banzami.com), '
                    'em Definições → API Keys.',
                    style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray600),
                  )),
                ]),
              ),

              if (_error != null) ...[
                const SizedBox(height: BanzamiSpacing.lg),
                BanzamiErrorBanner(message: _error!),
              ],

              const SizedBox(height: BanzamiSpacing.xxl),

              BanzamiPrimaryButton(
                label:     'Verificar e continuar',
                isLoading: _loading,
                onPressed: _loading ? null : _verify,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
