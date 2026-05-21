import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart';
import 'package:uuid/uuid.dart';

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
    return Scaffold(
      backgroundColor: BanzaColors.offWhite,
      appBar: AppBar(
        backgroundColor: BanzaColors.white,
        foregroundColor: BanzaColors.gray900,
        elevation:       0,
        title: const Text('Pagar', style: BanzaTextStyles.headingSm),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: BanzaColors.wine));
    }

    if (_error != null && _link == null) {
      return Center(child: Padding(
        padding: const EdgeInsets.all(BanzaSpacing.xl),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.link_off_rounded, color: BanzaColors.error, size: 48),
          const SizedBox(height: BanzaSpacing.lg),
          Text(_error!, style: BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray400),
              textAlign: TextAlign.center),
          const SizedBox(height: BanzaSpacing.xl),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Voltar'),
          ),
        ]),
      ));
    }

    if (_paid) return _SuccessView(link: _link!, onClose: () => Navigator.of(context).pop());

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
      padding: const EdgeInsets.all(BanzaSpacing.xl),
      child: Column(children: [
        // Amount card
        Container(
          width:       double.infinity,
          padding:     const EdgeInsets.symmetric(horizontal: BanzaSpacing.xl, vertical: BanzaSpacing.xxl),
          decoration:  const BoxDecoration(gradient: BanzaGradients.wine,
              borderRadius: BanzaRadius.xlAll),
          child: Column(children: [
            Text(
              link.description ?? 'Pagamento Banza',
              style: BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.white.withValues(alpha: 0.7)),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: BanzaSpacing.sm),
            Text(
              amountLabel,
              style: BanzaTextStyles.displayMd.copyWith(color: BanzaColors.white),
            ),
          ]),
        ),

        const SizedBox(height: BanzaSpacing.xl),

        // Amount input if open link
        if (needsAmount) ...[
          const Align(
            alignment: Alignment.centerLeft,
            child: Text('Montante a pagar', style: BanzaTextStyles.headingSm),
          ),
          const SizedBox(height: BanzaSpacing.md),
          BanzaAmountInput(onChanged: (v) => setState(() => _enteredAmount = v)),
          const SizedBox(height: BanzaSpacing.xl),
        ],

        if (_error != null)
          Container(
            width:   double.infinity,
            padding: const EdgeInsets.all(BanzaSpacing.md),
            margin:  const EdgeInsets.only(bottom: BanzaSpacing.lg),
            decoration: const BoxDecoration(
              color:        BanzaColors.errorBg,
              borderRadius: BanzaRadius.mdAll,
            ),
            child: Text(_error!,
                style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.error)),
          ),

        // Confirm button
        SizedBox(
          width: double.infinity,
          child: BanzaButton(
            label:     'Confirmar pagamento',
            isLoading: _processing,
            onPressed: (needsAmount && _enteredAmount <= 0) ? null : _pay,
          ),
        ),
        const SizedBox(height: BanzaSpacing.md),
        SizedBox(
          width: double.infinity,
          child: BanzaButton.secondary(
            label:     'Cancelar',
            onPressed: _processing ? null : () => Navigator.of(context).pop(),
          ),
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

    return Center(child: Padding(
      padding: const EdgeInsets.all(BanzaSpacing.xl),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 80, height: 80,
          decoration: const BoxDecoration(
            color:        BanzaColors.successBg,
            borderRadius: BanzaRadius.fullAll,
          ),
          child: const Icon(Icons.check_rounded, color: BanzaColors.success, size: 40),
        ),
        const SizedBox(height: BanzaSpacing.xl),
        Text(amountLabel,
            style: BanzaTextStyles.displayMd.copyWith(color: BanzaColors.gray900)),
        const SizedBox(height: BanzaSpacing.xs),
        Text('Pagamento enviado para $merchantLabel',
            style: BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray400),
            textAlign: TextAlign.center),
        const SizedBox(height: BanzaSpacing.xxl),
        SizedBox(
          width: double.infinity,
          child: BanzaButton(label: 'Fechar', onPressed: onClose),
        ),
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
      padding: const EdgeInsets.all(BanzaSpacing.xl),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 72, height: 72,
          decoration: const BoxDecoration(
            color:        BanzaColors.errorBg,
            borderRadius: BanzaRadius.fullAll,
          ),
          child: const Icon(Icons.close_rounded, color: BanzaColors.error, size: 36),
        ),
        const SizedBox(height: BanzaSpacing.xl),
        const Text('Link inválido', style: BanzaTextStyles.headingLg),
        const SizedBox(height: BanzaSpacing.sm),
        Text(msg, style: BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray400),
            textAlign: TextAlign.center),
        const SizedBox(height: BanzaSpacing.xxl),
        SizedBox(
          width: double.infinity,
          child: BanzaButton(label: 'Fechar', onPressed: onClose),
        ),
      ]),
    ));
  }
}
