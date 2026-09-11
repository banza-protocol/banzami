import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../client/api_exception.dart';
import '../client/consumer_public_client.dart';
import '../models/transfer.dart';
import '../theme/banzami_theme.dart';
import '../utils/error_messages.dart';
import '../utils/money_format.dart';
import '../widgets/banzami_components.dart';
import 'receipt_screen.dart';

// ---------------------------------------------------------------------------
// BanzamiConfirmScreen
// ---------------------------------------------------------------------------

/// Review screen shown between [BanzamiSendScreen] and the actual transfer.
///
/// The transfer executes ONLY when the consumer taps "Confirmar".
/// The [idempotencyKey] was generated once in the send screen and is reused
/// here — retries from this screen are safe (server deduplicates).
class BanzamiConfirmScreen extends StatefulWidget {
  final ConsumerPublicClient client;
  final String recipientHandle;
  final String? recipientDisplayName;
  final int amountMinor;
  final String currency;
  final String? note;
  final String idempotencyKey;
  final String? ownHandle;
  final void Function(Transfer) onSuccess;
  final bool isSandbox;
  final String? logoAssetPath;

  const BanzamiConfirmScreen({
    super.key,
    required this.client,
    required this.recipientHandle,
    this.recipientDisplayName,
    required this.amountMinor,
    this.currency = 'AOA',
    this.note,
    required this.idempotencyKey,
    this.ownHandle,
    required this.onSuccess,
    this.isSandbox = false,
    this.logoAssetPath,
  });

  @override
  State<BanzamiConfirmScreen> createState() => _BanzamiConfirmScreenState();
}

