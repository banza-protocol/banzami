import 'package:flutter/material.dart';

import '../client/api_exception.dart';
import '../client/banzami_client.dart';
import '../models/consumer.dart';
import '../models/transfer.dart';
import '../theme/banzami_theme.dart';
import '../widgets/banzami_amount_input.dart';
import '../widgets/banzami_button.dart';

/// Two-step P2P send flow:
///   Step 1 — enter @handle and confirm recipient
///   Step 2 — enter amount and confirm transfer
class BanzamiSendScreen extends StatefulWidget {
  final BanzamiClient client;
  final String senderId;
  final void Function(Transfer transfer) onSuccess;

  const BanzamiSendScreen({
    super.key,
    required this.client,
    required this.senderId,
    required this.onSuccess,
  });

  @override
  State<BanzamiSendScreen> createState() => _BanzamiSendScreenState();
}

class _BanzamiSendScreenState extends State<BanzamiSendScreen> {
  final _handleController = TextEditingController();
  final _descController   = TextEditingController();

  Consumer? _recipient;
  int       _amountMinor = 0;
  bool      _lookingUp   = false;
  bool      _sending     = false;
  String?   _handleError;
  String?   _amountError;
  String?   _sendError;

  @override
  void dispose() {
    _handleController.dispose();
    _descController.dispose();
    super.dispose();
  }

  Future<void> _lookupHandle() async {
    final raw = _handleController.text.trim().replaceAll('@', '');
    if (raw.isEmpty) {
      setState(() => _handleError = 'Introduza um @handle');
      return;
    }
    setState(() { _lookingUp = true; _handleError = null; _recipient = null; });
    try {
      final consumer = await widget.client.getConsumerByHandle(raw);
      setState(() { _recipient = consumer; });
    } on BanzamiApiException catch (e) {
      setState(() => _handleError = e.isNotFound ? 'Handle não encontrado' : e.message);
    } catch (_) {
      setState(() => _handleError = 'Erro de ligação. Tente novamente.');
    } finally {
      setState(() => _lookingUp = false);
    }
  }

  Future<void> _send() async {
    if (_amountMinor <= 0) {
      setState(() => _amountError = 'Introduza um montante válido');
      return;
    }
    setState(() { _sending = true; _sendError = null; _amountError = null; });
    try {
      final transfer = await widget.client.sendTransfer(
        senderId:    widget.senderId,
        recipientId: _recipient!.id,
        amountMinor: _amountMinor,
        description: _descController.text.trim().isEmpty ? null : _descController.text.trim(),
      );
      widget.onSuccess(transfer);
    } on BanzamiApiException catch (e) {
      setState(() => _sendError = switch (e.code) {
        'INSUFFICIENT_FUNDS' => 'Saldo insuficiente',
        'WALLET_NOT_FOUND'   => 'Destinatário sem carteira activa',
        'WALLET_NOT_ACTIVE'  => 'Carteira do destinatário suspensa',
        _                    => e.message,
      });
    } catch (_) {
      setState(() => _sendError = 'Erro de ligação. Tente novamente.');
    } finally {
      setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.white,
      appBar: AppBar(
        title: const Text('Enviar'),
        backgroundColor: BanzamiColors.white,
        foregroundColor: BanzamiColors.gray900,
        elevation: 0,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(BanzamiSpacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Handle lookup
              const Text('Para quem?', style: BanzamiTextStyles.headingSm),
              const SizedBox(height: BanzamiSpacing.sm),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _handleController,
                      decoration: InputDecoration(
                        hintText:  '@handle',
                        errorText: _handleError,
                        prefixText: '@',
                      ),
                      onSubmitted: (_) => _lookupHandle(),
                      textInputAction: TextInputAction.search,
                    ),
                  ),
                  const SizedBox(width: BanzamiSpacing.sm),
                  SizedBox(
                    height: 48,
                    child: BanzamiButton(
                      label:     'OK',
                      fullWidth: false,
                      isLoading: _lookingUp,
                      onPressed: _lookupHandle,
                    ),
                  ),
                ],
              ),

              // Recipient card
              if (_recipient != null) ...[
                const SizedBox(height: BanzamiSpacing.lg),
                _RecipientCard(consumer: _recipient!),
              ],

              // Amount + confirm (only shown once recipient is confirmed)
              if (_recipient != null) ...[
                const SizedBox(height: BanzamiSpacing.xl),
                const Text('Montante', style: BanzamiTextStyles.headingSm),
                const SizedBox(height: BanzamiSpacing.sm),
                BanzamiAmountInput(
                  onChanged:  (v) => setState(() { _amountMinor = v; _amountError = null; }),
                  errorText:  _amountError,
                ),
                const SizedBox(height: BanzamiSpacing.lg),
                TextField(
                  controller:  _descController,
                  decoration:  const InputDecoration(hintText: 'Descrição (opcional)'),
                  maxLength:   120,
                  buildCounter: (_, {required currentLength, required isFocused, maxLength}) => null,
                ),
                const Spacer(),
                if (_sendError != null) ...[
                  _ErrorBanner(message: _sendError!),
                  const SizedBox(height: BanzamiSpacing.md),
                ],
                BanzamiButton(
                  label:     'Confirmar envio',
                  isLoading: _sending,
                  onPressed: _send,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _RecipientCard extends StatelessWidget {
  final Consumer consumer;
  const _RecipientCard({required this.consumer});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding:    const EdgeInsets.all(BanzamiSpacing.lg),
      decoration: const BoxDecoration(
        color:        BanzamiColors.gray100,
        borderRadius: BanzamiRadius.lgAll,
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: BanzamiColors.wine.withValues(alpha: 0.12),
            child: Text(
              consumer.handle[0].toUpperCase(),
              style: BanzamiTextStyles.headingMd.copyWith(color: BanzamiColors.wine),
            ),
          ),
          const SizedBox(width: BanzamiSpacing.md),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(consumer.displayLabel, style: BanzamiTextStyles.headingSm),
              Text('@${consumer.handle}', style: BanzamiTextStyles.bodySm),
            ],
          ),
          const Spacer(),
          const Icon(Icons.check_circle_rounded, color: BanzamiColors.success, size: 20),
        ],
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  final String message;
  const _ErrorBanner({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding:    const EdgeInsets.all(BanzamiSpacing.md),
      decoration: BoxDecoration(
        color:        BanzamiColors.errorBg,
        borderRadius: BanzamiRadius.mdAll,
        border:       Border.all(color: BanzamiColors.error.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline_rounded, color: BanzamiColors.error, size: 18),
          const SizedBox(width: BanzamiSpacing.sm),
          Expanded(
            child: Text(
              message,
              style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.error),
            ),
          ),
        ],
      ),
    );
  }
}
