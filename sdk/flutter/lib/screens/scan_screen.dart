import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import '../client/api_exception.dart';
import '../client/consumer_public_client.dart';
import '../theme/banzami_theme.dart';
import '../utils/qr_parser.dart';
import '../widgets/banzami_components.dart';
import '../widgets/banzami_qr_scanner.dart';
import 'payment_link_screen.dart';
import 'payment_request_screen.dart';
import 'send_screen.dart';
import 'structured_qr_pay_screen.dart';

enum _ScanStep { scanning, resolving, error }

/// Scan-to-pay router.
///
/// Parses the scanned QR with [BanzamiQrParser] and routes to the appropriate
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
  int       _scanGeneration = 0; // incremented on rescan → rebuilds BanzamiQrScanner

  // null = checking, true = granted, false = denied (will pop)
  bool?     _cameraReady;

  // Duplicate scan guard
  String?   _lastRaw;
  DateTime? _lastAt;

  @override
  void initState() {
    super.initState();
    _guardPermission();
  }

  // Lightweight status check — callers should have already called
  // BanzamiCameraPermission.ensure(), so this is typically instant.
  Future<void> _guardPermission() async {
    final status = await Permission.camera.status;
    if (!mounted) return;
    if (status.isGranted) {
      debugPrint('[QR-CAMERA] scanner ready');
      setState(() => _cameraReady = true);
    } else {
      debugPrint('[QR-CAMERA] permission not granted in scanner — popping');
      Navigator.of(context).pop();
    }
  }

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

    final parsed = BanzamiQrParser.parse(raw);
    debugPrint('[QR-SCAN] parsedType=${parsed.runtimeType}');

    switch (parsed) {
      case BanzamiQrInvalid(:final reason):
        debugPrint('[QR-SCAN] error=$reason');
        if (mounted) setState(() { _error = reason; _step = _ScanStep.error; });

      case BanzamiQrPaymentRequest(:final code, :final isSandbox):
        debugPrint('[QR-SCAN] sandbox=$isSandbox route=PaymentRequestScreen code=$code');
        if (_sandboxMismatch(isSandbox)) return;
        await _openPaymentRequest(code);

      case BanzamiQrHandlePayment(:final handle, :final amountMinor, :final note,
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

      case BanzamiQrStructuredPayment(:final payload, :final isStatic):
        debugPrint('[QR-SCAN] route=StructuredQrPay static=$isStatic');
        await _openStructuredPayment(payload: payload, isStatic: isStatic);

      case BanzamiQrSplitPayment():
        // Pre-protocol P2P split (/v1/splits) was retired in favour of BANZA
        // Collections (ADR-036). Split bills are now a merchant feature; each
        // share is surfaced as a normal payment link/QR, so a legacy split QR
        // no longer has a consumer screen.
        debugPrint('[QR-SCAN] route=SplitPay (unsupported — legacy)');
        if (mounted) {
          setState(() {
            _error = 'Este QR de divisão de conta já não é suportado.';
            _step  = _ScanStep.error;
          });
        }

      case BanzamiQrPaymentLink(:final slug):
        debugPrint('[QR-SCAN] route=PaymentLink slug=$slug');
        await _openPaymentLink(slug);
    }
  }

  Future<void> _openPaymentLink(String slug) async {
    if (!mounted) return;
    await Navigator.of(context).push(BanzamiPageRoute(
      page: BanzamiPaymentLinkScreen(
        client:    widget.client,
        slug:      slug,
        ownHandle: widget.ownHandle,
        isSandbox: widget.isSandbox,
        onSuccess: (transfer) => widget.onSuccess(transfer),
      ),
    ));
    if (mounted) _rescan();
  }

  Future<void> _openStructuredPayment({
    required String payload,
    required bool   isStatic,
  }) async {
    if (!mounted) return;
    await Navigator.of(context).push(BanzamiPageRoute(
      page: BanzamiStructuredQrPayScreen(
        client:      widget.client,
        payload:     payload,
        isStatic:    isStatic,
        payerHandle: widget.ownHandle ?? '',
        isSandbox:   widget.isSandbox,
        onSuccess:   widget.onSuccess,
      ),
    ));
    if (mounted) _rescan();
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
      await Navigator.of(context).push(BanzamiPageRoute(
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
    await Navigator.of(context).push(BanzamiPageRoute(
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
    await Navigator.of(context).push(BanzamiPageRoute(
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
    if (_cameraReady != true) return _buildCameraLoading();

    return Scaffold(
      backgroundColor: _step == _ScanStep.scanning ? Colors.black : BanzamiColors.offWhite,
      body: switch (_step) {
        _ScanStep.scanning  => BanzamiQrScanner(
            key:        ValueKey(_scanGeneration),
            onDetected: _onScanned,
            onCancel:   () => Navigator.of(context).pop(),
          ),
        _ScanStep.resolving => _buildResolving(),
        _ScanStep.error     => _buildError(),
      },
    );
  }

  Widget _buildCameraLoading() {
    return const Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.qr_code_outlined, color: Colors.white38, size: 64),
              SizedBox(height: 20),
              Text(
                'A preparar câmara…',
                style: TextStyle(color: Colors.white54, fontSize: 15),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildResolving() {
    return const SafeArea(
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: BanzamiColors.primary),
            SizedBox(height: BanzamiSpacing.lg),
            Text('A carregar pagamento…', style: BanzamiTextStyles.bodyMd),
          ],
        ),
      ),
    );
  }

  Widget _buildError() {
    return SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(BanzamiSpacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72, height: 72,
                decoration: const BoxDecoration(
                  color:        BanzamiColors.errorBg,
                  borderRadius: BanzamiRadius.fullAll,
                ),
                child: const Icon(
                  Icons.qr_code_scanner_rounded,
                  color: BanzamiColors.error,
                  size: 36,
                ),
              ),
              const SizedBox(height: BanzamiSpacing.xl),
              Text(
                _error ?? 'Código QR inválido',
                style:     BanzamiTextStyles.headingSm.copyWith(color: BanzamiColors.gray900),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: BanzamiSpacing.sm),
              Text(
                'Verifique o código e tente novamente.',
                style:     BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: BanzamiSpacing.xxl),
              BanzamiPrimaryButton(
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
