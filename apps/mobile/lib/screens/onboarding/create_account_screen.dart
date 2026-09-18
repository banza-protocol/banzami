import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

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
    // Full name is REQUIRED (ACCOUNT-ONBOARDING-NAME-001); the form validator
    // guarantees it is non-empty here. It is a user-declared name, NOT identity
    // verification — Sandbox performs no KYC.
    final name   = _nameCtrl.text.trim();

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
      body: SafeArea(
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Canonical CHILD page header — same title family as Perfil /
                // Receber (28/w700) with a back affordance above it. No more
                // compact app-bar caption; no competing in-body big title.
                AppScreenHeader(
                  title:  'Criar conta',
                  onBack: () => Navigator.of(context).maybePop(),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 4, 24, 32),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(14),
                        child: Image.asset(
                          BrandingAssets.icon,
                          height: 48,
                          width:  48,
                          fit:    BoxFit.cover,
                        ),
                      ),
                      const SizedBox(height: 24),

                      // ── @banza ──────────────────────────────────────────────
                      const Text('Escolha o seu @banza', style: BanzamiTextStyles.headingMd),
                      const SizedBox(height: 6),
                      Text(
                        'É o nome único que as pessoas usam para lhe enviar pagamentos.',
                        style: BanzamiTextStyles.bodyMd.copyWith(
                          color:  BanzamiColors.gray400,
                          height: 1.5,
                        ),
                      ),
                      const SizedBox(height: 14),
                      Semantics(
                        textField: true,
                        label: 'O seu @banza',
                        child: TextFormField(
                          controller:      _handleCtrl,
                          decoration:      _fieldDecoration(hint: 'ana', prefix: '@'),
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
                      ),

                      const SizedBox(height: 24),

                      // ── Nome completo (REQUIRED, user-declared, not KYC) ─────
                      const Text('Nome completo', style: BanzamiTextStyles.headingMd),
                      const SizedBox(height: 6),
                      Text(
                        'Usado no seu perfil, pagamentos e comprovativos.',
                        style: BanzamiTextStyles.bodyMd.copyWith(
                          color:  BanzamiColors.gray400,
                          height: 1.5,
                        ),
                      ),
                      const SizedBox(height: 14),
                      Semantics(
                        textField: true,
                        label: 'Nome completo',
                        child: TextFormField(
                          controller:         _nameCtrl,
                          decoration:         _fieldDecoration(hint: 'Ana Maria'),
                          style:              BanzamiTextStyles.bodyLg.copyWith(color: BanzamiColors.black),
                          cursorColor:        BanzamiColors.primary,
                          textCapitalization: TextCapitalization.words,
                          textInputAction:    TextInputAction.done,
                          autofillHints:      const [AutofillHints.name],
                          onFieldSubmitted:   (_) => _continue(),
                          // One field, Unicode-safe: accents, apostrophes,
                          // hyphens, one or many words all valid. No forced
                          // structure, no over-normalisation.
                          validator: (v) {
                            final val = (v ?? '').trim();
                            if (val.isEmpty) return 'Introduza o seu nome completo.';
                            if (val.runes.length > 120) return 'O nome é demasiado longo.';
                            if (RegExp(r'[\u0000-\u001F\u007F]').hasMatch(val)) {
                              return 'O nome contém caracteres inválidos.';
                            }
                            return null;
                          },
                        ),
                      ),

                      const SizedBox(height: 28),

                      BanzamiPrimaryButton(
                        label:     'Continuar',
                        isLoading: _checking,
                        onPressed: _checking ? null : _continue,
                      ),
                    ],
                  ),
                ),
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
        // The '@' appears only once you focus/start writing the handle: prefixText
        // is hidden by Flutter until the field is focused or non-empty. It is a
        // display prefix, not part of the value (the handle is normalised on submit).
        prefixText:  prefix,
        prefixStyle: BanzamiTextStyles.bodyLg.copyWith(color: BanzamiColors.black),
        filled:         true,
        fillColor:      BanzamiColors.gray100,
        contentPadding: const EdgeInsets.only(
          left:   20,
          right:  20,
          top:    18,
          bottom: 18,
        ),
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
