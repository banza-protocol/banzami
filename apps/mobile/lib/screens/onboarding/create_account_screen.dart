import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

import 'setup_pin_screen.dart';

/// Step 1 of onboarding: choose a @handle and display name, then call the API
/// to create the consumer + consumer wallet.
class CreateAccountScreen extends StatefulWidget {
  const CreateAccountScreen({super.key});

  @override
  State<CreateAccountScreen> createState() => _CreateAccountScreenState();
}

class _CreateAccountScreenState extends State<CreateAccountScreen> {
  final _handleCtrl = TextEditingController();
  final _nameCtrl   = TextEditingController();
  final _formKey    = GlobalKey<FormState>();

  bool    _loading = false;
  String? _apiError;

  @override
  void dispose() {
    _handleCtrl.dispose();
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _continue() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _loading = true; _apiError = null; });

    final client = context.read<BanzamiClient>();
    final handle = _handleCtrl.text.trim().toLowerCase();
    final name   = _nameCtrl.text.trim().isEmpty ? null : _nameCtrl.text.trim();

    try {
      // Create consumer identity
      final consumer = await client.createConsumer(
        handle:      handle,
        displayName: name,
      );

      // Create consumer wallet (AOA)
      final walletJson = await client.getOrCreateWallet(consumerId: consumer.id);
      final walletId   = walletJson['id'] as String;

      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => SetupPinScreen(
          consumerId:  consumer.id,
          walletId:    walletId,
          handle:      handle,
          displayName: name,
        )),
      );
    } on BanzamiApiException catch (e) {
      setState(() {
        _apiError = e.code == 'CONFLICT'
            ? 'Este @handle já está em uso. Escolha outro.'
            : e.message;
      });
    } catch (_) {
      setState(() => _apiError = 'Erro de ligação. Verifique a internet e tente novamente.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.white,
      appBar: AppBar(
        backgroundColor: BanzamiColors.white,
        foregroundColor: BanzamiColors.gray900,
        elevation: 0,
        title: const Text('Criar conta', style: BanzamiTextStyles.headingSm),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(BanzamiSpacing.xl),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: BanzamiSpacing.md),
                const Text('Escolha o seu @handle', style: BanzamiTextStyles.headingMd),
                const SizedBox(height: BanzamiSpacing.xs),
                Text(
                  'O handle é o seu endereço de pagamento. As pessoas vão enviá-lo dinheiro usando @handle.',
                  style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
                ),
                const SizedBox(height: BanzamiSpacing.xl),

                // Handle field
                TextFormField(
                  controller:   _handleCtrl,
                  decoration:   const InputDecoration(
                    labelText:  'Handle',
                    prefixText: '@',
                    hintText:   'joaosilva',
                  ),
                  keyboardType:    TextInputType.visiblePassword,
                  textInputAction: TextInputAction.next,
                  autocorrect:     false,
                  validator: (v) {
                    final val = v?.trim() ?? '';
                    if (val.isEmpty) return 'O handle é obrigatório';
                    if (val.length < 3) return 'Mínimo 3 caracteres';
                    if (val.length > 32) return 'Máximo 32 caracteres';
                    if (!RegExp(r'^[a-z0-9_]+$').hasMatch(val)) {
                      return 'Apenas letras minúsculas, números e _';
                    }
                    return null;
                  },
                  onChanged: (_) => setState(() => _apiError = null),
                ),
                const SizedBox(height: BanzamiSpacing.lg),

                // Display name (optional)
                TextFormField(
                  controller:      _nameCtrl,
                  decoration:      const InputDecoration(
                    labelText: 'Nome (opcional)',
                    hintText:  'João Silva',
                  ),
                  textCapitalization: TextCapitalization.words,
                  textInputAction:    TextInputAction.done,
                  onFieldSubmitted:   (_) => _continue(),
                ),

                // API error
                if (_apiError != null) ...[
                  const SizedBox(height: BanzamiSpacing.lg),
                  _ErrorBanner(message: _apiError!),
                ],

                const SizedBox(height: BanzamiSpacing.xxl),

                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _loading ? null : _continue,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: BanzamiColors.wine,
                      foregroundColor: BanzamiColors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      textStyle: BanzamiTextStyles.headingSm,
                    ),
                    child: _loading
                        ? const SizedBox(
                            width: 20, height: 20,
                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                          )
                        : const Text('Continuar'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  final String message;
  const _ErrorBanner({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BanzamiSpacing.md),
      decoration: BoxDecoration(
        color:        BanzamiColors.errorBg,
        borderRadius: BorderRadius.circular(10),
        border:       Border.all(color: BanzamiColors.error.withValues(alpha: 0.3)),
      ),
      child: Row(children: [
        const Icon(Icons.error_outline_rounded, color: BanzamiColors.error, size: 18),
        const SizedBox(width: BanzamiSpacing.sm),
        Expanded(child: Text(message,
          style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.error))),
      ]),
    );
  }
}
