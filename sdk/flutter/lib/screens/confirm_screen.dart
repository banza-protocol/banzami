import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../client/api_exception.dart';
import '../client/consumer_public_client.dart';
import '../models/transfer.dart';
import '../theme/banza_theme.dart';
import '../utils/money_format.dart';
import '../widgets/banza_components.dart';
import 'receipt_screen.dart';

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
  }

  @override
  void dispose() {
    _sendCtrl.dispose();
    super.dispose();
  }

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
          // ── Review UI ───────────────────────────────────────────────────
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: BanzaSpacing.xl),
              child: Column(
                children: [
                  const Spacer(),

                  // Recipient avatar
                  Container(
                    width:  80,
                    height: 80,
                    decoration: const BoxDecoration(
                      gradient: BanzaGradients.wine,
                      shape:    BoxShape.circle,
                    ),
                    child: Center(
                      child: Text(
                        initial,
                        style: BanzaTextStyles.headingLg.copyWith(
                          color:      BanzaColors.white,
                          fontSize:   30,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: BanzaSpacing.md),

                  if (displayName != null) ...[
                    Text(displayName, style: BanzaTextStyles.headingMd),
                    const SizedBox(height: 4),
                  ],

                  Text(
                    '@$handle',
                    style: BanzaTextStyles.bodyMd.copyWith(
                      color:      displayName != null ? BanzaColors.gray400 : BanzaColors.gray900,
                      fontWeight: FontWeight.w600,
                    ),
                  ),

                  const Spacer(),

                  // Amount block
                  BanzaCard(
                    padding: const EdgeInsets.symmetric(
                      horizontal: BanzaSpacing.xl,
                      vertical:   BanzaSpacing.lg,
                    ),
                    color:  BanzaColors.gray100,
                    shadow: BanzaShadows.none,
                    child: Column(
                      children: [
                        Text(
                          'Vai enviar',
                          style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
                        ),
                        const SizedBox(height: BanzaSpacing.xs),
                        Text(
                          amount,
                          style: BanzaTextStyles.monoLg.copyWith(color: BanzaColors.gray900),
                        ),
                        if (widget.note != null && widget.note!.isNotEmpty) ...[
                          const SizedBox(height: BanzaSpacing.sm),
                          Divider(height: 1, color: BanzaColors.gray200),
                          const SizedBox(height: BanzaSpacing.sm),
                          Text(
                            widget.note!,
                            style: BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray600),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ],
                    ),
                  ),

                  const Spacer(),

                  const BanzaWarningBanner(
                    message: 'Confirme os detalhes antes de enviar. Esta acção é irreversível.',
                  ),

                  const SizedBox(height: BanzaSpacing.xl),

                  if (_error != null) ...[
                    BanzaErrorBanner(message: _error!),
                    const SizedBox(height: BanzaSpacing.md),
                  ],

                  BanzaPrimaryButton(
                    label:     'Confirmar envio',
                    isLoading: false,
                    onPressed: _sending ? null : _confirm,
                  ),
                  const SizedBox(height: BanzaSpacing.sm),

                  BanzaGhostButton(
                    label:     'Cancelar',
                    onPressed: _sending ? null : () => Navigator.of(context).pop(),
                  ),

                  const SizedBox(height: BanzaSpacing.xl),
                ],
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
                        // Animated upward arrow
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
