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
const _kDotColor   = BanzaColors.wine;

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
  });

  @override
  State<BanzamiConfirmScreen> createState() => _BanzamiConfirmScreenState();
}

class _BanzamiConfirmScreenState extends State<BanzamiConfirmScreen>
    with SingleTickerProviderStateMixin {
  bool    _sending = false;
  String? _error;
  bool    _entered = false; // entrance animation gate

  // Sending overlay animation
  late final AnimationController _sendCtrl;
  late final Animation<double>   _sendFade;
  late final Animation<Offset>   _arrowSlide;

  @override
  void initState() {
    super.initState();
    _sendCtrl = AnimationController(
      vsync:    this,
      duration: const Duration(milliseconds: 900),
    );
    _sendFade = CurvedAnimation(
      parent: _sendCtrl,
      curve:  const Interval(0, 0.4, curve: Curves.easeOut),
    );
    _arrowSlide = Tween<Offset>(
      begin: Offset.zero,
      end:   const Offset(0, -1.5),
    ).animate(CurvedAnimation(
      parent: _sendCtrl,
      curve:  const Interval(0.2, 1.0, curve: Curves.easeInOut),
    ));
    // Trigger card entrance after the first frame.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) setState(() => _entered = true);
    });
  }

  @override
  void dispose() {
    _sendCtrl.dispose();
    super.dispose();
  }

  // ── Transfer logic (unchanged) ─────────────────────────────────────────────

  Future<void> _confirm() async {
    if (_sending) return;
    HapticFeedback.mediumImpact();
    setState(() { _sending = true; _error = null; });
    _sendCtrl.repeat();

    try {
      final transfer = await widget.client.sendByHandle(
        recipientHandle: widget.recipientHandle,
        amountMinor:     widget.amountMinor,
        currency:        widget.currency,
        note:            widget.note,
        idempotencyKey:  widget.idempotencyKey,
      );

      if (!mounted) return;
      _sendCtrl.stop();
      setState(() => _sending = false);

      await Navigator.of(context).push(BanzaPageRoute(
        page: BanzamiReceiptScreen(
          transfer:  transfer,
          ownHandle: widget.ownHandle,
          onDone:    widget.onSuccess,
        ),
      ));
    } on BanzamiApiException catch (e) {
      if (!mounted) return;
      _sendCtrl.stop();
      _sendCtrl.reset();
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
      _sendCtrl.stop();
      _sendCtrl.reset();
      HapticFeedback.heavyImpact();
      setState(() { _sending = false; _error = 'Erro de ligação. Tente novamente.'; });
    }
  }

  // ── Card builders ──────────────────────────────────────────────────────────

  Widget _recipientCard(String initial, String? displayName, String handle) {
    return BanzaCard(
      borderRadius: _kCardBR,
      shadow:       BanzaShadows.cardElevated,
      padding:      const EdgeInsets.all(BanzaSpacing.xl),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Gradient avatar
          Container(
            width:  56,
            height: 56,
            decoration: const BoxDecoration(
              gradient: BanzaGradients.wine,
              shape:    BoxShape.circle,
            ),
            child: Center(
              child: Text(
                initial,
                style: BanzaTextStyles.headingLg.copyWith(
                  color:      BanzaColors.white,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          const SizedBox(width: BanzaSpacing.lg),
          // Text block
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Destinatário',
                  style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
                ),
                const SizedBox(height: 3),
                if (displayName != null) ...[
                  Text(
                    displayName,
                    style: BanzaTextStyles.headingSm.copyWith(
                      color:      BanzaColors.gray900,
                      fontWeight: FontWeight.w700,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '@$handle',
                    style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
                  ),
                ] else
                  Text(
                    '@$handle',
                    style: BanzaTextStyles.headingSm.copyWith(
                      color:      BanzaColors.gray900,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                const SizedBox(height: 10),
                // "Endereço Banza" badge
                DecoratedBox(
                  decoration: BoxDecoration(
                    color:        _kBadgeBg,
                    borderRadius: BorderRadius.circular(BanzaRadius.full),
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
                          style: BanzaTextStyles.label.copyWith(
                            color:      BanzaColors.wine,
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
    return BanzaCard(
      borderRadius: _kCardBR,
      shadow:       BanzaShadows.cardElevated,
      padding: const EdgeInsets.symmetric(
        horizontal: BanzaSpacing.xl,
        vertical:   BanzaSpacing.xxl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(
            'Vai enviar',
            style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
          ),
          const SizedBox(height: BanzaSpacing.sm),
          Text(
            amount,
            style: BanzaTextStyles.monoLg.copyWith(
              fontSize:   40,
              fontWeight: FontWeight.w700,
              color:      BanzaColors.gray900,
            ),
          ),
          const SizedBox(height: BanzaSpacing.lg),
          const Divider(height: 1, color: BanzaColors.gray200),
          const SizedBox(height: BanzaSpacing.lg),
          Text(
            hasNote ? note : 'Sem nota',
            style: BanzaTextStyles.bodyMd.copyWith(
              color:     hasNote ? BanzaColors.gray600 : BanzaColors.gray400,
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

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final displayName = widget.recipientDisplayName;
    final handle      = widget.recipientHandle;
    final initial     = (displayName ?? handle)[0].toUpperCase();
    final amount      = formatMinor(widget.amountMinor, widget.currency);

    return BanzaScaffold(
      appBar: BanzaAppBar(
        title:    'Confirmar envio',
        showBack: !_sending,
      ),
      body: Stack(
        children: [
          // ── Main review UI ───────────────────────────────────────────────
          SafeArea(
            child: AnimatedOpacity(
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
                    // Scrollable card zone
                    Expanded(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(
                          BanzaSpacing.xl, 32, BanzaSpacing.xl, BanzaSpacing.xl,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            _recipientCard(initial, displayName, handle),
                            const SizedBox(height: 16),
                            _amountCard(amount, widget.note),
                            const SizedBox(height: 16),
                            const BanzaWarningBanner(
                              message: 'Confirme os detalhes antes de enviar. Esta acção é irreversível.',
                            ),
                            if (_error != null) ...[
                              const SizedBox(height: BanzaSpacing.md),
                              BanzaErrorBanner(message: _error!),
                            ],
                          ],
                        ),
                      ),
                    ),
                    // Sticky CTA area
                    Padding(
                      padding: const EdgeInsets.fromLTRB(
                        BanzaSpacing.xl, 8, BanzaSpacing.xl, BanzaSpacing.xl,
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          BanzaPrimaryButton(
                            label:     'Confirmar envio',
                            isLoading: false,
                            height:    58,
                            onPressed: _sending ? null : _confirm,
                          ),
                          const SizedBox(height: BanzaSpacing.md),
                          BanzaGhostButton(
                            label:     'Cancelar',
                            onPressed: _sending ? null : () => Navigator.of(context).pop(),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // ── Sending overlay ──────────────────────────────────────────────
          if (_sending)
            AnimatedBuilder(
              animation: _sendCtrl,
              builder: (_, __) => FadeTransition(
                opacity: _sendFade,
                child: Container(
                  color: BanzaColors.offWhite,
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(
                          width:  80,
                          height: 80,
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              Container(
                                width:  80,
                                height: 80,
                                decoration: BoxDecoration(
                                  color:  BanzaColors.wine.withValues(alpha: 0.08),
                                  shape:  BoxShape.circle,
                                ),
                              ),
                              SlideTransition(
                                position: _arrowSlide,
                                child: const Icon(
                                  Icons.arrow_upward_rounded,
                                  color: BanzaColors.wine,
                                  size:  36,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: BanzaSpacing.xl),
                        Text(
                          'A enviar dinheiro…',
                          style: BanzaTextStyles.headingMd.copyWith(color: BanzaColors.gray900),
                        ),
                        const SizedBox(height: BanzaSpacing.sm),
                        Text(
                          amount,
                          style: BanzaTextStyles.monoLg.copyWith(
                            color:      BanzaColors.gray900,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: BanzaSpacing.xs),
                        Text(
                          'para @$handle',
                          style: BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray400),
                        ),
                        const SizedBox(height: BanzaSpacing.xxl),
                        GestureDetector(
                          onTap: () {},
                          child: Text(
                            'Cancelar',
                            style: BanzaTextStyles.bodyMd.copyWith(
                              color: BanzaColors.gray400,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
