import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:uuid/uuid.dart';

import '../config.dart';
import '../services/wallet_refresh_bus.dart';

/// Opened when the app receives a deep link: banzami://pay/link/{slug}
///
/// Loads the payment link, shows confirmation, and executes payment.
class LinkPayScreen extends StatefulWidget {
  final String slug;

  const LinkPayScreen({super.key, required this.slug});

  @override
  State<LinkPayScreen> createState() => _LinkPayScreenState();
}

class _LinkPayScreenState extends State<LinkPayScreen> {
  PaymentLink? _link;
  bool   _loading    = true;
  bool   _processing = false;
  bool   _paid       = false;
  String? _error;
  int    _enteredAmount = 0;
  // Generated once per screen instance so retries reuse the same key.
  final String _idempotencyKey = const Uuid().v4();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final client = context.read<ConsumerPublicClient>();
      final link   = await client.getPaymentLinkBySlug(widget.slug);
      if (mounted) setState(() { _link = link; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _error = 'Link de pagamento não encontrado.'; _loading = false; });
    }
  }

  Future<void> _pay() async {
    final link = _link;
    if (link == null) return;

    setState(() { _processing = true; _error = null; });
    try {
      final client  = context.read<ConsumerPublicClient>();
      final amount  = link.amountMinor ?? (_enteredAmount > 0 ? _enteredAmount : null);
      final updated = await client.payPaymentLink(
        link.slug,
        amountMinor:     amount,
        idempotencyKey:  _idempotencyKey,
      );
      // Ledger committed. Tell the home shell to reload the wallet balance from
      // the backend — the payer was just debited, so a cached balance is now
      // stale. We signal here (not on pop) so the home, still mounted under the
      // IndexedStack, refreshes behind the success screen and is already fresh
      // when the user closes. We never subtract the amount locally; the ledger
      // is the source of truth (CLAUDE.md §2.1).
      WalletRefreshBus.instance.signal();
      // Merge merchant_name from the pre-loaded link since payPaymentLink
      // returns the updated status but may drop enriched fields on older servers.
      if (mounted) {
        setState(() {
          _link = updated;
          _paid = true;
          _processing = false;
        });
      }
    } on BanzamiApiException catch (e) {
      setState(() {
        _error = switch (e.code) {
          'INSUFFICIENT_FUNDS' => 'Saldo insuficiente.',
          'LINK_NOT_ACTIVE'    => 'Link de pagamento já não está disponível.',
          'SELF_TRANSFER'      => 'Não pode pagar o seu próprio link.',
          'WALLET_NOT_FOUND'   => 'Carteira de destino não encontrada.',
          'NO_WALLET'          => 'Não tem carteira activa para esta moeda.',
          _                    => 'Pagamento falhou. Tente novamente.',
        };
        _processing = false;
      });
    } catch (_) {
      setState(() { _error = 'Pagamento falhou. Tente novamente.'; _processing = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return BanzamiScaffold(
      appBar: const BanzamiAppBar(title: 'Pagar', showBack: true),
      body:   _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: BanzamiColors.primary));
    }

    if (_error != null && _link == null) {
      return Center(child: Padding(
        padding: const EdgeInsets.all(BanzamiSpacing.xl),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.link_off_rounded, color: BanzamiColors.error, size: 48),
          const SizedBox(height: BanzamiSpacing.lg),
          Text(_error!, style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
              textAlign: TextAlign.center),
          const SizedBox(height: BanzamiSpacing.xl),
          BanzamiGhostButton(
            label:     'Voltar',
            onPressed: () => Navigator.of(context).pop(),
          ),
        ]),
      ));
    }

    // Pop with `true` (paymentCompleted) so any awaiting caller knows a payment
    // happened. The actual balance refresh is driven by WalletRefreshBus, fired
    // at commit time in _pay(), so it works regardless of how the screen closes.
    if (_paid) return _SuccessView(link: _link!, onClose: () => Navigator.of(context).pop(true));

    final link = _link!;

    if (link.status == PaymentLinkStatus.used ||
        link.status == PaymentLinkStatus.expired ||
        link.status == PaymentLinkStatus.cancelled) {
      return _InvalidView(status: link.status, onClose: () => Navigator.of(context).pop());
    }

    final bool needsAmount = link.amountMinor == null;
    final String amountLabel = link.amountMinor != null
        ? formatMinor(link.amountMinor!, link.currency)
        : 'Valor livre';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      child: Column(children: [
        // Amount card
        Container(
          width:       double.infinity,
          padding:     const EdgeInsets.symmetric(horizontal: BanzamiSpacing.xl, vertical: BanzamiSpacing.xxl),
          decoration:  const BoxDecoration(gradient: BanzamiGradients.primary,
              borderRadius: BanzamiRadius.xlAll),
          child: Column(children: [
            Text(
              link.description ?? 'Pagamento Banzami',
              style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.white.withValues(alpha: 0.7)),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: BanzamiSpacing.sm),
            Text(
              amountLabel,
              style: BanzamiTextStyles.displayMd.copyWith(color: BanzamiColors.white),
            ),
          ]),
        ),

        const SizedBox(height: BanzamiSpacing.xl),

        // Amount input if open link
        if (needsAmount) ...[
          const Align(
            alignment: Alignment.centerLeft,
            child: Text('Montante a pagar', style: BanzamiTextStyles.headingSm),
          ),
          const SizedBox(height: BanzamiSpacing.md),
          BanzamiAmountInput(onChanged: (v) => setState(() => _enteredAmount = v)),
          const SizedBox(height: BanzamiSpacing.xl),
        ],

        if (_error != null) ...[
          BanzamiErrorBanner(message: _error!),
          const SizedBox(height: BanzamiSpacing.lg),
        ],

        // Confirm button
        BanzamiPrimaryButton(
          label:     'Confirmar pagamento',
          isLoading: _processing,
          onPressed: (needsAmount && _enteredAmount <= 0) ? null : _pay,
        ),
        const SizedBox(height: BanzamiSpacing.md),
        BanzamiSecondaryButton(
          label:     'Cancelar',
          onPressed: _processing ? null : () => Navigator.of(context).pop(),
        ),
      ]),
    );
  }
}

