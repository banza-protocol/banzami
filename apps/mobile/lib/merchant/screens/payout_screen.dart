import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../services/merchant_session_service.dart';

/// Ecrã para o comerciante pedir um levantamento para a sua conta bancária.
class PayoutScreen extends StatefulWidget {
  const PayoutScreen({super.key});

  @override
  State<PayoutScreen> createState() => _PayoutScreenState();
}

class _PayoutScreenState extends State<PayoutScreen> {
  final _formKey     = GlobalKey<FormState>();
  final _amountCtrl  = TextEditingController();
  final _ibanCtrl    = TextEditingController();
  final _bankCtrl    = TextEditingController();
  final _holderCtrl  = TextEditingController();

  bool    _loading = false;
  String? _error;
  bool    _success = false;

  // Angolan bank codes (BNA standard)
  static const _banks = [
    ('BAI',  'Banco Angolano de Investimentos'),
    ('BFA',  'Banco de Fomento Angola'),
    ('BPC',  'Banco de Poupança e Crédito'),
    ('ATL',  'Atlantico'),
    ('SOL',  'Banco Sol'),
    ('BIC',  'Banco BIC'),
    ('BCH',  'Banco Caixa Geral Totta Angola'),
    ('SMA',  'Standard Bank'),
    ('AKZ',  'Banco Económico'),
    ('BNI',  'Banco de Negócios Internacional'),
    ('OTH',  'Outro'),
  ];

  String _selectedBank = 'BAI';