class _BanzamiConfirmScreenState extends State<BanzamiConfirmScreen>
    with SingleTickerProviderStateMixin {
  bool _sending = false;
  String? _error;
  bool _entered = false;

  // Orb pulse animation — replaces the old flat white overlay animation.
  late final AnimationController _pulseCtrl;
  late final Animation<double> _pulseScale;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(
      vsync: this,
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

  // ── Transfer logic (unchanged) ─────────────────────────────────────────────

  Future<void> _confirm() async {
    if (_sending) return;
    HapticFeedback.mediumImpact();
    setState(() {
      _sending = true;
      _error = null;
    });
    _pulseCtrl.repeat(reverse: true);

    try {
      final transfer = await widget.client.sendByHandle(
        recipientHandle: widget.recipientHandle,
        amountMinor: widget.amountMinor,
        currency: widget.currency,
        note: widget.note,
        idempotencyKey: widget.idempotencyKey,
      );

      if (!mounted) return;
      _pulseCtrl.stop();
      _pulseCtrl.reset();
      setState(() => _sending = false);

      await Navigator.of(context).push(BanzamiPageRoute(
        page: BanzamiReceiptScreen(
          transfer: transfer,
          ownHandle: widget.ownHandle,
          onDone: widget.onSuccess,
          isSandbox: widget.isSandbox,
          logoAssetPath: widget.logoAssetPath,
          fetchReceiptPdf: () =>
              widget.client.fetchReceiptPdf(transfer.transferId),
          fetchReceipt: () => widget.client.fetchReceipt(transfer.transferId),
        ),
      ));
    } on BanzamiApiException catch (e) {
      if (!mounted) return;
      _pulseCtrl.stop();
      _pulseCtrl.reset();
      HapticFeedback.heavyImpact();
      setState(() {
        _sending = false;
        _error = banzamiErrorMessage(e, codes: {
          'INSUFFICIENT_FUNDS': 'Saldo insuficiente para esta transferência.',
          'RECIPIENT_NOT_FOUND': '@${widget.recipientHandle} não existe.',
        });
      });
    } catch (_) {
      if (!mounted) return;
      _pulseCtrl.stop();
      _pulseCtrl.reset();
      HapticFeedback.heavyImpact();
      setState(() {
        _sending = false;
        _error = 'Erro de ligação. Tente novamente.';
      });
    }
  }

  // ── Card builders ──────────────────────────────────────────────────────────

  Widget _recipientCard(String initial, String? displayName, String handle) {
    return BanzamiCard(
      shadow: BanzamiShadows.cardElevated,
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: const BoxDecoration(
              gradient: BanzamiGradients.primary,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                initial,
                style: BanzamiTextStyles.headingLg.copyWith(
                  color: BanzamiColors.white,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          const SizedBox(width: BanzamiSpacing.lg),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Destinatário',
                  style: BanzamiTextStyles.bodySm
                      .copyWith(color: BanzamiColors.gray400),
                ),
                const SizedBox(height: 3),
                if (displayName != null) ...[
                  Text(
                    displayName,
                    style: BanzamiTextStyles.headingSm.copyWith(
                      color: BanzamiColors.gray900,
                      fontWeight: FontWeight.w700,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '@$handle',
                    style: BanzamiTextStyles.bodySm
                        .copyWith(color: BanzamiColors.gray400),
                  ),
                ] else
                  Text(
                    '@$handle',
                    style: BanzamiTextStyles.headingSm.copyWith(
                      color: BanzamiColors.gray900,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                const SizedBox(height: 10),
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: BanzamiColors.primary.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(BanzamiRadius.full),
                  ),
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 5,
                          height: 5,
                          decoration: const BoxDecoration(
                            color: BanzamiColors.primary,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 5),
                        Text(
                          'Endereço @banza',
                          style: BanzamiTextStyles.label.copyWith(
                            color: BanzamiColors.primary,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _amountCard(String amount, String? note) {
    final hasNote = note != null && note.isNotEmpty;
    return BanzamiCard(
      shadow: BanzamiShadows.cardElevated,
      padding: const EdgeInsets.symmetric(
        horizontal: BanzamiSpacing.xl,
        vertical: BanzamiSpacing.xxl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(
            'Vai enviar',
            style:
                BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
          ),
          const SizedBox(height: BanzamiSpacing.sm),
          Text(
            amount,
            style: BanzamiTextStyles.monoLg.copyWith(
              fontSize: 40,
              fontWeight: FontWeight.w700,
              color: BanzamiColors.gray900,
            ),
          ),
          const SizedBox(height: BanzamiSpacing.lg),
          const Divider(height: 1, color: BanzamiColors.gray200),
          const SizedBox(height: BanzamiSpacing.lg),
          Text(
            hasNote ? note : 'Sem nota',
            style: BanzamiTextStyles.bodyMd.copyWith(
              color: hasNote ? BanzamiColors.gray600 : BanzamiColors.gray400,
              fontStyle: hasNote ? FontStyle.normal : FontStyle.italic,
            ),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  // ── Transfer-progress overlay ──────────────────────────────────────────────

  // Light/premium in-progress state — same offWhite surface as the rest of the
  // app. The cherry orb pulses while the transfer posts; no dark immersive theme.
  Widget _buildProgressOverlay(String amount, String handle) {
    return Positioned.fill(
      child: ColoredBox(
        color: BanzamiColors.offWhite,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.xl),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const SizedBox(height: BanzamiSpacing.xl),

                // ── Orb ─────────────────────────────────────────────────────
                const Spacer(),
                ScaleTransition(
                  scale: _pulseScale,
                  child: _buildOrb(),
                ),
                const SizedBox(height: BanzamiSpacing.xxl + BanzamiSpacing.md),

                // ── Status text ──────────────────────────────────────────────
                Text(
                  'A enviar dinheiro...',
                  style: BanzamiTextStyles.bodyLg.copyWith(
                    color: BanzamiColors.gray600,
                    fontWeight: FontWeight.w500,
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: BanzamiSpacing.xl),

                // ── Amount ───────────────────────────────────────────────────
                Text(
                  amount,
                  style: BanzamiTextStyles.monoLg.copyWith(
                    color: BanzamiColors.gray900,
                    fontSize: 38,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: BanzamiSpacing.sm),

                // ── Recipient ────────────────────────────────────────────────
                Text(
                  'para @$handle',
                  style: BanzamiTextStyles.bodyMd.copyWith(
                    color: BanzamiColors.gray400,
                    fontWeight: FontWeight.w400,
                  ),
                ),
                const Spacer(),

                // ── Cancel button (disabled — request already dispatched) ────
                const BanzamiSecondaryButton(
                    label: 'Cancelar', onPressed: null),
                const SizedBox(height: BanzamiSpacing.xl),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // Cherry orb on the light surface — same primary gradient as the home
  // balance card / avatars, with a soft cherry glow.
  Widget _buildOrb() {
    return Container(
      width: 118,
      height: 118,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: BanzamiGradients.primary,
        boxShadow: [
          BoxShadow(
            color: BanzamiColors.primary.withValues(alpha: 0.38),
            blurRadius: 52,
            spreadRadius: 6,
          ),
          BoxShadow(
            color: BanzamiColors.primaryLight.withValues(alpha: 0.20),
            blurRadius: 88,
            spreadRadius: 18,
          ),
        ],
      ),
      child: const Icon(
        Icons.arrow_upward_rounded,
        color: BanzamiColors.white,
        size: 46,
      ),
    );
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final displayName = widget.recipientDisplayName;
    final handle = widget.recipientHandle;
    final initial = (displayName ?? handle)[0].toUpperCase();
    final amount = formatMinor(widget.amountMinor, widget.currency);

    return BanzamiScaffold(
      // Hide the AppBar while sending — the overlay fills full-screen.
      appBar: _sending
          ? null
          : const BanzamiAppBar(title: 'Confirmar envio', showBack: true),
      body: Stack(
        children: [
          // ── Review UI ──────────────────────────────────────────────────────
          if (!_sending)
            SafeArea(
              child: AnimatedOpacity(
                opacity: _entered ? 1.0 : 0.0,
                duration: BanzamiMotion.slow,
                curve: Curves.easeOut,
                child: AnimatedSlide(
                  offset: _entered ? Offset.zero : const Offset(0, 0.025),
                  duration: BanzamiMotion.slow,
                  curve: BanzamiMotion.decelerate,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.fromLTRB(
                            BanzamiSpacing.xl,
                            32,
                            BanzamiSpacing.xl,
                            BanzamiSpacing.xl,
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              _recipientCard(initial, displayName, handle),
                              const SizedBox(height: 16),
                              _amountCard(amount, widget.note),
                              const SizedBox(height: 16),
                              const BanzamiWarningBanner(
                                message:
                                    'Confirme os detalhes antes de enviar. Esta acção é irreversível.',
                              ),
                              if (_error != null) ...[
                                const SizedBox(height: BanzamiSpacing.md),
                                BanzamiErrorBanner(message: _error!),
                              ],
                            ],
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(
                          BanzamiSpacing.xl,
                          8,
                          BanzamiSpacing.xl,
                          BanzamiSpacing.xl,
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            BanzamiPrimaryButton(
                              label: 'Confirmar envio',
                              isLoading: false,
                              height: 58,
                              onPressed: _confirm,
                            ),
                            const SizedBox(height: BanzamiSpacing.md),
                            BanzamiGhostButton(
                              label: 'Cancelar',
                              onPressed: () => Navigator.of(context).pop(),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

          // ── Premium transfer-progress overlay ──────────────────────────────
          if (_sending) _buildProgressOverlay(amount, handle),
        ],
      ),
    );
  }
}
