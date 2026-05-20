import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart';

import 'setup_pin_screen.dart';

/// Step 1 of onboarding: choose a @handle and optional display name.
///
/// Checks handle availability before navigating to [SetupPinScreen] so the
/// user gets immediate feedback instead of failing after the full PIN flow.
/// [SetupPinScreen] still handles HANDLE_TAKEN as a safety net.
class CreateAccountScreen extends StatefulWidget {
  const CreateAccountScreen({super.key});

  @override
  State<CreateAccountScreen> createState() => _CreateAccountScreenState();
}

class _CreateAccountScreenState extends State<CreateAccountScreen> {
  final _handleCtrl = TextEditingController();
  final _nameCtrl   = TextEditingController();
  final _formKey    = GlobalKey<FormState>();

  bool    _checking    = false;
  String? _handleError;

  @override
  void dispose() {
    _handleCtrl.dispose();
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _continue() async {
    setState(() => _handleError = null);
    if (!_formKey.currentState!.validate()) return;

    final handle = _handleCtrl.text.trim().toLowerCase();
    final name   = _nameCtrl.text.trim().isEmpty ? null : _nameCtrl.text.trim();

    setState(() => _checking = true);
    try {
      final taken = await context.read<ConsumerPublicClient>().handleExists(handle);
      if (!mounted) return;
      if (taken) {
        setState(() { _handleError = 'Este @banza já está em uso.'; _checking = false; });
        _formKey.currentState!.validate();
        return;
      }
    } catch (_) {
      // Network error — let SetupPinScreen handle it at registration time
    }

    if (!mounted) return;
    setState(() => _checking = false);

    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => SetupPinScreen(handle: handle, displayName: name),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzaColors.white,
      appBar: AppBar(
        backgroundColor: BanzaColors.white,
        foregroundColor: BanzaColors.gray900,
        elevation:       0,
        title:           const Text('Criar conta', style: BanzaTextStyles.headingSm),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(BanzaSpacing.xl),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: BanzaSpacing.md),
                const Text('Escolha o seu @banza', style: BanzaTextStyles.headingMd),
                const SizedBox(height: BanzaSpacing.xs),
                Text(
                  'É o nome único que as pessoas usam para lhe enviar pagamentos.',
                  style: BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray400),
                ),
                const SizedBox(height: BanzaSpacing.xl),

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
                  onChanged:       (_) => setState(() => _handleError = null),
                  validator: (v) {
                    final val = v?.trim() ?? '';
                    if (val.isEmpty) return 'O @banza é obrigatório';
                    if (val.length < 3) return 'Mínimo 3 caracteres';
                    if (val.length > 30) return 'Máximo 30 caracteres';
                    if (!RegExp(r'^[a-z0-9_]+$').hasMatch(val)) {
                      return 'Apenas letras minúsculas, números e _';
                    }
                    if (_handleError != null) return _handleError;
                    return null;
                  },
                ),
                const SizedBox(height: BanzaSpacing.lg),

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

                const SizedBox(height: BanzaSpacing.xxl),

                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _checking ? null : _continue,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: BanzaColors.wine,
                      foregroundColor: BanzaColors.white,
                      padding:         const EdgeInsets.symmetric(vertical: 16),
                      shape:           RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                      textStyle: BanzaTextStyles.headingSm,
                    ),
                    child: _checking
                        ? const SizedBox(
                            width:  20,
                            height: 20,
                            child:  CircularProgressIndicator(
                              color:       BanzaColors.white,
                              strokeWidth: 2,
                            ),
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