  @override
  void dispose() {
    _amountCtrl.dispose();
    _ibanCtrl.dispose();
    _bankCtrl.dispose();
    _holderCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    final raw = _amountCtrl.text.trim().replaceAll(',', '.');
    final amount = (double.parse(raw) * 100).round();

    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title:   const Text('Confirmar levantamento'),
        content: Text(
          'Vai pedir um levantamento de ${formatMinor(amount, 'AOA')} '
          'para a conta ${_ibanCtrl.text.trim()} '
          '(${_holderCtrl.text.trim()}).\n\nConfirma?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirmar',
                style: TextStyle(color: BanzamiColors.primary)),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    setState(() { _loading = true; _error = null; });

    if (!mounted) return;
    final session = context.read<MerchantSessionService>().session!;
    final client  = context.read<BanzamiClient>();

    try {
      await client.createPayout(
        walletId:          session.walletId,
        amountMinor:       amount,
        bankAccountNumber: _ibanCtrl.text.trim(),
        bankCode:          _selectedBank,
        accountHolderName: _holderCtrl.text.trim(),
      );
      if (mounted) setState(() => _success = true);
    } on BanzamiApiException catch (e) {
      setState(() => _error = e.message.isNotEmpty
          ? e.message
          : 'Não foi possível processar o levantamento.');
    } on BanzamiNetworkException {
      setState(() => _error = 'Sem ligação. Verifique a sua rede.');
    } catch (_) {
      setState(() => _error = 'Ocorreu um erro inesperado.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return BanzamiScaffold(
      backgroundColor: BanzamiColors.white,
      appBar: const BanzamiAppBar(
        title:           'Pedir levantamento',
        backgroundColor: BanzamiColors.white,
      ),
      body: _success ? _buildSuccess() : _buildForm(),
    );
  }

  Widget _buildSuccess() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(BanzamiSpacing.xl),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 72, height: 72,
            decoration: BoxDecoration(
              color:        BanzamiColors.success.withValues(alpha: 0.12),
              shape:        BoxShape.circle,
            ),
            child: const Icon(Icons.check_rounded,
                color: BanzamiColors.success, size: 36),
          ),
          const SizedBox(height: BanzamiSpacing.xl),
          const Text('Pedido enviado!', style: BanzamiTextStyles.headingMd),
          const SizedBox(height: BanzamiSpacing.md),
          Text(
            'O seu pedido de levantamento foi registado e será processado em 1-3 dias úteis.',
            style:     BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: BanzamiSpacing.xxl),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () => Navigator.of(context).pop(),
              style: ElevatedButton.styleFrom(
                backgroundColor: BanzamiColors.primary,
                foregroundColor: BanzamiColors.white,
                padding:   const EdgeInsets.symmetric(vertical: 14),
                shape:     const RoundedRectangleBorder(borderRadius: BanzamiRadius.lgAll),
                textStyle: BanzamiTextStyles.headingSm,
              ),
              child: const Text('Voltar'),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _buildForm() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      child: Form(
        key: _formKey,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

          // Info banner
          Container(
            padding: const EdgeInsets.all(BanzamiSpacing.md),
            decoration: BoxDecoration(
              color:        BanzamiColors.primary.withValues(alpha: 0.06),
              borderRadius: BanzamiRadius.lgAll,
              border:       Border.all(color: BanzamiColors.primary.withValues(alpha: 0.2)),
            ),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.info_outline_rounded,
                  color: BanzamiColors.primary, size: 18),
              const SizedBox(width: 10),
              Expanded(child: Text(
                'O valor será transferido para a conta bancária indicada em 1-3 dias úteis.',
                style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.primary),
              )),
            ]),
          ),
          const SizedBox(height: BanzamiSpacing.xl),

          // Valor
          TextFormField(
            controller:   _amountCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9,.]'))],
            decoration: const InputDecoration(
              labelText:  'Valor (Kz)',
              prefixIcon: Icon(Icons.payments_outlined),
            ),
            validator: (v) {
              if (v == null || v.trim().isEmpty) return 'Introduza o valor';
              final n = double.tryParse(v.trim().replaceAll(',', '.'));
              if (n == null || n <= 0) return 'Valor inválido';
              return null;
            },
          ),
          const SizedBox(height: BanzamiSpacing.lg),

          // Banco
          DropdownButtonFormField<String>(
            initialValue: _selectedBank,
            decoration: const InputDecoration(
              labelText:  'Banco',
              prefixIcon: Icon(Icons.account_balance_outlined),
            ),
            items: _banks
                .map((b) => DropdownMenuItem(
                      value: b.$1,
                      child: Text('${b.$1} — ${b.$2}',
                          overflow: TextOverflow.ellipsis),
                    ))
                .toList(),
            onChanged: (v) => setState(() => _selectedBank = v ?? _selectedBank),
          ),
          const SizedBox(height: BanzamiSpacing.lg),

          // IBAN / número de conta
          TextFormField(
            controller:         _ibanCtrl,
            autocorrect:        false,
            enableSuggestions:  false,
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9A-Za-z ]'))],
            decoration: const InputDecoration(
              labelText:  'IBAN / Número de conta',
              hintText:   'AO06 0006 0000 0000 0000 0000 0',
              prefixIcon: Icon(Icons.credit_card_outlined),
            ),
            validator: (v) =>
                (v == null || v.trim().isEmpty) ? 'Introduza o número de conta' : null,
          ),
          const SizedBox(height: BanzamiSpacing.lg),

          // Titular
          TextFormField(
            controller:  _holderCtrl,
            decoration: const InputDecoration(
              labelText:  'Nome do titular',
              prefixIcon: Icon(Icons.person_outline_rounded),
            ),
            validator: (v) =>
                (v == null || v.trim().isEmpty) ? 'Introduza o nome do titular' : null,
          ),

          if (_error != null) ...[
            const SizedBox(height: BanzamiSpacing.lg),
            Container(
              padding: const EdgeInsets.all(BanzamiSpacing.md),
              decoration: BoxDecoration(
                color:        BanzamiColors.error.withValues(alpha: 0.08),
                borderRadius: BanzamiRadius.lgAll,
              ),
              child: Row(children: [
                const Icon(Icons.error_outline_rounded,
                    color: BanzamiColors.error, size: 20),
                const SizedBox(width: 10),
                Expanded(child: Text(_error!,
                    style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error))),
              ]),
            ),
          ],

          const SizedBox(height: BanzamiSpacing.xxl),

          SizedBox(
            width: double.infinity,
            child: BanzamiButton(
              label:     'Pedir levantamento',
              onPressed: _loading ? null : _submit,
              isLoading: _loading,
            ),
          ),
        ]),
      ),
    );
  }
}
