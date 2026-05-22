import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:uuid/uuid.dart';

import '../client/api_exception.dart';
import '../client/consumer_public_client.dart';
import '../models/transfer.dart';
import '../theme/banza_theme.dart';
import '../utils/money_format.dart';
import '../widgets/banza_amount_input.dart';
import '../widgets/banza_components.dart';
import 'receipt_screen.dart';

// ── Design tokens ─────────────────────────────────────────────────────────────

const _kBgTop    = Color(0xFF990011);
const _kBgMid    = Color(0xFF5E000A);
const _kBgBottom = Color(0xFF2A0005);
const _kOrbCenter = Color(0x40FFFFFF);
const _kOrbMid    = Color(0x99C21A2C);
const _kOrbEdge   = Color(0xCC5E000A);
const _kGlowInner = Color(0x73C21A2C);
const _kGlowOuter = Color(0x33C21A2C);

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

  @override
  void initState() {
    super.initState();
    _amountMinor = widget.amountMinor ?? 0;
    _pulseCtrl = AnimationController(
      vsync:    this,
      duration: const Duration(milliseconds: 1500),
    );
    _pulseScale = Tween<double>(begin: 0.96, end: 1.04).animate(
      CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut),
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

      if (widget.linkCode != null) {
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

      await Navigator.of(context).push(BanzaPageRoute(
        page: BanzamiReceiptScreen(
          transfer:      transfer,
          ownHandle:     widget.ownHandle,
          onDone:        widget.onSuccess,
          isSandbox:     widget.isSandbox,
          logoAssetPath: widget.logoAssetPath,
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
        gradient: BanzaGradients.wine,
        shape:    BoxShape.circle,
      ),
      child: Center(
        child: Text(
          initial,
          style: BanzaTextStyles.headingLg.copyWith(
            color:      BanzaColors.white,
            fontSize:   28,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  Widget _buildAmountChip(String amount) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      decoration: BoxDecoration(
        color:        BanzaColors.wine,
        borderRadius: BorderRadius.circular(BanzaRadius.full),
      ),
      child: Text(
        amount,
        style: BanzaTextStyles.monoLg.copyWith(
          color:      BanzaColors.white,
          fontSize:   26,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
        ),
      ),
    );
  }

  Widget _buildMethodRow() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: BanzaSpacing.xl),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color:        BanzaColors.gray100,
              borderRadius: BorderRadius.circular(BanzaRadius.sm),
            ),
            child: const Icon(Icons.account_balance_wallet_rounded,
                size: 18, color: BanzaColors.wine),
          ),
          const SizedBox(width: BanzaSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Método de pagamento',
                    style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400)),
                const SizedBox(height: 2),
                Text('Saldo Banza',
                    style: BanzaTextStyles.bodyMd.copyWith(
                      color:      BanzaColors.gray900,
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
      duration: BanzaMotion.slow,
      curve:    Curves.easeOut,
      child: AnimatedSlide(
        offset:   _entered ? Offset.zero : const Offset(0, 0.025),
        duration: BanzaMotion.slow,
        curve:    BanzaMotion.decelerate,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(
                  BanzaSpacing.xl, 40, BanzaSpacing.xl, BanzaSpacing.xl,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    // Avatar
                    _buildAvatar(initial),
                    const SizedBox(height: BanzaSpacing.md),

                    // Handle + display name
                    if (displayName != null) ...[
                      Text(displayName,
                          style: BanzaTextStyles.headingSm.copyWith(
                            color:      BanzaColors.gray900,
                            fontWeight: FontWeight.w700,
                          )),
                      const SizedBox(height: 2),
                      Text('@$handle',
                          style: BanzaTextStyles.bodySm.copyWith(
                              color: BanzaColors.gray400)),
                    ] else
                      Text('@$handle',
                          style: BanzaTextStyles.headingSm.copyWith(
                            color:      BanzaColors.gray900,
                            fontWeight: FontWeight.w700,
                          )),

                    const SizedBox(height: BanzaSpacing.sm),
                    Text('Solicitou um pagamento',
                        style: BanzaTextStyles.bodySm.copyWith(
                            color: BanzaColors.gray500)),

                    const SizedBox(height: BanzaSpacing.xl),

                    // Amount — locked chip or editable input
                    if (widget.locked && amount != null)
                      _buildAmountChip(amount)
                    else ...[
                      BanzaAmountInput(
                        initialAmountMinor: widget.amountMinor,
                        onChanged: (v) => setState(() {
                          _amountMinor = v; _amountError = null;
                        }),
                        errorText: _amountError,
                      ),
                    ],

                    // Optional note
                    if (widget.note != null && widget.note!.isNotEmpty) ...[
                      const SizedBox(height: BanzaSpacing.lg),
                      Text(widget.note!,
                          style: BanzaTextStyles.bodyMd.copyWith(
                            color:     BanzaColors.gray600,
                            fontStyle: FontStyle.italic,
                          ),
                          textAlign: TextAlign.center,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis),
                    ],

                    const SizedBox(height: BanzaSpacing.xxl),
                    const Divider(height: 1, color: BanzaColors.gray100),
                    const SizedBox(height: BanzaSpacing.lg),

                    // Payment method
                    _buildMethodRow(),

                    const SizedBox(height: BanzaSpacing.lg),
                    const Divider(height: 1, color: BanzaColors.gray100),

                    if (_error != null) ...[
                      const SizedBox(height: BanzaSpacing.md),
                      BanzaErrorBanner(message: _error!),
                    ],
                  ],
                ),
              ),
            ),

            // Bottom action
            Padding(
              padding: const EdgeInsets.fromLTRB(
                BanzaSpacing.xl, 8, BanzaSpacing.xl, BanzaSpacing.xl,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  BanzaPrimaryButton(
                    label:     buttonLabel,
                    isLoading: false,
                    height:    58,
                    onPressed: _pay,
                  ),
                  const SizedBox(height: BanzaSpacing.sm),
                  Text(
                    'Pagamento irreversível',
                    style: BanzaTextStyles.bodySm.copyWith(
                      color:    BanzaColors.gray400,
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

  // ── Progress overlay (identical to ConfirmScreen) ─────────────────────────

  Widget _buildOrb() {
    return Container(
      width:  118,
      height: 118,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const RadialGradient(
          center: Alignment(0, -0.30),
          colors: [_kOrbCenter, _kOrbMid, _kOrbEdge],
          stops:  [0.0, 0.50, 1.0],
        ),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.18),
          width: 1.0,
        ),
        boxShadow: [
          BoxShadow(
            color:        const Color(0xFFC21A2C).withValues(alpha: 0.48),
            blurRadius:   52,
            spreadRadius: 10,
          ),
          BoxShadow(
            color:        const Color(0xFFC21A2C).withValues(alpha: 0.20),
            blurRadius:   88,
            spreadRadius: 24,
          ),
        ],
      ),
      child: const Icon(Icons.arrow_upward_rounded, color: Colors.white, size: 46),
    );
  }

  Widget _buildProgressOverlay() {
    final handle = widget.recipientHandle;
    final amount = widget.locked && widget.amountMinor != null
        ? formatMinor(widget.amountMinor!, widget.currency)
        : formatMinor(_amountMinor, widget.currency);

    return Stack(
      children: [
        Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin:  Alignment.topCenter,
              end:    Alignment.bottomCenter,
              colors: [_kBgTop, _kBgMid, _kBgBottom],
              stops:  [0.0, 0.60, 1.0],
            ),
          ),
        ),
        Positioned(
          top: -120, left: -60, right: -60,
          child: Center(
            child: Container(
              width: 520, height: 520,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [_kGlowInner, _kGlowOuter, Colors.transparent],
                  stops:  [0.0, 0.45, 1.0],
                ),
              ),
            ),
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: BanzaSpacing.xl),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const Spacer(),
                ScaleTransition(
                  scale: _pulseScale,
                  child: _buildOrb(),
                ),
                const SizedBox(height: 44),
                Text(
                  'A enviar dinheiro...',
                  style: BanzaTextStyles.bodyLg.copyWith(
                    color:      Colors.white.withValues(alpha: 0.72),
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 28),
                Text(
                  amount,
                  style: BanzaTextStyles.monoLg.copyWith(
                    color:      Colors.white,
                    fontSize:   38,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'para @$handle',
                  style: BanzaTextStyles.bodyMd.copyWith(
                    color:    Colors.white.withValues(alpha: 0.58),
                    fontSize: 15,
                  ),
                ),
                const Spacer(),
                Container(
                  width:  double.infinity,
                  height: 52,
                  decoration: BoxDecoration(
                    border: Border.all(
                        color: Colors.white.withValues(alpha: 0.20)),
                    borderRadius: BorderRadius.circular(BanzaRadius.field),
                  ),
                  child: TextButton(
                    onPressed: null,
                    style: TextButton.styleFrom(
                      disabledForegroundColor: Colors.white.withValues(alpha: 0.42),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(BanzaRadius.field)),
                    ),
                    child: Text('Cancelar',
                        style: BanzaTextStyles.bodyMd.copyWith(fontSize: 15)),
                  ),
                ),
                const SizedBox(height: BanzaSpacing.xl),
              ],
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return BanzaScaffold(
      appBar: _sending
          ? null
          : const BanzaAppBar(title: 'Confirmar pagamento', showBack: true),
      body: Stack(
        children: [
          if (!_sending) SafeArea(child: _buildReviewUI()),
          if (_sending)  _buildProgressOverlay(),
        ],
      ),
    );
  }
}
