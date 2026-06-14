import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart';

import '../../branding_assets.dart';
import 'setup_pin_screen.dart';

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

    Navigator.of(context).push(BanzamiPageRoute(
      page: SetupPinScreen(handle: handle, displayName: name),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      appBar: const BanzamiAppBar(title: 'Criar conta'),
      body: SafeArea(
        child: SingleChildScrollView(
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

                const Text('Escolha o seu @banza', style: BanzamiTextStyles.displayMd),
                const SizedBox(height: 8),
                Text(
                  'É o nome único que as pessoas usam para lhe enviar pagamentos.',
                  style: BanzamiTextStyles.bodyMd.copyWith(
                    color:  BanzamiColors.gray400,
                    height: 1.5,
                  ),
                ),

                const SizedBox(height: 32),

                TextFormField(
                  controller:      _handleCtrl,
                  decoration:      _fieldDecoration(hint: 'joaosilva', prefix: '@'),
                  style:           BanzamiTextStyles.bodyLg.copyWith(color: BanzamiColors.black),
                  cursorColor:     BanzamiColors.primary,
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

                const SizedBox(height: 16),

                TextFormField(
                  controller:         _nameCtrl,
                  decoration:         _fieldDecoration(hint: 'Nome (opcional)'),
                  style:              BanzamiTextStyles.bodyLg.copyWith(color: BanzamiColors.black),
                  cursorColor:        BanzamiColors.primary,
                  textCapitalization: TextCapitalization.words,
                  textInputAction:    TextInputAction.done,
                  onFieldSubmitted:   (_) => _continue(),
                ),

                const SizedBox(height: 28),

                BanzamiPrimaryButton(
                  label:     'Continuar',
                  isLoading: _checking,
                  onPressed: _checking ? null : _continue,
                ),

                const SizedBox(height: 32),
              ],
            ),
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
          borderRadius: BanzamiRadius.fieldAll,
          borderSide:   BorderSide.none,
        ),
        enabledBorder: const OutlineInputBorder(
          borderRadius: BanzamiRadius.fieldAll,
          borderSide:   BorderSide.none,
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
