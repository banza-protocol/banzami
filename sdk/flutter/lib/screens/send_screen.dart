import 'dart:async';

import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../client/consumer_public_client.dart';
import '../models/consumer_suggestion.dart';
import '../models/transfer.dart';
import '../theme/banza_theme.dart';
import '../widgets/banza_amount_input.dart';
import '../widgets/banza_button.dart';
import 'confirm_screen.dart';

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
  String? _handleError;
  String? _amountError;

  bool    _handleFocused    = false;
  List<ConsumerSuggestion> _suggestions = [];
  ConsumerSuggestion? _selectedSuggestion;
  bool    _searching        = false;
  bool    _validatingHandle = false;
  bool    _handleConfirmed  = false; // true once handle is known to exist
  Timer?  _debounce;

  @override
  void initState() {
    super.initState();
    _handleFocus.addListener(() {
      setState(() => _handleFocused = _handleFocus.hasFocus);
      if (!_handleFocus.hasFocus) {
        setState(() => _suggestions = []);
        _validateHandleOnBlur();
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
    setState(() { _handleError = null; _handleConfirmed = false; _selectedSuggestion = null; });

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
    setState(() { _suggestions = []; _handleError = null; _handleConfirmed = true; _selectedSuggestion = s; });
  }

  Future<void> _validateHandleOnBlur() async {
    if (_handleConfirmed) return;
    final handle = _handleCtrl.text.trim().replaceAll('@', '').toLowerCase();
    if (handle.isEmpty) return;

    setState(() { _validatingHandle = true; _handleError = null; });
    try {
      final exists = await widget.client.handleExists(handle);
      if (!mounted) return;
      if (exists) {
        setState(() { _handleConfirmed = true; _validatingHandle = false; });
      } else {
        setState(() { _handleError = '@$handle não está registado no Banza'; _validatingHandle = false; });
      }
    } catch (_) {
      if (mounted) setState(() => _validatingHandle = false);
    }
  }

  Future<void> _send() async {
    final handle = _handleCtrl.text.trim().replaceAll('@', '').toLowerCase();
    if (handle.isEmpty) {
      setState(() => _handleError = 'Introduza um @banza');
      return;
    }
    if (!_handleConfirmed) {
      await _validateHandleOnBlur();
      if (!_handleConfirmed) return;
    }
    if (_amountMinor <= 0) {
      setState(() => _amountError = 'Introduza um montante válido');
      return;
    }
    if (!mounted) return;

    final idempotencyKey = const Uuid().v4();
    final note = _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim();

    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => BanzamiConfirmScreen(
        client:               widget.client,
        recipientHandle:      handle,
        recipientDisplayName: _selectedSuggestion?.displayName,
        amountMinor:          _amountMinor,
        note:                 note,
        idempotencyKey:       idempotencyKey,
        ownHandle:            widget.ownHandle,
        onSuccess:            widget.onSuccess,
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzaColors.white,
      appBar: AppBar(
        title:           const Text('Enviar'),
        backgroundColor: BanzaColors.white,
        foregroundColor: BanzaColors.gray900,
        elevation:       0,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(BanzaSpacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Para quem?', style: BanzaTextStyles.headingSm),
              const SizedBox(height: BanzaSpacing.sm),
              TextField(
                controller:      _handleCtrl,
                focusNode:       _handleFocus,
                decoration: InputDecoration(
                  prefixText: '@',
                  hintText:  _handleFocused ? 'banza do destinatário' : '@banza do destinatário',
                  errorText: _handleError,
                  suffixIcon: (_searching || _validatingHandle)
                      ? const Padding(
                          padding: EdgeInsets.all(12),
                          child: SizedBox(
                            width: 16, height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        )
                      : _handleConfirmed
                          ? const Icon(Icons.check_circle, color: Color(0xFF166534), size: 20)
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

              const SizedBox(height: BanzaSpacing.xl),
              const Text('Quanto?', style: BanzaTextStyles.headingSm),
              const SizedBox(height: BanzaSpacing.sm),
              BanzaAmountInput(
                onChanged:  (v) => setState(() { _amountMinor = v; _amountError = null; }),
                errorText:  _amountError,
              ),

              const SizedBox(height: BanzaSpacing.xl),
              const Text('Descrição (opcional)', style: BanzaTextStyles.headingSm),
              const SizedBox(height: BanzaSpacing.sm),
              TextField(
                controller:      _descCtrl,
                decoration: const InputDecoration(hintText: 'Ex: jantar de ontem'),
                textInputAction: TextInputAction.done,
                onSubmitted:     (_) => _send(),
              ),

              const SizedBox(height: BanzaSpacing.xxl),
              BanzaButton(
                label:     'Enviar',
                isLoading: _validatingHandle,
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
      margin: const EdgeInsets.only(top: BanzaSpacing.xs),
      decoration: BoxDecoration(
        color:        BanzaColors.white,
        borderRadius: BorderRadius.circular(BanzaRadius.md),
        border:       Border.all(color: BanzaColors.gray200),
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
            borderRadius: BorderRadius.circular(BanzaRadius.md),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: BanzaSpacing.lg,
                vertical:   BanzaSpacing.md,
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius:          18,
                    backgroundColor: BanzaColors.gray100,
                    child: Text(
                      s.handle[0].toUpperCase(),
                      style: BanzaTextStyles.bodySm.copyWith(
                        color:      BanzaColors.wine,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: BanzaSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('@${s.handle}',
                            style: BanzaTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w600)),
                        if (s.displayName != null)
                          Text(s.displayName!,
                              style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400)),
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
