import 'package:flutter/material.dart';

import '../client/api_exception.dart';
import '../client/consumer_public_client.dart';
import '../theme/banza_theme.dart';
import '../utils/qr_parser.dart';
import '../widgets/banza_button.dart';
import '../widgets/banza_components.dart';
import '../widgets/banza_qr_scanner.dart';
import 'payment_request_screen.dart';
import 'send_screen.dart';

enum _ScanStep { scanning, resolving, error }

/// Scan-to-pay router.
///
/// Parses the scanned QR with [BanzaQrParser] and routes to the appropriate
/// payment screen:
///  • Payment-request code → [BanzamiPaymentRequestScreen] (locked)
///  • Handle + fixed amount → [BanzamiPaymentRequestScreen] (locked, sendByHandle)
///  • Handle only           → [BanzamiSendScreen] (amount editable)
class BanzamiScanScreen extends StatefulWidget {
  final ConsumerPublicClient          client;
  final String?                       ownHandle;
  final bool                          isSandbox;
  final void Function(dynamic result) onSuccess;

  const BanzamiScanScreen({
    super.key,
    required this.client,
    this.ownHandle,
    this.isSandbox = false,
    required this.onSuccess,
  });

  @override
  State<BanzamiScanScreen> createState() => _BanzamiScanScreenState();
}

class _BanzamiScanScreenState extends State<BanzamiScanScreen> {
  _ScanStep _step           = _ScanStep.scanning;
  String?   _error;
  int       _scanGeneration = 0; // incremented on rescan → rebuilds BanzaQrScanner

  // Duplicate scan guard
  String?   _lastRaw;
  DateTime? _lastAt;

  bool _isDuplicate(String raw) {
    if (_lastRaw == null || _lastAt == null) return false;
    final age = DateTime.now().difference(_lastAt!);
    return age < const Duration(seconds: 2) && raw == _lastRaw;
  }

  // ---------------------------------------------------------------------------
  // QR detection → parse → route
  // ---------------------------------------------------------------------------

  Future<void> _onScanned(String raw) async {
    debugPrint('[QR-SCAN] raw=$raw');
    if (_isDuplicate(raw)) {
      debugPrint('[QR-SCAN] duplicate — ignored');
      return;
    }
    _lastRaw = raw;
    _lastAt  = DateTime.now();
    if (!mounted) return;
    setState(() { _step = _ScanStep.resolving; _error = null; });

    final parsed = BanzaQrParser.parse(raw);
    debugPrint('[QR-SCAN] parsedType=${parsed.runtimeType}');

    switch (parsed) {
      case BanzaQrInvalid(:final reason):
        debugPrint('[QR-SCAN] error=$reason');
        if (mounted) setState(() { _error = reason; _step = _ScanStep.error; });

      case BanzaQrPaymentRequest(:final code, :final isSandbox):
        debugPrint('[QR-SCAN] sandbox=$isSandbox route=PaymentRequestScreen code=$code');
        if (_sandboxMismatch(isSandbox)) return;
        await _openPaymentRequest(code);

      case BanzaQrHandlePayment(:final handle, :final amountMinor, :final note,
                                 :final currency, :final isSandbox):
        debugPrint('[QR-SCAN] sandbox=$isSandbox '
            'route=${amountMinor != null ? "LockedPayment" : "SendScreen"} '
            'handle=$handle amount=$amountMinor');
        if (_sandboxMismatch(isSandbox)) return;
        if (amountMinor != null && amountMinor > 0) {
          await _openLockedPayment(
            handle:      handle,
            amountMinor: amountMinor,
            note:        note,
            currency:    currency,
          );
        } else {
          await _openSendScreen(handle: handle);
        }
    }
  }

