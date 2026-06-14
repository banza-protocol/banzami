import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../client/api_exception.dart';
import '../client/consumer_public_client.dart';
import '../models/transfer.dart';
import '../theme/banza_theme.dart';
import '../utils/money_format.dart';
import '../widgets/banza_components.dart';
import 'receipt_screen.dart';

// ── Local design tokens ───────────────────────────────────────────────────────

const _kCardRadius = 28.0;
const _kCardBR     = BorderRadius.all(Radius.circular(_kCardRadius));
const _kBadgeBg    = Color(0x14990011); // wine 8 %
const _kDotColor   = BanzamiColors.wine;

// ── Transfer-progress overlay colours ─────────────────────────────────────────

const _kOrbCenter  = Color(0x40FFFFFF); // white 25 %
const _kOrbMid     = Color(0x99C21A2C); // cherry 60 %
const _kOrbEdge    = Color(0xCC5E000A); // deep-shadow 80 %
const _kGlowInner  = Color(0x73C21A2C); // cherry glow inner 45 %
const _kGlowOuter  = Color(0x33C21A2C); // cherry glow outer 20 %
const _kBgTop      = Color(0xFFB5101F);
const _kBgMid      = Color(0xFF9A1B22);
const _kBgBottom   = Color(0xFF2A0005);

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
  final String  recipientHandle;
  final String? recipientDisplayName;
  final int     amountMinor;
  final String  currency;
  final String? note;
  final String  idempotencyKey;
  final String? ownHandle;
  final void Function(Transfer) onSuccess;
  final bool    isSandbox;
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
    this.isSandbox     = false,
    this.logoAssetPath,
  });

  @override
  State<BanzamiConfirmScreen> createState() => _BanzamiConfirmScreenState();
}

