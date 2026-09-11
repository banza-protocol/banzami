import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:uuid/uuid.dart';

import '../client/api_exception.dart';
import '../client/consumer_public_client.dart';
import '../models/consumer_suggestion.dart';
import '../models/transfer.dart';
import '../theme/banzami_theme.dart';
import '../utils/banzami_toast.dart';
import '../utils/camera_permission.dart';
import '../utils/error_messages.dart';
import '../utils/qr_parser.dart';
import '../widgets/banzami_amount_input.dart';
import '../widgets/banzami_components.dart';
import '../widgets/banzami_qr_scanner.dart';
import 'confirm_screen.dart';
import 'payment_request_screen.dart';

/// P2P send flow — enter recipient @handle, amount, and optional description.
///
/// Autocomplete suggestions appear after 2+ chars are typed and dismiss
/// when a suggestion is tapped or the field loses focus.
class BanzamiSendScreen extends StatefulWidget {
  final ConsumerPublicClient client;
  final void Function(Transfer transfer) onSuccess;

  /// The authenticated user's own handle — excluded from autocomplete results.
  final String? ownHandle;
  final bool isSandbox;
  final String? logoAssetPath;

  /// Pre-filled from a deep link (without the @ prefix).
  final String? initialHandle;

  /// Pre-filled from a deep link — skips the amount input default of 0.
  final int? initialAmount;

  const BanzamiSendScreen({
    super.key,
    required this.client,
    required this.onSuccess,
    this.ownHandle,
    this.isSandbox = false,
    this.logoAssetPath,
    this.initialHandle,
    this.initialAmount,
  });

  @override
  State<BanzamiSendScreen> createState() => _BanzamiSendScreenState();
}

class _BanzamiSendScreenState extends State<BanzamiSendScreen> {
  final _handleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _handleFocus = FocusNode();

  int _amountMinor = 0;
  int _amountInputVersion =
      0; // incremented to force BanzamiAmountInput rebuild
  String? _handleError;
  String? _amountError;

