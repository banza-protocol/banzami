import 'package:flutter/material.dart';

import '../client/consumer_public_client.dart';
import '../models/payment_link.dart';
import '../models/transfer.dart';
import '../theme/banzami_theme.dart';
import '../widgets/banzami_components.dart';
import 'payment_request_screen.dart';

/// Resolves a payment link (e.g. a Doa / merchant `pay.banzami.com/pay/<slug>`)
/// and hands off to the shared payment flow.
///
/// This is the SINGLE entry point for paying a payment link from any app. The
/// host app only opens this screen with a [client] + [ownHandle] and receives
/// the result through [onSuccess] — it must NOT resolve the link or build the
/// confirmation/receipt itself. The screen:
///   1. loads the [PaymentLink] for [slug],
///   2. shows loading / not-found / used-expired-cancelled states,
///   3. for an active link, delegates to [BanzamiPaymentRequestScreen]
///      (confirmation) → [BanzamiReceiptScreen] (comprovativo).
///
/// Only the data differs from an app-to-app payment: the payee is a merchant
/// (no @handle) and the link reference is shown as the subtitle / receipt note.
class BanzamiPaymentLinkScreen extends StatefulWidget {
  final ConsumerPublicClient client;
  final String slug;

  /// The paying consumer's @handle — shown on the receipt ("De: @…").
  final String? ownHandle;

  /// Called when the receipt is dismissed after a successful payment. The host
  /// app uses this to refresh its wallet/home (e.g. signal a balance reload).
  final void Function(Transfer) onSuccess;

  final bool    isSandbox;
  final String? logoAssetPath;

  const BanzamiPaymentLinkScreen({
    super.key,
    required this.client,
    required this.slug,
    this.ownHandle,
    required this.onSuccess,
    this.isSandbox = false,
    this.logoAssetPath,
  });

  @override
  State<BanzamiPaymentLinkScreen> createState() => _BanzamiPaymentLinkScreenState();
}

class _BanzamiPaymentLinkScreenState extends State<BanzamiPaymentLinkScreen> {
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
      final link = await widget.client.getPaymentLinkBySlug(widget.slug);
      if (mounted) setState(() { _link = link; _loading = false; });
    } catch (_) {
      if (mounted) {
        setState(() { _error = 'Link de pagamento não encontrado.'; _loading = false; });
      }
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

    // Active link → shared payment screen. The merchant is the payee (no
    // @handle); the link reference is the subtitle and the receipt note.
    return BanzamiPaymentRequestScreen(
      client:               widget.client,
      recipientHandle:      link.merchantName ?? link.slug,
      recipientDisplayName: link.merchantName ?? 'Pagamento Banzami',
      recipientSubtitle:    link.description,
      amountMinor:          link.amountMinor,
      currency:             link.currency,
      locked:               link.amountMinor != null,
      ownHandle:            widget.ownHandle,
      onSuccess:            widget.onSuccess,
      isSandbox:            widget.isSandbox,
      paymentLinkSlug:      link.slug,
      recipientIsHandle:    false,
      logoAssetPath:        widget.logoAssetPath,
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
