import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../../widgets/banzami_premium_dialog.dart';
import '../services/merchant_session_service.dart';

/// Ecrã para o comerciante pedir um levantamento para a sua conta bancária.
class PayoutScreen extends StatefulWidget {
  const PayoutScreen({super.key});

  @override
  State<PayoutScreen> createState() => _PayoutScreenState();
}

class _PayoutScreenState extends State<PayoutScreen> {
  final _formKey     = GlobalKey<FormState>();
  final _ibanCtrl    = TextEditingController();
  final _bankCtrl    = TextEditingController();
  final _holderCtrl  = TextEditingController();

  bool    _loading = false;
  String? _error;
  bool    _success = false;

  // Integer minor units from the canonical MoneyInput — "50 000" is 50 000 Kz,
  // never 50 (the old double parse read the space/dot as a decimal point).
  int?    _amountMinor;
  String? _amountError;

  /// What was requested and what reaches the bank — Core's numbers once the
  /// payout answers with them, the published-rate estimate until then.
  PayoutBreakdown? _result;

  // One idempotency key per withdrawal intent (amount + destination), kept
  // across retries until it succeeds or the Business edits the request — a
  // retry after a lost answer must never create a second payout.
  final IdempotencyIntent _intent = IdempotencyIntent();

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
    _ibanCtrl.dispose();
    _bankCtrl.dispose();
    _holderCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final amount = _amountMinor;
    final formOk = _formKey.currentState!.validate();
    if (amount == null || amount <= 0) {
      setState(() => _amountError = 'Introduza o valor');
      return;
    }
    if (!formOk) return;

    final iban   = _ibanCtrl.text.trim();
    final holder = _holderCtrl.text.trim();
    final quote  = PayoutBreakdown.estimate(amount);

    final confirm = await showBanzamiDialog(
      context:      context,
      icon:         Icons.payments_outlined,
      title:        'Confirmar levantamento',
      description:
          'Valor pedido: ${formatMinor(quote.grossMinor, 'AOA')}\n'
          'Taxa de levantamento ($walletWithdrawalFeeRateLabel): '
          '${formatMinor(quote.feeMinor, 'AOA')}\n'
          'Recebe na conta: ${formatMinor(quote.netMinor, 'AOA')}\n\n'
          'Conta $iban ($holder).',
      cancelLabel:  'Cancelar',
      confirmLabel: 'Confirmar',
      variant:      BanzamiDialogVariant.standard,
    );
    if (confirm != true) return;

    // Same request as the last attempt → same key.
    final idem = _intent.keyFor((amount, _selectedBank, iban, holder));

    setState(() { _loading = true; _error = null; });

    if (!mounted) return;
    final session = context.read<MerchantSessionService>().session!;
    final client  = context.read<BanzamiClient>();

    try {
      final json = await client.createPayout(
        walletId:          session.walletId,
        amountMinor:       amount,
        bankAccountNumber: iban,
        bankCode:          _selectedBank,
        accountHolderName: holder,
        idempotencyKey:    idem,
      );
      _intent.complete();
      final payout = Payout.fromJson(json);
      if (mounted) {
        setState(() {
          _result  = PayoutBreakdown.of(payout);
          _success = true;
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = isOutcomeUnknown(e)
          ? '${banzamiErrorMessage(e)} Se o pedido chegou ao Banzami, '
              'tentar de novo não cria um segundo levantamento.'
          : banzamiErrorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // No way back while the withdrawal is in flight: leaving would lose its
    // answer, and the only safe next step is the same request again.
    return PopScope(
      canPop: !_loading,
      child: BanzamiScaffold(
        backgroundColor: BanzamiColors.white,
        appBar: BanzamiAppBar(
          title:           'Pedir levantamento',
          backgroundColor: BanzamiColors.white,
          showBack:        !_loading,
        ),
        body: _success ? _buildSuccess() : _buildForm(),
      ),
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
          if (_result != null) ...[
            const SizedBox(height: BanzamiSpacing.xl),
            PayoutBreakdownCard(breakdown: _result!),
          ],
          const SizedBox(height: BanzamiSpacing.xxl),
          SizedBox(
            width: double.infinity,
            child: BanzamiPrimaryButton(
              label:     'Voltar',
              onPressed: () => Navigator.of(context).pop(),
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
          MoneyInput(
            label:     'Valor a levantar',
            errorText: _amountError,
            onChanged: (v) => setState(() {
              _amountMinor = v;
              _amountError = null;
              _intent.reset(); // another amount is another request
            }),
          ),
          if (_amountMinor != null && _amountMinor! > 0) ...[
            const SizedBox(height: BanzamiSpacing.md),
            PayoutBreakdownCard(
              breakdown: PayoutBreakdown.estimate(_amountMinor!),
            ),
          ],
          const SizedBox(height: BanzamiSpacing.lg),

          // Banco
          DropdownButtonFormField<String>(
            initialValue: _selectedBank,
            isExpanded:   true, // constrain the selected row so long bank names ellipsize instead of overflowing
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
            onChanged: (v) => setState(() {
              _selectedBank = v ?? _selectedBank;
              _intent.reset();
            }),
          ),
          const SizedBox(height: BanzamiSpacing.lg),

          // IBAN / número de conta
          TextFormField(
            controller:         _ibanCtrl,
            autocorrect:        false,
            enableSuggestions:  false,
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9A-Za-z ]'))],
            onChanged: (_) => _intent.reset(),
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
            onChanged:   (_) => _intent.reset(),
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
            child: BanzamiPrimaryButton(
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

/// "Valor pedido · Taxa · Recebe na conta" — what a withdrawal costs. Until
/// Core has priced the payout the fee is the published-rate estimate, and the
/// card says so.
class PayoutBreakdownCard extends StatelessWidget {
  final PayoutBreakdown breakdown;
  const PayoutBreakdownCard({super.key, required this.breakdown});

  @override
  Widget build(BuildContext context) {
    Widget row(String label, int minor, {bool strong = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(children: [
            Expanded(
              child: Text(label,
                  style: BanzamiTextStyles.bodySm.copyWith(
                    color: strong ? BanzamiColors.gray900 : BanzamiColors.gray600,
                    fontWeight: strong ? FontWeight.w700 : FontWeight.w400,
                  )),
            ),
            MoneyAmount(minor, size: MoneySize.sm),
          ]),
        );

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BanzamiSpacing.md),
      decoration: const BoxDecoration(
        color:        BanzamiColors.gray100,
        borderRadius: BanzamiRadius.lgAll,
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        row('Valor pedido', breakdown.grossMinor),
        row(
          breakdown.fromServer
              ? 'Taxa de levantamento'
              : 'Taxa de levantamento ($walletWithdrawalFeeRateLabel)',
          breakdown.feeMinor,
        ),
        const Divider(height: BanzamiSpacing.md, color: BanzamiColors.gray200),
        row('Recebe na conta', breakdown.netMinor, strong: true),
        if (!breakdown.fromServer) ...[
          const SizedBox(height: BanzamiSpacing.xs),
          Text(
            'A taxa é descontada do valor pedido. O valor final é o que o '
            'Banzami regista ao processar o levantamento.',
            style: BanzamiTextStyles.bodySm.copyWith(
              color: BanzamiColors.gray400, fontSize: 12),
          ),
        ],
      ]),
    );
  }
}