  List<ConsumerSuggestion> _suggestions = [];
  ConsumerSuggestion? _selectedSuggestion;
  bool _searching = false;
  bool _validatingHandle = false;
  bool _handleConfirmed = false;
  bool _busy = false; // true while resolving a payment-request QR
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _handleFocus.addListener(() {
      if (!_handleFocus.hasFocus) {
        setState(() => _suggestions = []);
        _validateHandleOnBlur();
      }
    });
    if (widget.initialHandle != null) {
      _handleCtrl.text = widget.initialHandle!.replaceAll('@', '');
      if (widget.initialAmount != null) _amountMinor = widget.initialAmount!;
      // Validate the pre-filled handle once the widget is in the tree.
      WidgetsBinding.instance
          .addPostFrameCallback((_) => _validateHandleOnBlur());
    }
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
    setState(() {
      _handleError = null;
      _handleConfirmed = false;
      _selectedSuggestion = null;
    });

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
      setState(() {
        _suggestions = results;
        _searching = false;
      });
    });
  }

  void _selectSuggestion(ConsumerSuggestion s) {
    _handleCtrl.text = s.handle;
    _handleFocus.unfocus();
    setState(() {
      _suggestions = [];
      _handleError = null;
      _handleConfirmed = true;
      _selectedSuggestion = s;
    });
  }

  Future<void> _validateHandleOnBlur() async {
    if (_handleConfirmed) return;
    final handle = _handleCtrl.text.trim().replaceAll('@', '').toLowerCase();
    if (handle.isEmpty) return;

    setState(() {
      _validatingHandle = true;
      _handleError = null;
    });
    try {
      final exists = await widget.client.handleExists(handle);
      if (!mounted) return;
      if (exists) {
        setState(() {
          _handleConfirmed = true;
          _validatingHandle = false;
        });
      } else {
        setState(() {
          _handleError = '@$handle não está registado no Banzami';
          _validatingHandle = false;
        });
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

    await Navigator.of(context).push(BanzamiPageRoute(
      page: BanzamiConfirmScreen(
        client: widget.client,
        recipientHandle: handle,
        recipientDisplayName: _selectedSuggestion?.displayName,
        amountMinor: _amountMinor,
        note: note,
        idempotencyKey: idempotencyKey,
        ownHandle: widget.ownHandle,
        onSuccess: widget.onSuccess,
        isSandbox: widget.isSandbox,
        logoAssetPath: widget.logoAssetPath,
      ),
    ));
  }

  // ── QR scan ────────────────────────────────────────────────────────────────

  Future<void> _scanQr() async {
    HapticFeedback.lightImpact();

    final granted = await BanzamiCameraPermission.ensure(context);
    if (!granted || !mounted) return;

    debugPrint('[QR-CAMERA] initializing scanner');
    String? raw;
    await Navigator.of(context).push(MaterialPageRoute<void>(
      fullscreenDialog: true,
      builder: (scanCtx) => Scaffold(
        backgroundColor: Colors.black,
        body: BanzamiQrScanner(
          onDetected: (v) {
            raw = v;
            Navigator.of(scanCtx).pop();
          },
          onCancel: () => Navigator.of(scanCtx).pop(),
        ),
      ),
    ));
    debugPrint('[QR-CAMERA] scanner ready');
    if (raw == null || !mounted) return;
    _handleQrResult(raw!);
  }

  void _handleQrResult(String raw) {
    final parsed = BanzamiQrParser.parse(raw);
    switch (parsed) {
      case BanzamiQrInvalid(:final reason):
        BanzamiToast.showWarning(context, reason);

      case BanzamiQrPaymentRequest(:final code, :final isSandbox):
        if (_sandboxMismatch(isSandbox)) return;
        _openPaymentRequestFromQr(code);

      case BanzamiQrHandlePayment(
          :final handle,
          :final amountMinor,
          :final note,
          :final isSandbox
        ):
        if (_sandboxMismatch(isSandbox)) return;
        _prefillFromQr(handle: handle, amountMinor: amountMinor, note: note);

      case BanzamiQrStructuredPayment():
        // No consumer route pays a structured QR yet (see scan_screen).
        BanzamiToast.showWarning(context, kStructuredQrUnavailableMessage);

      case BanzamiQrSplitPayment():
        BanzamiToast.showWarning(
            context, 'Este QR de divisão de conta já não é suportado.');

      case BanzamiQrPaymentLink():
        // "Enviar" pays a person; a payment link opens from "QR Code" on the
        // home screen (the scanner) — the screen that really exists.
        BanzamiToast.showWarning(context,
            'Este é um link de pagamento. Leia-o em "QR Code", no início.');
    }
  }

  bool _sandboxMismatch(bool qrIsSandbox) {
    if (qrIsSandbox == widget.isSandbox) return false;
    final msg = environmentMismatchMessage(fromSandbox: qrIsSandbox);
    BanzamiToast.showWarning(context, msg);
    return true;
  }

  void _prefillFromQr({
    required String handle,
    int? amountMinor,
    String? note,
  }) {
    _handleCtrl.text = handle.replaceAll('@', '');
    _handleFocus.unfocus();

    setState(() {
      _handleError = null;
      _handleConfirmed = false;
      _selectedSuggestion = null;
      _suggestions = [];
      if (amountMinor != null && amountMinor > 0) {
        _amountMinor = amountMinor;
        _amountInputVersion++;
      }
    });

    if (note != null && note.isNotEmpty) _descCtrl.text = note;

    WidgetsBinding.instance
        .addPostFrameCallback((_) => _validateHandleOnBlur());
  }

  Future<void> _openPaymentRequestFromQr(String code) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final link = await widget.client.getConsumerPayLinkByCode(code);
      if (!mounted) return;
      if (!link.isActive) {
        final msg = switch (link.status) {
          'PAID' => 'Este pedido já foi pago.',
          'EXPIRED' => 'Este pedido expirou.',
          _ => 'Este pedido não está disponível.',
        };
        BanzamiToast.showWarning(context, msg);
        return;
      }
      await Navigator.of(context).push(BanzamiPageRoute(
        page: BanzamiPaymentRequestScreen(
          client: widget.client,
          recipientHandle: link.receiverHandle,
          recipientDisplayName: link.receiverDisplayName,
          amountMinor: link.amountMinor,
          note: link.note,
          currency: link.currency,
          locked: link.locked,
          ownHandle: widget.ownHandle,
          linkCode: link.linkCode,
          onSuccess: widget.onSuccess,
          isSandbox: widget.isSandbox,
          logoAssetPath: widget.logoAssetPath,
        ),
      ));
    } on BanzamiApiException catch (e) {
      if (!mounted) return;
      final msg = e.isNotFound
          ? 'Pedido de pagamento não encontrado.'
          : 'Não foi possível verificar o QR. Tente novamente.';
      BanzamiToast.showError(context, msg);
    } catch (_) {
      if (!mounted) return;
      BanzamiToast.showError(
          context, 'Não foi possível verificar o QR. Tente novamente.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return BanzamiScaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Back button
            IconButton(
              icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
              color: BanzamiColors.gray900,
              padding: const EdgeInsets.fromLTRB(
                  BanzamiSpacing.md, BanzamiSpacing.md, BanzamiSpacing.md, 0),
              onPressed: () => Navigator.of(context).pop(),
            ),

            // Scrollable form
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(
                  BanzamiSpacing.xl,
                  BanzamiSpacing.md,
                  BanzamiSpacing.xl,
                  BanzamiSpacing.xxl,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Large premium title
                    const Text('Enviar', style: BanzamiTextStyles.displayMd),
                    const SizedBox(height: BanzamiSpacing.xxl),

                    // ── Para quem? ─────────────────────────────────────────
                    Text(
                      'Para quem?',
                      style: BanzamiTextStyles.headingSm
                          .copyWith(color: BanzamiColors.gray900),
                    ),
                    const SizedBox(height: BanzamiSpacing.sm),
                    TextField(
                      controller: _handleCtrl,
                      focusNode: _handleFocus,
                      decoration: InputDecoration(
                        prefixText: '@',
                        hintText: 'banza do destinatário',
                        errorText: _handleError,
                        suffixIcon: (_searching || _validatingHandle || _busy)
                            ? const Padding(
                                padding: EdgeInsets.all(12),
                                child: SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: BanzamiColors.primary),
                                ),
                              )
                            : _handleConfirmed
                                ? const Icon(Icons.check_circle_rounded,
                                    color: Color(0xFF166534), size: 20)
                                : GestureDetector(
                                    onTap: _scanQr,
                                    child: const Padding(
                                      padding: EdgeInsets.all(10),
                                      child: Icon(
                                        Icons.qr_code_scanner_rounded,
                                        color: BanzamiColors.primary,
                                        size: 22,
                                      ),
                                    ),
                                  ),
                      ),
                      style: BanzamiTextStyles.bodyLg
                          .copyWith(color: BanzamiColors.gray900),
                      autocorrect: false,
                      textInputAction: TextInputAction.next,
                      onChanged: _onHandleChanged,
                    ),

                    if (_suggestions.isNotEmpty)
                      _SuggestionList(
                        suggestions: _suggestions,
                        onTap: _selectSuggestion,
                      ),

                    // ── Quanto? ────────────────────────────────────────────
                    const SizedBox(height: BanzamiSpacing.xl),
                    Text(
                      'Quanto?',
                      style: BanzamiTextStyles.headingSm
                          .copyWith(color: BanzamiColors.gray900),
                    ),
                    const SizedBox(height: BanzamiSpacing.sm),
                    BanzamiAmountInput(
                      key: ValueKey(_amountInputVersion),
                      initialAmountMinor: _amountMinor > 0
                          ? _amountMinor
                          : widget.initialAmount,
                      onChanged: (v) => setState(() {
                        _amountMinor = v;
                        _amountError = null;
                      }),
                      errorText: _amountError,
                    ),

                    // ── Descrição ──────────────────────────────────────────
                    const SizedBox(height: BanzamiSpacing.xl),
                    Text(
                      'Descrição (opcional)',
                      style: BanzamiTextStyles.headingSm
                          .copyWith(color: BanzamiColors.gray900),
                    ),
                    const SizedBox(height: BanzamiSpacing.sm),
                    BanzamiTextField(
                      controller: _descCtrl,
                      hint: 'Ex: jantar de ontem',
                      textInputAction: TextInputAction.done,
                      onEditingComplete: _send,
                    ),

                    const SizedBox(height: BanzamiSpacing.xxl),
                    BanzamiPrimaryButton(
                      label: 'Continuar',
                      isLoading: _validatingHandle,
                      onPressed: _send,
                    ),
                  ],
                ),
              ),
            ),
          ],
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
        color: BanzamiColors.white,
        borderRadius: BorderRadius.circular(BanzamiRadius.md),
        border: Border.all(color: BanzamiColors.gray200),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: suggestions.map((s) {
          return InkWell(
            onTap: () => onTap(s),
            borderRadius: BorderRadius.circular(BanzamiRadius.md),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: BanzamiSpacing.lg,
                vertical: BanzamiSpacing.md,
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 18,
                    backgroundColor: BanzamiColors.gray100,
                    child: Text(
                      s.handle[0].toUpperCase(),
                      style: BanzamiTextStyles.bodySm.copyWith(
                        color: BanzamiColors.primary,
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
                            style: BanzamiTextStyles.bodyMd
                                .copyWith(fontWeight: FontWeight.w600)),
                        if (s.displayName != null)
                          Text(s.displayName!,
                              style: BanzamiTextStyles.bodySm
                                  .copyWith(color: BanzamiColors.gray400)),
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