class _SuccessView extends StatelessWidget {
  final PaymentLink   link;
  final VoidCallback  onClose;
  const _SuccessView({required this.link, required this.onClose});

  @override
  Widget build(BuildContext context) {
    final amountLabel   = formatMinor(link.amountMinor ?? 0, link.currency);
    final merchantLabel = link.merchantName ?? link.description ?? link.slug;
    final isSandbox     = AppConfig.isSandbox;

    return Center(child: Padding(
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        // Same premium success mark as the P2P receipt — one success language.
        const BanzamiVerifiedMark(size: 88, onLight: true),
        const SizedBox(height: BanzamiSpacing.xl),
        if (isSandbox) ...[
          const BanzamiSandboxBadge(label: 'COMPROVATIVO DE TESTE'),
          const SizedBox(height: BanzamiSpacing.md),
        ],
        Text(amountLabel,
            style: BanzamiTextStyles.displayMd.copyWith(color: BanzamiColors.gray900)),
        const SizedBox(height: BanzamiSpacing.xs),
        Text('Pagamento enviado para $merchantLabel',
            style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
            textAlign: TextAlign.center),
        const SizedBox(height: BanzamiSpacing.xxl),
        BanzamiPrimaryButton(label: 'Fechar', onPressed: onClose),
        if (isSandbox) ...[
          const SizedBox(height: BanzamiSpacing.lg),
          Text(
            'Comprovativo Sandbox Banzami · Sem valor financeiro real',
            style: BanzamiTextStyles.bodySm.copyWith(
              color: BanzamiColors.gray400, fontSize: 11,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ]),
    ));
  }
}

class _InvalidView extends StatelessWidget {
  final PaymentLinkStatus status;
  final VoidCallback onClose;
  const _InvalidView({required this.status, required this.onClose});

  @override
  Widget build(BuildContext context) {
    final msg = switch (status) {
      PaymentLinkStatus.used      => 'Este link já foi utilizado.',
      PaymentLinkStatus.expired   => 'Este link de pagamento expirou.',
      PaymentLinkStatus.cancelled => 'Este link foi cancelado.',
      _                           => 'Link inválido.',
    };
    return Center(child: Padding(
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 72, height: 72,
          decoration: const BoxDecoration(
            color:        BanzamiColors.errorBg,
            borderRadius: BanzamiRadius.fullAll,
          ),
          child: const Icon(Icons.close_rounded, color: BanzamiColors.error, size: 36),
        ),
        const SizedBox(height: BanzamiSpacing.xl),
        const Text('Link inválido', style: BanzamiTextStyles.headingLg),
        const SizedBox(height: BanzamiSpacing.sm),
        Text(msg, style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
            textAlign: TextAlign.center),
        const SizedBox(height: BanzamiSpacing.xxl),
        BanzamiPrimaryButton(label: 'Fechar', onPressed: onClose),
      ]),
    ));
  }
}
