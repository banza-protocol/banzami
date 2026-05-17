import 'dart:async';

import 'package:flutter/material.dart';

import '../client/api_exception.dart';
import '../client/consumer_public_client.dart';
import '../models/consumer_suggestion.dart';
import '../models/transfer.dart';
import '../theme/banzami_theme.dart';
import '../widgets/banzami_amount_input.dart';
import '../widgets/banzami_button.dart';

/// P2P send flow — enter recipient @handle, amount, and optional description.
///
/// Autocomplete suggestions appear after 2+ chars are typed and dismiss
/// when a suggestion is tapped or the field loses focus.
class BanzamiSendScreen extends StatefulWidget {
  final ConsumerPublicClient client;
  final void Function(Transfer transfer) onSuccess;
  /// The authenticated user's own handle — excluded from autocomplete results.
  final String? ownHandle;

  const BanzamiSendScreen({
    super.key,
    required this.client,
    required this.onSuccess,
    this.ownHandle,
  });

  @override
  State<BanzamiSendScreen> createState() => _BanzamiSendScreenState();
}

class _BanzamiSendScreenState extends State<BanzamiSendScreen> {
  final _handleCtrl = TextEditingController();
  final _descCtrl   = TextEditingController();
  final _handleFocus = FocusNode();

  int     _amountMinor  = 0;
  bool    _sending      = false;
  String? _handleError;
  String? _amountError;
  String? _sendError;

  List<ConsumerSuggestion> _suggestions = [];
  bool    _searching = false;
  Timer?  _debounce;

  @override
  void initState() {
    super.initState();
    _handleFocus.addListener(() {
      if (!_handleFocus.hasFocus) {
        setState(() => _suggestions = []);
      }
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _handleCtrl.dispose();
    _descCtrl.dispose();
    _handleFocus.dispose();
    super.dispose();
  }

  void _onHandleChanged(String value) {
    setState(() { _handleError = null; _sendError = null; });

    _debounce?.cancel();
    final q = value.trim().replaceAll('@', '');
    if (q.length < 2) {
      setState(() => _suggestions = []);
      return;
    }

    _debounce = Timer(const Duration(milliseconds: 300), () async {
      if (!mounted) return;
      setState(() => _searching = true);
      var results = await widget.client.searchHandles(q);
      if (widget.ownHandle != null) {
        results = results.where((s) => s.handle != widget.ownHandle).toList();
      }
      if (!mounted) return;
      setState(() { _suggestions = results; _searching = false; });
    });
  }

  void _selectSuggestion(ConsumerSuggestion s) {
    _handleCtrl.text = s.handle;
    _handleFocus.unfocus();
    setState(() { _suggestions = []; _handleError = null; });
  }

  Future<void> _send() async {
    final handle = _handleCtrl.text.trim().replaceAll('@', '').toLowerCase();
    if (handle.isEmpty) {
      setState(() => _handleError = 'Introduza um @banza');
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
        'RECIPIENT_NOT_FOUND' => '@banza não encontrado',
        'RECIPIENT_NO_WALLET' => 'Destinatário sem carteira activa',
        'SELF_TRANSFER'       => 'Não pode enviar para si mesmo',
        'INVALID_AMOUNT'      => 'Montante inválido',
        _                     => 'Erro de envio. Tente novamente.',
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
                focusNode:       _handleFocus,
                decoration: InputDecoration(
                  hintText:  '@banza do destinatário',
                  prefixText: '@',
                  errorText: _handleError,
                  suffixIcon: _searching
                      ? const Padding(
                          padding: EdgeInsets.all(12),
                          child: SizedBox(
                            width: 16, height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        )
                      : null,
                ),
                autocorrect:     false,
                textInputAction: TextInputAction.next,
                onChanged:       _onHandleChanged,
              ),

              if (_suggestions.isNotEmpty)
                _SuggestionList(
                  suggestions: _suggestions,
                  onTap:       _selectSuggestion,
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

class _SuggestionList extends StatelessWidget {
  final List<ConsumerSuggestion> suggestions;
  final void Function(ConsumerSuggestion) onTap;

  const _SuggestionList({required this.suggestions, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: BanzamiSpacing.xs),
      decoration: BoxDecoration(
        color:        BanzamiColors.white,
        borderRadius: BorderRadius.circular(BanzamiRadius.md),
        border:       Border.all(color: BanzamiColors.gray200),
        boxShadow: [
          BoxShadow(
            color:      Colors.black.withValues(alpha: 0.06),
            blurRadius: 8,
            offset:     const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: suggestions.map((s) {
          return InkWell(
            onTap:        () => onTap(s),
            borderRadius: BorderRadius.circular(BanzamiRadius.md),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: BanzamiSpacing.lg,
                vertical:   BanzamiSpacing.md,
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius:          18,
                    backgroundColor: BanzamiColors.gray100,
                    child: Text(
                      s.handle[0].toUpperCase(),
                      style: BanzamiTextStyles.bodySm.copyWith(
                        color:      BanzamiColors.wine,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: BanzamiSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('@${s.handle}',
                            style: BanzamiTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w600)),
                        if (s.displayName != null)
                          Text(s.displayName!,
                              style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
