import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../branding_assets.dart';
import '../config.dart';
import '../services/session_service.dart';
import '../services/wallet_refresh_bus.dart';

/// Opened when the app receives a deep link: banzami://pay/link/{slug} or the
/// Universal Link https://pay.banzami.com/pay/{slug} (a Doa / merchant payment
/// link).
///
/// This is a thin resolver: it loads the payment link, then hands off to the
/// SAME native screens used by app-to-app payments — [BanzamiPaymentRequestScreen]
/// for confirmation and [BanzamiReceiptScreen] for the comprovativo — so a Doa
/// payment is visually identical to a native Banzami payment. Only the data
/// differs (merchant payee + Doa reference instead of a @handle).
class LinkPayScreen extends StatefulWidget {
  final String slug;

  const LinkPayScreen({super.key, required this.slug});

  @override
  State<LinkPayScreen> createState() => _LinkPayScreenState();
}

class _LinkPayScreenState extends State<LinkPayScreen> {
  PaymentLink? _link;
  bool    _loading = true;
  String? _error;

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

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const BanzamiScaffold(
        appBar: BanzamiAppBar(title: 'Pagar', showBack: true),
        body:   Center(child: CircularProgressIndicator(color: BanzamiColors.primary)),
      );
    }

    final link = _link;
    if (_error != null || link == null) {
      return BanzamiScaffold(
        appBar: const BanzamiAppBar(title: 'Pagar', showBack: true),
        body: Center(child: Padding(
          padding: const EdgeInsets.all(BanzamiSpacing.xl),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.link_off_rounded, color: BanzamiColors.error, size: 48),
            const SizedBox(height: BanzamiSpacing.lg),
            Text(_error ?? 'Link de pagamento não encontrado.',
                style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
                textAlign: TextAlign.center),
            const SizedBox(height: BanzamiSpacing.xl),
            BanzamiGhostButton(
              label:     'Voltar',
              onPressed: () => Navigator.of(context).pop(),
            ),
          ]),
        )),
      );
    }

    if (link.status == PaymentLinkStatus.used ||
        link.status == PaymentLinkStatus.expired ||
        link.status == PaymentLinkStatus.cancelled) {
      return BanzamiScaffold(
        appBar: const BanzamiAppBar(title: 'Pagar', showBack: true),
        body:   _InvalidView(
          status:  link.status,
          onClose: () => Navigator.of(context).pop(),
        ),
      );
    }

    // Active link → hand off to the native payment screen. The merchant is the
    // payee (no @handle), and the Doa reference is shown as the subtitle / note.
    final session = context.read<SessionService>().session;
    return BanzamiPaymentRequestScreen(
      client:               context.read<ConsumerPublicClient>(),
      recipientHandle:      link.merchantName ?? link.slug,
      recipientDisplayName: link.merchantName ?? 'Pagamento Banzami',
      recipientSubtitle:    link.description,
      amountMinor:          link.amountMinor,
      currency:             link.currency,
      // The reference shows once as the subtitle; the receipt still gets it as
      // its "Nota" from the paid PaymentLink.description, so no note line here.
      locked:               link.amountMinor != null,
      ownHandle:            session?.handle,
      // Fired when the receipt is dismissed — reload the home wallet balance
      // from the backend (never subtract locally). Same WalletRefreshBus the
      // home shell listens to.
      onSuccess:            (_) => WalletRefreshBus.instance.signal(),
      isSandbox:            AppConfig.isSandbox,
      paymentLinkSlug:      link.slug,
      recipientIsHandle:    false,
      logoAssetPath:        BrandingAssets.icon,
    );
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