  // Returns true (and shows error) if the QR environment doesn't match the app.
  bool _sandboxMismatch(bool qrIsSandbox) {
    if (qrIsSandbox == widget.isSandbox) return false;
    final msg = qrIsSandbox
        ? 'Este QR pertence ao ambiente sandbox.'
        : 'Este QR pertence ao ambiente live.';
    debugPrint('[QR-SCAN] error=sandboxMismatch '
        'qrSandbox=$qrIsSandbox appSandbox=${widget.isSandbox}');
    if (mounted) setState(() { _error = msg; _step = _ScanStep.error; });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Navigation helpers
  // ---------------------------------------------------------------------------

  Future<void> _openPaymentRequest(String code) async {
    try {
      final link = await widget.client.getConsumerPayLinkByCode(code);
      if (!mounted) return;

      if (!link.isActive) {
        final msg = switch (link.status) {
          'PAID'    => 'Este pedido já foi pago.',
          'EXPIRED' => 'Este pedido expirou.',
          _         => 'Este pedido não está disponível.',
        };
        debugPrint('[QR-SCAN] route=blocked status=${link.status}');
        setState(() { _error = msg; _step = _ScanStep.error; });
        return;
      }

      debugPrint('[QR-SCAN] route=BanzamiPaymentRequestScreen linkCode=${link.linkCode}');
      await Navigator.of(context).push(BanzaPageRoute(
        page: BanzamiPaymentRequestScreen(
          client:               widget.client,
          recipientHandle:      link.receiverHandle,
          recipientDisplayName: link.receiverDisplayName,
          amountMinor:          link.amountMinor,
          note:                 link.note,
          currency:             link.currency,
          locked:               link.locked,
          ownHandle:            widget.ownHandle ?? '',
          linkCode:             link.linkCode,
          onSuccess:            widget.onSuccess,
          isSandbox:            widget.isSandbox,
        ),
      ));
      if (mounted) _rescan();
    } on BanzamiApiException catch (e) {
      debugPrint('[QR-SCAN] error=${e.code}');
      final msg = e.isNotFound
          ? 'Pedido de pagamento não encontrado.'
          : 'Não foi possível verificar o QR. Tente novamente.';
      if (mounted) setState(() { _error = msg; _step = _ScanStep.error; });
    } catch (e) {
      debugPrint('[QR-SCAN] error=$e');
      if (mounted) {
        setState(() {
          _error = 'Não foi possível verificar o QR. Tente novamente.';
          _step  = _ScanStep.error;
        });
      }
    }
  }

  Future<void> _openLockedPayment({
    required String handle,
    required int    amountMinor,
    String?         note,
    String          currency = 'AOA',
  }) async {
    if (!mounted) return;
    debugPrint('[QR-SCAN] route=BanzamiPaymentRequestScreen locked handle=$handle amount=$amountMinor');
    await Navigator.of(context).push(BanzaPageRoute(
      page: BanzamiPaymentRequestScreen(
        client:          widget.client,
        recipientHandle: handle,
        amountMinor:     amountMinor,
        note:            note,
        currency:        currency,
        locked:          true,
        ownHandle:       widget.ownHandle ?? '',
        onSuccess:       widget.onSuccess,
        isSandbox:       widget.isSandbox,
      ),
    ));
    if (mounted) _rescan();
  }

  Future<void> _openSendScreen({required String handle}) async {
    if (!mounted) return;
    debugPrint('[QR-SCAN] route=BanzamiSendScreen handle=$handle');
    await Navigator.of(context).push(BanzaPageRoute(
      page: BanzamiSendScreen(
        client:        widget.client,
        ownHandle:     widget.ownHandle,
        onSuccess:     widget.onSuccess,
        isSandbox:     widget.isSandbox,
        initialHandle: handle,
      ),
    ));
    if (mounted) _rescan();
  }

  void _rescan() => setState(() {
    _step          = _ScanStep.scanning;
    _error         = null;
    _scanGeneration++;
  });

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _step == _ScanStep.scanning ? Colors.black : BanzaColors.offWhite,
      body: switch (_step) {
        _ScanStep.scanning  => BanzaQrScanner(
            key:        ValueKey(_scanGeneration),
            onDetected: _onScanned,
            onCancel:   () => Navigator.of(context).pop(),
          ),
        _ScanStep.resolving => _buildResolving(),
        _ScanStep.error     => _buildError(),
      },
    );
  }

  Widget _buildResolving() {
    return const SafeArea(
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: BanzaColors.wine),
            SizedBox(height: BanzaSpacing.lg),
            Text('A carregar pagamento…', style: BanzaTextStyles.bodyMd),
          ],
        ),
      ),
    );
  }

  Widget _buildError() {
    return SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(BanzaSpacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72, height: 72,
                decoration: const BoxDecoration(
                  color:        BanzaColors.errorBg,
                  borderRadius: BanzaRadius.fullAll,
                ),
                child: const Icon(
                  Icons.qr_code_scanner_rounded,
                  color: BanzaColors.error,
                  size: 36,
                ),
              ),
              const SizedBox(height: BanzaSpacing.xl),
              Text(
                _error ?? 'Código QR inválido',
                style:     BanzaTextStyles.headingSm.copyWith(color: BanzaColors.gray900),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: BanzaSpacing.sm),
              Text(
                'Verifique o código e tente novamente.',
                style:     BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray400),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: BanzaSpacing.xxl),
              BanzaButton(
                label:     'Tentar novamente',
                onPressed: _rescan,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
