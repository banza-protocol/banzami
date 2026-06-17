import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

/// Consumer identity verification (KYC). The consumer submits their identity
/// document; the configured provider decides and the wallet's KYC level is
/// updated, lifting transaction limits.
class KycScreen extends StatefulWidget {
  const KycScreen({super.key});

  @override
  State<KycScreen> createState() => _KycScreenState();
}

class _KycScreenState extends State<KycScreen> {
  final _formKey   = GlobalKey<FormState>();
  final _nameCtrl  = TextEditingController();
  final _docCtrl   = TextEditingController();

  String    _docType  = 'BILHETE_DE_IDENTIDADE';
  String    _level    = 'ENHANCED';
  DateTime? _dob;
  bool      _submitting = false;
  String?   _error;
  Map<String, dynamic>? _result;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _docCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDob() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(now.year - 25),
      firstDate:   DateTime(now.year - 100),
      lastDate:    DateTime(now.year - 16),
    );
    if (picked != null) setState(() => _dob = picked);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_dob == null) { setState(() => _error = 'Indique a data de nascimento'); return; }
    setState(() { _submitting = true; _error = null; _result = null; });

    final client = context.read<BanzamiClient>();
    try {
      final res = await client.verifyCustomerKyc(
        fullName:       _nameCtrl.text.trim(),
        documentNumber: _docCtrl.text.trim(),
        dateOfBirth:    _dob!,
        documentType:   _docType,
        requestedLevel: _level,
      );
      if (mounted) setState(() => _result = res);
    } on BanzamiApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Não foi possível verificar a identidade.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      appBar: AppBar(title: const Text('Verificar identidade')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(BanzamiSpacing.lg),
          children: [
            Text('Verifique a sua identidade para aumentar os limites de pagamento.',
                style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
            const SizedBox(height: BanzamiSpacing.lg),

            TextFormField(
              controller: _nameCtrl,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Nome completo'),
              validator: (v) => (v == null || v.trim().length < 3) ? 'Indique o nome completo' : null,
            ),
            const SizedBox(height: BanzamiSpacing.md),
            DropdownButtonFormField<String>(
              initialValue: _docType,
              decoration: const InputDecoration(labelText: 'Tipo de documento'),
              items: const [
                DropdownMenuItem(value: 'BILHETE_DE_IDENTIDADE', child: Text('Bilhete de Identidade')),
                DropdownMenuItem(value: 'PASSPORT', child: Text('Passaporte')),
              ],
              onChanged: (v) => setState(() => _docType = v ?? _docType),
            ),
            const SizedBox(height: BanzamiSpacing.md),
            TextFormField(
              controller: _docCtrl,
              decoration: const InputDecoration(labelText: 'Número do documento'),
              validator: (v) => (v == null || v.trim().length < 6) ? 'Número inválido' : null,
            ),
            const SizedBox(height: BanzamiSpacing.md),
            InkWell(
              onTap: _pickDob,
              child: InputDecorator(
                decoration: const InputDecoration(labelText: 'Data de nascimento'),
                child: Text(
                  _dob == null ? 'Seleccionar' : '${_dob!.day}/${_dob!.month}/${_dob!.year}',
                  style: BanzamiTextStyles.bodyMd.copyWith(
                    color: _dob == null ? BanzamiColors.gray400 : BanzamiColors.gray900),
                ),
              ),
            ),
            const SizedBox(height: BanzamiSpacing.md),
            DropdownButtonFormField<String>(
              initialValue: _level,
              decoration: const InputDecoration(labelText: 'Nível pretendido'),
              items: const [
                DropdownMenuItem(value: 'BASIC',    child: Text('Básico')),
                DropdownMenuItem(value: 'ENHANCED', child: Text('Reforçado')),
                DropdownMenuItem(value: 'FULL',     child: Text('Completo')),
              ],
              onChanged: (v) => setState(() => _level = v ?? _level),
            ),

            if (_error != null) ...[
              const SizedBox(height: BanzamiSpacing.md),
              Text(_error!, style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error)),
            ],
            if (_result != null) ...[
              const SizedBox(height: BanzamiSpacing.lg),
              _ResultCard(result: _result!),
            ],

            const SizedBox(height: BanzamiSpacing.xl),
            BanzamiButton(
              label: _submitting ? 'A verificar…' : 'Verificar',
              onPressed: _submitting ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  final Map<String, dynamic> result;
  const _ResultCard({required this.result});

  @override
  Widget build(BuildContext context) {
    final status = (result['status'] ?? '').toString();
    final level  = (result['kyc_level'] ?? '').toString();
    final (color, text) = switch (status) {
      'APPROVED'     => (BanzamiColors.success, 'Identidade aprovada — nível $level'),
      'UNDER_REVIEW' => (BanzamiColors.warning, 'Em revisão manual'),
      'REJECTED'     => (BanzamiColors.error,   'Verificação recusada'),
      _              => (BanzamiColors.gray400, 'Estado: $status'),
    };
    return Container(
      padding: const EdgeInsets.all(BanzamiSpacing.md),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(children: [
        Icon(Icons.verified_user_outlined, color: color, size: 20),
        const SizedBox(width: BanzamiSpacing.sm),
        Expanded(child: Text(text, style: BanzamiTextStyles.bodyMd.copyWith(color: color))),
      ]),
    );
  }
}
