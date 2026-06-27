import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:uuid/uuid.dart';

import '../client/api_exception.dart';
import '../client/consumer_public_client.dart';
import '../models/transfer.dart';
import '../theme/banzami_theme.dart';
import '../utils/money_format.dart';
import '../widgets/banzami_amount_input.dart';
import '../widgets/banzami_components.dart';
import 'receipt_screen.dart';

// ---------------------------------------------------------------------------
// BanzamiPaymentRequestScreen
// ---------------------------------------------------------------------------

/// Premium locked payment screen — shown when a deep link or QR code carries
/// a pre-configured amount and recipient.
///
/// [locked] = true: amount and note are readonly; "Pagar X Kz" executes immediately.
/// [locked] = false (flexible): recipient is locked but consumer can enter amount.
class BanzamiPaymentRequestScreen extends StatefulWidget {
  final ConsumerPublicClient client;
  final String  recipientHandle;
  final String? recipientDisplayName;
  final int?    amountMinor;
  final String  currency;
  final String? note;
  final bool    locked;
  final String? ownHandle;
  final void Function(Transfer) onSuccess;
  final bool    isSandbox;
  final String? logoAssetPath;
  /// When set, payment is executed via the consumer pay-link API
  /// (POST /v1/consumer-pay-links/:code/pay) instead of sendByHandle.
  final String? linkCode;

  /// When set, payment is executed via the payment-link API
  /// (POST /v1/payment-links/:slug/pay) — e.g. a Doa / merchant payment link.
  /// The recipient is then a merchant, not a @handle.
  final String? paymentLinkSlug;

  /// Optional secondary line under the name (e.g. a merchant reference
  /// "DOA-A8F24AF4"). Replaces the "@handle" line when provided.
  final String? recipientSubtitle;

  /// Whether [recipientHandle] is a real @handle (P2P) or a merchant display
  /// name. Forwarded to the receipt so it drops the "@" for merchants.
  final bool recipientIsHandle;

  const BanzamiPaymentRequestScreen({
    super.key,
    required this.client,
    required this.recipientHandle,
    this.recipientDisplayName,
    this.amountMinor,
    this.currency      = 'AOA',
    this.note,
    this.locked        = true,
    this.ownHandle,
    required this.onSuccess,
    this.isSandbox     = false,
    this.logoAssetPath,
    this.linkCode,
    this.paymentLinkSlug,
    this.recipientSubtitle,
    this.recipientIsHandle = true,
  });

  @override
  State<BanzamiPaymentRequestScreen> createState() => _BanzamiPaymentRequestScreenState();
}

