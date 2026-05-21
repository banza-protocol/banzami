import 'package:flutter/material.dart';

import '../client/api_exception.dart';
import '../client/consumer_public_client.dart';
import '../models/transfer.dart';
import '../theme/banza_theme.dart';
import '../utils/money_format.dart';
import '../widgets/banza_button.dart';
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

class _BanzamiConfirmScreenState extends State<BanzamiConfirmScreen> {
  bool    _sending = false;
  String? _error;

  Future<void> _confirm() async {
    if (_sending) return;
    setState(() { _sending = true; _error = null; });

    try {
      final transfer = await widget.client.sendByHandle(
        recipientHandle: widget.recipientHandle,
        amountMinor:     widget.amountMinor,
        currency:        widget.currency,
        note:            widget.note,
        idempotencyKey:  widget.idempotencyKey,
      );

      if (!mounted) return;
      setState(() => _sending = false);

      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => BanzamiReceiptScreen(
          transfer:  transfer,
          ownHandle: widget.ownHandle,
          onDone:    widget.onSuccess,
        ),
      ));
    } on BanzamiApiException catch (e) {
      if (!mounted) return;
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
      setState(() { _sending = false; _error = 'Erro de ligação. Tente novamente.'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final displayName = widget.recipientDisplayName;
    final handle      = widget.recipientHandle;
    final initial     = (displayName ?? handle)[0].toUpperCase();
    final amount      = formatMinor(widget.amountMinor, widget.currency);

    return Scaffold(
      backgroundColor: BanzaColors.white,
      appBar: AppBar(
        title:           const Text('Confirmar envio', style: BanzaTextStyles.headingSm),
        backgroundColor: BanzaColors.white,
        foregroundColor: BanzaColors.gray900,
        elevation:       0,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: BanzaSpacing.xl),
          child: Column(
            children: [
              const Spacer(),

              // Recipient avatar
              Container(
                width:       72,
                height:      72,
                decoration:  const BoxDecoration(
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

              // Amount
              Text(
                'Vai enviar',
                style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
              ),
              const SizedBox(height: BanzaSpacing.xs),
              Text(
                amount,
                style: BanzaTextStyles.mono.copyWith(
                  fontSize:   42,
                  fontWeight: FontWeight.w700,
                  color:      BanzaColors.gray900,
                ),
              ),

              if (widget.note != null && widget.note!.isNotEmpty) ...[
                const SizedBox(height: BanzaSpacing.md),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: BanzaSpacing.lg,
                    vertical:   BanzaSpacing.sm,
                  ),
                  decoration: const BoxDecoration(
                    color:        BanzaColors.gray100,
                    borderRadius: BanzaRadius.fullAll,
                  ),
                  child: Text(
                    widget.note!,
                    style: BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray600),
                  ),
                ),
              ],

              const Spacer(),

              if (_error != null) ...[
                Text(
                  _error!,
                  style:     BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.error),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: BanzaSpacing.md),
              ],

              BanzaButton(
                label:     'Confirmar',
                isLoading: _sending,
                onPressed: _confirm,
              ),
              const SizedBox(height: BanzaSpacing.sm),

              SizedBox(
                width: double.infinity,
                child: TextButton(
                  onPressed: _sending ? null : () => Navigator.of(context).pop(),
                  child: Text(
                    'Cancelar',
                    style: BanzaTextStyles.bodyMd.copyWith(
                      color: _sending ? BanzaColors.gray400 : BanzaColors.gray600,
                    ),
                  ),
                ),
              ),

              const SizedBox(height: BanzaSpacing.xl),
            ],
          ),
        ),
      ),
    );
  }
}