class _BanzamiConfirmScreenState extends State<BanzamiConfirmScreen>
    with SingleTickerProviderStateMixin {
  bool    _sending = false;
  String? _error;
  bool    _entered = false;

  // Orb pulse animation — replaces the old flat white overlay animation.
  late final AnimationController _pulseCtrl;
  late final Animation<double>   _pulseScale;

  @override
  void initState() {
    super.initState();
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

  // ── Transfer logic (unchanged) ─────────────────────────────────────────────

  Future<void> _confirm() async {
    if (_sending) return;
    HapticFeedback.mediumImpact();
    setState(() { _sending = true; _error = null; });
    _pulseCtrl.repeat(reverse: true);

    try {
      final transfer = await widget.client.sendByHandle(
        recipientHandle: widget.recipientHandle,
        amountMinor:     widget.amountMinor,
        currency:        widget.currency,
        note:            widget.note,
        idempotencyKey:  widget.idempotencyKey,
      );

      if (!mounted) return;
      _pulseCtrl.stop();
      _pulseCtrl.reset();
      setState(() => _sending = false);

      await Navigator.of(context).push(BanzamiPageRoute(
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
          'INSUFFICIENT_FUNDS'  => 'Saldo insuficiente para esta transferência.',
          'RECIPIENT_NOT_FOUND' => '@${widget.recipientHandle} não encontrado.',
          'RECIPIENT_NO_WALLET' => 'Destinatário sem carteira activa.',
          'SELF_TRANSFER'       => 'Não pode enviar para si mesmo.',
          'INVALID_AMOUNT'      => 'Montante inválido.',
          _                     => e.message.isNotEmpty ? e.message : 'Erro de envio. Tente novamente.',
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

  // ── Card builders ──────────────────────────────────────────────────────────

  Widget _recipientCard(String initial, String? displayName, String handle) {
    return BanzamiCard(
      borderRadius: _kCardBR,
      shadow:       BanzamiShadows.cardElevated,
      padding:      const EdgeInsets.all(BanzamiSpacing.xl),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width:  56,
            height: 56,
            decoration: const BoxDecoration(
              gradient: BanzamiGradients.wine,
              shape:    BoxShape.circle,
            ),
            child: Center(
              child: Text(
                initial,
                style: BanzamiTextStyles.headingLg.copyWith(
                  color:      BanzamiColors.white,
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
                  style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
                ),
                const SizedBox(height: 3),
                if (displayName != null) ...[
                  Text(
                    displayName,
                    style: BanzamiTextStyles.headingSm.copyWith(
                      color:      BanzamiColors.gray900,
                      fontWeight: FontWeight.w700,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '@$handle',
                    style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
                  ),
                ] else
                  Text(
                    '@$handle',
                    style: BanzamiTextStyles.headingSm.copyWith(
                      color:      BanzamiColors.gray900,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                const SizedBox(height: 10),
                DecoratedBox(
                  decoration: BoxDecoration(
                    color:        _kBadgeBg,
                    borderRadius: BorderRadius.circular(BanzamiRadius.full),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width:  5,
                          height: 5,
                          decoration: const BoxDecoration(
                            color: _kDotColor,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 5),
                        Text(
                          'Endereço Banza',
                          style: BanzamiTextStyles.label.copyWith(
                            color:      BanzamiColors.wine,
                            fontSize:   11,
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
      borderRadius: _kCardBR,
      shadow:       BanzamiShadows.cardElevated,
      padding: const EdgeInsets.symmetric(
        horizontal: BanzamiSpacing.xl,
        vertical:   BanzamiSpacing.xxl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(
            'Vai enviar',
            style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
          ),
          const SizedBox(height: BanzamiSpacing.sm),
          Text(
            amount,
            style: BanzamiTextStyles.monoLg.copyWith(
              fontSize:   40,
              fontWeight: FontWeight.w700,
              color:      BanzamiColors.gray900,
            ),
          ),
          const SizedBox(height: BanzamiSpacing.lg),
          const Divider(height: 1, color: BanzamiColors.gray200),
          const SizedBox(height: BanzamiSpacing.lg),
          Text(
            hasNote ? note : 'Sem nota',
            style: BanzamiTextStyles.bodyMd.copyWith(
              color:     hasNote ? BanzamiColors.gray600 : BanzamiColors.gray400,
              fontStyle: hasNote ? FontStyle.normal   : FontStyle.italic,
            ),
            textAlign: TextAlign.center,
            maxLines:  2,
            overflow:  TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  // ── Transfer-progress overlay ──────────────────────────────────────────────

  Widget _buildProgressOverlay(String amount, String handle) {
    return Stack(
      children: [
        // Deep cherry gradient — fills entire screen when AppBar is null.
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

        // Radial ambient glow (top-centre, large, static — cheap).
        Positioned(
          top:   -120,
          left:  -60,
          right: -60,
          child: Center(
            child: Container(
              width:  520,
              height: 520,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [_kGlowInner, _kGlowOuter, Colors.transparent],
                  stops:  [0.0,         0.45,         1.0],
                ),
              ),
            ),
          ),
        ),

        // Content — full-screen column with safe area.
        SafeArea(
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
                const SizedBox(height: 44),

                // ── Status text ──────────────────────────────────────────────
                Text(
                  'A enviar dinheiro...',
                  style: BanzamiTextStyles.bodyLg.copyWith(
                    color:      Colors.white.withValues(alpha: 0.72),
                    fontWeight: FontWeight.w500,
                    height:     1.5,
                  ),
                ),
                const SizedBox(height: 28),

                // ── Amount ───────────────────────────────────────────────────
                Text(
                  amount,
                  style: BanzamiTextStyles.monoLg.copyWith(
                    color:      Colors.white,
                    fontSize:   38,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),

                // ── Recipient ────────────────────────────────────────────────
                Text(
                  'para @$handle',
                  style: BanzamiTextStyles.bodyMd.copyWith(
                    color:      Colors.white.withValues(alpha: 0.58),
                    fontWeight: FontWeight.w400,
                    fontSize:   15,
                  ),
                ),
                const Spacer(),

                // ── Cancel button (disabled — request already dispatched) ────
                _buildCancelButton(),
                const SizedBox(height: BanzamiSpacing.xl),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildOrb() {
    return Container(
      width:  118,
      height: 118,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const RadialGradient(
          center: Alignment(0, -0.30),
          colors: [_kOrbCenter, _kOrbMid, _kOrbEdge],
          stops:  [0.0,          0.50,     1.0],
        ),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.18),
          width: 1.0,
        ),
        boxShadow: [
          BoxShadow(
            color:        const Color(0xFFE8434B).withValues(alpha: 0.48),
            blurRadius:   52,
            spreadRadius: 10,
          ),
          BoxShadow(
            color:        const Color(0xFFE8434B).withValues(alpha: 0.20),
            blurRadius:   88,
            spreadRadius: 24,
          ),
        ],
      ),
      child: const Icon(
        Icons.arrow_upward_rounded,
        color: Colors.white,
        size:  46,
      ),
    );
  }

  Widget _buildCancelButton() {
    return Container(
      width:  double.infinity,
      height: 52,
      decoration: BoxDecoration(
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.20),
          width: 1.0,
        ),
        borderRadius: BorderRadius.circular(BanzamiRadius.field),
      ),
      child: TextButton(
        // Always disabled: by the time this overlay is visible, the
        // HTTP request is already in-flight. Cancellation is not possible.
        onPressed: null,
        style: TextButton.styleFrom(
          disabledForegroundColor: Colors.white.withValues(alpha: 0.42),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(BanzamiRadius.field),
          ),
        ),
        child: Text(
          'Cancelar',
          style: BanzamiTextStyles.bodyMd.copyWith(
            fontSize:   15,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final displayName = widget.recipientDisplayName;
    final handle      = widget.recipientHandle;
    final initial     = (displayName ?? handle)[0].toUpperCase();
    final amount      = formatMinor(widget.amountMinor, widget.currency);

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
                            BanzamiSpacing.xl, 32, BanzamiSpacing.xl, BanzamiSpacing.xl,
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              _recipientCard(initial, displayName, handle),
                              const SizedBox(height: 16),
                              _amountCard(amount, widget.note),
                              const SizedBox(height: 16),
                              const BanzamiWarningBanner(
                                message: 'Confirme os detalhes antes de enviar. Esta acção é irreversível.',
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
                          BanzamiSpacing.xl, 8, BanzamiSpacing.xl, BanzamiSpacing.xl,
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            BanzamiPrimaryButton(
                              label:     'Confirmar envio',
                              isLoading: false,
                              height:    58,
                              onPressed: _confirm,
                            ),
                            const SizedBox(height: BanzamiSpacing.md),
                            BanzamiGhostButton(
                              label:     'Cancelar',
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
