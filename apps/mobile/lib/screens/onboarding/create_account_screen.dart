import 'package:flutter/material.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

import 'setup_pin_screen.dart';

/// Step 1 of onboarding: choose a @handle and optional display name.
///
/// No API call is made here. The account is created in [SetupPinScreen]
/// once the PIN is confirmed, so we have all three required fields at once
/// (handle, display_name, pin) for the single POST /v1/auth/register call.
class CreateAccountScreen extends StatefulWidget {
  const CreateAccountScreen({super.key});

  @override
  State<CreateAccountScreen> createState() => _CreateAccountScreenState();
}

class _CreateAccountScreenState extends State<CreateAccountScreen> {
  final _handleCtrl = TextEditingController();
  final _nameCtrl   = TextEditingController();
  final _formKey    = GlobalKey<FormState>();

  @override
  void dispose() {
    _handleCtrl.dispose();
    _nameCtrl.dispose();
    super.dispose();
  }

  void _continue() {
    if (!_formKey.currentState!.validate()) return;

    final handle = _handleCtrl.text.trim().toLowerCase();
    final name   = _nameCtrl.text.trim().isEmpty ? null : _nameCtrl.text.trim();

    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => SetupPinScreen(handle: handle, displayName: name),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.white,
      appBar: AppBar(
        backgroundColor: BanzamiColors.white,
        foregroundColor: BanzamiColors.gray900,
        elevation:       0,
        title:           const Text('Criar conta', style: BanzamiTextStyles.headingSm),
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
                const Text('Escolha o seu @banza', style: BanzamiTextStyles.headingMd),
                const SizedBox(height: BanzamiSpacing.xs),
                Text(
                  'É o nome único que as pessoas usam para lhe enviar pagamentos.',
                  style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
                ),
                const SizedBox(height: BanzamiSpacing.xl),

                TextFormField(
                  controller:      _handleCtrl,
                  decoration:      const InputDecoration(
                    labelText:  '@banza',
                    prefixText: '@',
                    hintText:   'joaosilva',
                  ),
                  keyboardType:    TextInputType.visiblePassword,
                  textInputAction: TextInputAction.next,
                  autocorrect:     false,
                  validator: (v) {
                    final val = v?.trim() ?? '';
                    if (val.isEmpty) return 'O @banza é obrigatório';
                    if (val.length < 3) return 'Mínimo 3 caracteres';
                    if (val.length > 30) return 'Máximo 30 caracteres';
                    if (!RegExp(r'^[a-z0-9_]+$').hasMatch(val)) {
                      return 'Apenas letras minúsculas, números e _';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: BanzamiSpacing.lg),

                TextFormField(
                  controller:         _nameCtrl,
                  decoration:         const InputDecoration(
                    labelText: 'Nome (opcional)',
                    hintText:  'João Silva',
                  ),
                  textCapitalization: TextCapitalization.words,
                  textInputAction:    TextInputAction.done,
                  onFieldSubmitted:   (_) => _continue(),
                ),

                const SizedBox(height: BanzamiSpacing.xxl),

                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _continue,
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
        ),
      ),
    );
  }
}
