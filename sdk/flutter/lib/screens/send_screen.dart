import 'package:flutter/material.dart';

import '../client/api_exception.dart';
import '../client/consumer_public_client.dart';
import '../models/transfer.dart';
import '../theme/banzami_theme.dart';
import '../widgets/banzami_amount_input.dart';
import '../widgets/banzami_button.dart';

/// P2P send flow — enter recipient @handle, amount, and optional description.
///
/// Uses [ConsumerPublicClient.sendByHandle] which resolves the recipient
/// on the server side; no separate handle-lookup step is needed.
class BanzamiSendScreen extends StatefulWidget {
  final ConsumerPublicClient client;
  final void Function(Transfer transfer) onSuccess;

  const BanzamiSendScreen({
    super.key,
    required this.client,
    required this.onSuccess,
  });

  @override
  State<BanzamiSendScreen> createState() => _BanzamiSendScreenState();
}

class _BanzamiSendScreenState extends State<BanzamiSendScreen> {
  final _handleCtrl = TextEditingController();
  final _descCtrl   = TextEditingController();

  int     _amountMinor = 0;
  bool    _sending     = false;
  String? _handleError;
  String? _amountError;
  String? _sendError;

  @override
  void dispose() {
    _handleCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final handle = _handleCtrl.text.trim().replaceAll('@', '').toLowerCase();
    if (handle.isEmpty) {
      setState(() => _handleError = 'Introduza um @handle');
      return;
    }
    if (_amountMinor <= 0) {
      setState(() => _amountError = 'Introduza um montante válido');
      return;
    }
    setState(() { _sending = true; _sendError = null; _handleError = null; _amountError = null; });

    try {
      final transfer = await widget.client.sendByHandle(
        recipientHandle: handle,
        amountMinor:     _amountMinor,
        description:     _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim(),
      );
      widget.onSuccess(transfer);
    } on BanzamiApiException catch (e) {
      setState(() => _sendError = switch (e.code) {
        'INSUFFICIENT_FUNDS'  => 'Saldo insuficiente',
        'RECIPIENT_NOT_FOUND' => 'Handle não encontrado',
        'RECIPIENT_NO_WALLET' => 'Destinatário sem carteira activa',
        _                     => e.message,
      });
    } catch (_) {
      setState(() => _sendError = 'Erro de ligação. Tente novamente.');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.white,
      appBar: AppBar(
        title:           const Text('Enviar'),
        backgroundColor: BanzamiColors.white,
        foregroundColor: BanzamiColors.gray900,
        elevation:       0,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(BanzamiSpacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Para quem?', style: BanzamiTextStyles.headingSm),
              const SizedBox(height: BanzamiSpacing.sm),
              TextField(
                controller:      _handleCtrl,
                decoration: InputDecoration(
                  hintText:  'handle do destinatário',
                  prefixText: '@',
                  errorText: _handleError,
                ),
                autocorrect:     false,
                textInputAction: TextInputAction.next,
                onChanged: (_) => setState(() { _handleError = null; _sendError = null; }),
              ),

              const SizedBox(height: BanzamiSpacing.xl),
              const Text('Quanto?', style: BanzamiTextStyles.headingSm),
              const SizedBox(height: BanzamiSpacing.sm),
              BanzamiAmountInput(
                onChanged:  (v) => setState(() { _amountMinor = v; _amountError = null; }),
                errorText:  _amountError,
              ),

              const SizedBox(height: BanzamiSpacing.xl),
              const Text('Descrição (opcional)', style: BanzamiTextStyles.headingSm),
              const SizedBox(height: BanzamiSpacing.sm),
              TextField(
                controller:      _descCtrl,
                decoration: const InputDecoration(hintText: 'Ex: jantar de ontem'),
                textInputAction: TextInputAction.done,
                onSubmitted:     (_) => _send(),
              ),

              if (_sendError != null) ...[
                const SizedBox(height: BanzamiSpacing.lg),
                Text(
                  _sendError!,
                  style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.error),
                ),
              ],

              const SizedBox(height: BanzamiSpacing.xxl),
              BanzamiButton(
                label:     'Enviar',
                isLoading: _sending,
                onPressed: _send,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
