import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

/// Merchant business identity verification (KYB). Submits the legal name + NIF;
/// the provider decides and the merchant's KYB/AML status is updated, which
/// gates whether the merchant can process and settle payments.
class KybScreen extends StatefulWidget {
  const KybScreen({super.key});

  @override
  State<KybScreen> createState() => _KybScreenState();
}

class _KybScreenState extends State<KybScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _nifCtrl  = TextEditingController();
  final _repCtrl  = TextEditingController();

  bool    _submitting = false;
  String? _error;
  Map<String, dynamic>? _result;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _nifCtrl.dispose();
    _repCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _submitting = true; _error = null; _result = null; });

    final client = context.read<BanzamiClient>();
    try {
      final res = await client.verifyMerchantKyb(
        legalName:          _nameCtrl.text.trim(),
        taxId:              _nifCtrl.text.trim(),
        representativeName: _repCtrl.text.trim(),
      );
      if (mounted) setState(() => _result = res);
    } on BanzamiApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Não foi possível verificar o negócio.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      appBar: AppBar(title: const Text('Verificar negócio')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(BanzamiSpacing.lg),
          children: [
            Text('Verifique o seu negócio (KYB) para processar e liquidar pagamentos.',
                style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
            const SizedBox(height: BanzamiSpacing.lg),

            TextFormField(
              controller: _nameCtrl,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Nome legal do negócio'),
              validator: (v) => (v == null || v.trim().length < 3) ? 'Indique o nome legal' : null,
            ),
            const SizedBox(height: BanzamiSpacing.md),
            TextFormField(
              controller: _nifCtrl,
              decoration: const InputDecoration(labelText: 'NIF'),
              validator: (v) => (v == null || v.trim().length < 6) ? 'NIF inválido' : null,
            ),
            const SizedBox(height: BanzamiSpacing.md),
            TextFormField(
              controller: _repCtrl,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Representante legal'),
              validator: (v) => (v == null || v.trim().length < 3) ? 'Indique o representante' : null,
            ),

            if (_error != null) ...[
              const SizedBox(height: BanzamiSpacing.md),
              Text(_error!, style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error)),
            ],
            if (_result != null) ...[
              const SizedBox(height: BanzamiSpacing.lg),
              _KybResultCard(result: _result!),
            ],

            const SizedBox(height: BanzamiSpacing.xl),
            BanzamiButton(
              label: _submitting ? 'A verificar…' : 'Verificar negócio',
              onPressed: _submitting ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}

class _KybResultCard extends StatelessWidget {
  final Map<String, dynamic> result;
  const _KybResultCard({required this.result});

  @override
  Widget build(BuildContext context) {
    final kyb = (result['kyb_status'] ?? '').toString();
    final (color, text) = switch (kyb) {
      'APPROVED'     => (BanzamiColors.success, 'Negócio aprovado — pode processar pagamentos'),
      'UNDER_REVIEW' => (BanzamiColors.warning, 'Em revisão manual'),
      'REJECTED'     => (BanzamiColors.error,   'Verificação recusada'),
      _              => (BanzamiColors.gray400, 'Estado: $kyb'),
    };
    return Container(
      padding: const EdgeInsets.all(BanzamiSpacing.md),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(children: [
        Icon(Icons.verified_outlined, color: color, size: 20),
        const SizedBox(width: BanzamiSpacing.sm),
        Expanded(child: Text(text, style: BanzamiTextStyles.bodyMd.copyWith(color: color))),
      ]),
    );
  }
}