class _BanzamiPaymentRequestScreenState extends State<BanzamiPaymentRequestScreen>
    with SingleTickerProviderStateMixin {
  int     _amountMinor  = 0;
  String? _amountError;
  bool    _sending      = false;
  String? _error;
  bool    _entered      = false;

  late final AnimationController _pulseCtrl;
  late final Animation<double>   _pulseScale;

  // Generated once so payment-link retries reuse the same idempotency key.
  final String _idem = const Uuid().v4();

  @override
  void initState() {
    super.initState();
    _amountMinor = widget.amountMinor ?? 0;
    _pulseCtrl = AnimationController(
      vsync:    this,
      duration: BanzamiMotion.pulse,
    );
    _pulseScale = Tween<double>(begin: 0.96, end: 1.04).animate(
      CurvedAnimation(parent: _pulseCtrl, curve: BanzamiMotion.standard),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) setState(() => _entered = true);
    });
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    super.dispose();
  }

  Future<void> _pay() async {
    if (_sending) return;

    // Self-pay guard — also enforced server-side, but fail fast locally.
    if (widget.ownHandle != null &&
        widget.ownHandle!.isNotEmpty &&
        widget.ownHandle == widget.recipientHandle) {
      setState(() => _error = 'Não pode pagar o seu próprio pedido.');
      return;
    }

    final amount = widget.locked ? (widget.amountMinor ?? 0) : _amountMinor;
    if (amount <= 0) {
      setState(() => _amountError = 'Introduza um montante válido');
      return;
    }
    HapticFeedback.mediumImpact();
    setState(() { _sending = true; _error = null; });
    _pulseCtrl.repeat(reverse: true);

    try {
      Transfer transfer;

      if (widget.paymentLinkSlug != null) {
        // Pay via the payment-link API (Doa / merchant link). Build a Transfer
        // from the resulting PaymentLink so the shared receipt can display it —
        // this is UI orchestration only; the client/payload/API are unchanged.
        final paid = await widget.client.payPaymentLink(
          widget.paymentLinkSlug!,
          amountMinor:    amount,
          idempotencyKey: _idem,
        );
        transfer = Transfer(
          transferId:  paid.id,
          sender:      widget.ownHandle ?? '',
          recipient:   paid.merchantName ?? widget.recipientDisplayName ?? paid.slug,
          amountMinor: paid.amountMinor ?? amount,
          currency:    paid.currency,
          status:      'COMPLETED',
          note:        paid.description,
          createdAt:   paid.paidAt ?? paid.createdAt,
          completedAt: paid.paidAt,
        );
      } else if (widget.linkCode != null) {
        // Pay via the dedicated consumer pay-link API.
        // The server ignores client amount on locked links — tamper-proof.
        final link = await widget.client.payConsumerPayLink(
          widget.linkCode!,
          amountMinor: widget.locked ? null : amount,
        );
        transfer = Transfer.fromConsumerPayLink(link, ownHandle: widget.ownHandle);
      } else {
        transfer = await widget.client.sendByHandle(
          recipientHandle: widget.recipientHandle,
          amountMinor:     amount,
          currency:        widget.currency,
          note:            widget.note,
          idempotencyKey:  const Uuid().v4(),
        );
      }

      if (!mounted) return;
      _pulseCtrl.stop();
      _pulseCtrl.reset();
      setState(() => _sending = false);

      await Navigator.of(context).push(BanzamiPageRoute(
        page: BanzamiReceiptScreen(
          transfer:          transfer,
          ownHandle:         widget.ownHandle,
          onDone:            widget.onSuccess,
          isSandbox:         widget.isSandbox,
          logoAssetPath:     widget.logoAssetPath,
          recipientIsHandle: widget.recipientIsHandle,
          fetchReceiptPdf:   () => widget.client.fetchReceiptPdf(transfer.transferId),
        ),
      ));
    } on BanzamiApiException catch (e) {
      if (!mounted) return;
      _pulseCtrl.stop();
      _pulseCtrl.reset();
      HapticFeedback.heavyImpact();
      setState(() {
        _sending = false;
        _error   = switch (e.code) {
          'INSUFFICIENT_FUNDS'          => 'Saldo insuficiente para esta transferência.',
          'LINK_NOT_ACTIVE'             => 'Este pedido de pagamento já não está activo.',
          'ACCOUNT_FROZEN'              => 'A sua conta está suspensa. Contacte o suporte.',
          'SELF_TRANSFER_NOT_ALLOWED'   => 'Não pode pagar o seu próprio pedido.',
          'RECIPIENT_NOT_FOUND'         => '@${widget.recipientHandle} não encontrado.',
          'RECIPIENT_NO_WALLET'         => 'Destinatário sem carteira activa.',
          'SELF_TRANSFER'               => 'Não pode enviar para si mesmo.',
          'WALLET_NOT_FOUND'            => 'Carteira de destino não encontrada.',
          'NO_WALLET'                   => 'Não tem carteira activa para esta moeda.',
          _                             => e.message.isNotEmpty ? e.message : 'Erro de envio. Tente novamente.',
        };
      });
    } catch (_) {
      if (!mounted) return;
      _pulseCtrl.stop();
      _pulseCtrl.reset();
      HapticFeedback.heavyImpact();
      setState(() { _sending = false; _error = 'Erro de ligação. Tente novamente.'; });
    }
  }

  // ── Review UI builders ─────────────────────────────────────────────────────

  Widget _buildAvatar(String initial) {
    return Container(
      width:  72,
      height: 72,
      decoration: const BoxDecoration(
        gradient: BanzamiGradients.primary,
        shape:    BoxShape.circle,
      ),
      child: Center(
        child: Text(
          initial,
          style: BanzamiTextStyles.headingLg.copyWith(
            color:      BanzamiColors.white,
            fontSize:   28,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  Widget _buildAmountChip(String amount) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BanzamiSpacing.xl,
        vertical:   BanzamiSpacing.md,
      ),
      decoration: BoxDecoration(
        color:        BanzamiColors.primary,
        borderRadius: BorderRadius.circular(BanzamiRadius.full),
      ),
      child: Text(
        amount,
        style: BanzamiTextStyles.monoLg.copyWith(
          color:      BanzamiColors.white,
          fontSize:   26,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
        ),
      ),
    );
  }

  Widget _buildMethodRow() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.xl),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color:        BanzamiColors.gray100,
              borderRadius: BorderRadius.circular(BanzamiRadius.sm),
            ),
            child: const Icon(Icons.account_balance_wallet_rounded,
                size: 18, color: BanzamiColors.primary),
          ),
          const SizedBox(width: BanzamiSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Método de pagamento',
                    style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
                const SizedBox(height: 2),
                Text('Saldo Banzami',
                    style: BanzamiTextStyles.bodyMd.copyWith(
                      color:      BanzamiColors.gray900,
                      fontWeight: FontWeight.w600,
                    )),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildReviewUI() {
    final handle      = widget.recipientHandle;
    final displayName = widget.recipientDisplayName;
    final initial     = (displayName ?? handle)[0].toUpperCase();
    final amount      = widget.locked && widget.amountMinor != null
        ? formatMinor(widget.amountMinor!, widget.currency)
        : null;
    final buttonLabel = widget.locked && widget.amountMinor != null
        ? 'Pagar $amount'
        : 'Pagar';

    return AnimatedOpacity(
      opacity:  _entered ? 1.0 : 0.0,
      duration: BanzamiMotion.slow,
      curve:    Curves.easeOut,
      child: AnimatedSlide(
        offset:   _entered ? Offset.zero : const Offset(0, 0.025),
        duration: BanzamiMotion.slow,
        curve:    BanzamiMotion.decelerate,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(
                  BanzamiSpacing.xl, 40, BanzamiSpacing.xl, BanzamiSpacing.xl,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    // Avatar
                    _buildAvatar(initial),
                    const SizedBox(height: BanzamiSpacing.md),

                    // Handle + display name
                    if (displayName != null) ...[
                      Text(displayName,
                          style: BanzamiTextStyles.headingSm.copyWith(
                            color:      BanzamiColors.gray900,
                            fontWeight: FontWeight.w700,
                          )),
                      const SizedBox(height: 2),
                      Text(widget.recipientSubtitle ?? '@$handle',
                          style: BanzamiTextStyles.bodySm.copyWith(
                              color: BanzamiColors.gray400)),
                    ] else
                      Text('@$handle',
                          style: BanzamiTextStyles.headingSm.copyWith(
                            color:      BanzamiColors.gray900,
                            fontWeight: FontWeight.w700,
                          )),

                    const SizedBox(height: BanzamiSpacing.sm),
                    Text('Solicitou um pagamento',
                        style: BanzamiTextStyles.bodySm.copyWith(
                            color: BanzamiColors.gray400)),

                    const SizedBox(height: BanzamiSpacing.xl),

                    // Amount — locked chip or editable input
                    if (widget.locked && amount != null)
                      _buildAmountChip(amount)
                    else ...[
                      BanzamiAmountInput(
                        initialAmountMinor: widget.amountMinor,
                        onChanged: (v) => setState(() {
                          _amountMinor = v; _amountError = null;
                        }),
                        errorText: _amountError,
                      ),
                    ],

                    // Optional note
                    if (widget.note != null && widget.note!.isNotEmpty) ...[
                      const SizedBox(height: BanzamiSpacing.lg),
                      Text(widget.note!,
                          style: BanzamiTextStyles.bodyMd.copyWith(
                            color:     BanzamiColors.gray600,
                            fontStyle: FontStyle.italic,
                          ),
                          textAlign: TextAlign.center,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis),
                    ],

                    const SizedBox(height: BanzamiSpacing.xxl),
                    const Divider(height: 1, color: BanzamiColors.gray100),
                    const SizedBox(height: BanzamiSpacing.lg),

                    // Payment method
                    _buildMethodRow(),

                    const SizedBox(height: BanzamiSpacing.lg),
                    const Divider(height: 1, color: BanzamiColors.gray100),

                    if (_error != null) ...[
                      const SizedBox(height: BanzamiSpacing.md),
                      BanzamiErrorBanner(message: _error!),
                    ],
                  ],
                ),
              ),
            ),

            // Bottom action
            Padding(
              padding: const EdgeInsets.fromLTRB(
                BanzamiSpacing.xl, 8, BanzamiSpacing.xl, BanzamiSpacing.xl,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  BanzamiPrimaryButton(
                    label:     buttonLabel,
                    isLoading: false,
                    height:    58,
                    onPressed: _pay,
                  ),
                  const SizedBox(height: BanzamiSpacing.sm),
                  Text(
                    'Pagamento irreversível',
                    style: BanzamiTextStyles.bodySm.copyWith(
                      color:    BanzamiColors.gray400,
                      fontSize: 12,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Light/premium progress state (same surface as the rest of the app) ────

  Widget _buildOrb() {
    return Container(
      width:  118,
      height: 118,
      decoration: BoxDecoration(
        shape:    BoxShape.circle,
        gradient: BanzamiGradients.primary,
        boxShadow: [
          BoxShadow(
            color:        BanzamiColors.primary.withValues(alpha: 0.38),
            blurRadius:   52,
            spreadRadius: 6,
          ),
          BoxShadow(
            color:        BanzamiColors.primaryLight.withValues(alpha: 0.20),
            blurRadius:   88,
            spreadRadius: 18,
          ),
        ],
      ),
      child: const Icon(Icons.arrow_upward_rounded, color: BanzamiColors.white, size: 46),
    );
  }

  Widget _buildProgressOverlay() {
    final handle = widget.recipientHandle;
    final amount = widget.locked && widget.amountMinor != null
        ? formatMinor(widget.amountMinor!, widget.currency)
        : formatMinor(_amountMinor, widget.currency);

    return Positioned.fill(
      child: ColoredBox(
        color: BanzamiColors.offWhite,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.xl),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const Spacer(),
                ScaleTransition(
                  scale: _pulseScale,
                  child: _buildOrb(),
                ),
                const SizedBox(height: BanzamiSpacing.xxl + BanzamiSpacing.md),
                Text(
                  'A enviar dinheiro...',
                  style: BanzamiTextStyles.bodyLg.copyWith(
                    color:      BanzamiColors.gray600,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: BanzamiSpacing.xl),
                Text(
                  amount,
                  style: BanzamiTextStyles.monoLg.copyWith(
                    color:      BanzamiColors.gray900,
                    fontSize:   38,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: BanzamiSpacing.sm),
                Text(
                  'para @$handle',
                  style: BanzamiTextStyles.bodyMd.copyWith(
                    color: BanzamiColors.gray400,
                  ),
                ),
                const Spacer(),
                const BanzamiSecondaryButton(label: 'Cancelar', onPressed: null),
                const SizedBox(height: BanzamiSpacing.xl),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return BanzamiScaffold(
      appBar: _sending
          ? null
          : const BanzamiAppBar(title: 'Confirmar pagamento', showBack: true),
      body: Stack(
        children: [
          if (!_sending) SafeArea(child: _buildReviewUI()),
          if (_sending)  _buildProgressOverlay(),
        ],
      ),
    );
  }
}
