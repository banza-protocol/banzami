import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../theme/banzami_theme.dart';
import '../utils/qr_parser.dart';

/// Full-screen QR scanner widget — one shared product flow, with platform-correct
/// camera behaviour at the edge (WEB-QR-CAMERA-001).
///
/// Calls [onDetected] once per scan with the raw string value. The host screen
/// parses it with the canonical [BanzamiQrParser] (the single source of truth for
/// "is this a Banzami QR").
///
/// Camera authority:
///  - iOS/Android: the host requests native camera permission before this opens.
///  - Web: the browser decides via getUserMedia when the scanner opens. A desktop
///    webcam has no rear camera, so we start with the rear camera and, on the web,
///    fall back to any available camera instead of failing — and we classify the
///    real getUserMedia error (denied / not found / not readable / unsupported)
///    with platform-correct copy, never iOS wording on the web.
class BanzamiQrScanner extends StatefulWidget {
  final void Function(String payload) onDetected;
  final VoidCallback? onCancel;

  const BanzamiQrScanner({
    super.key,
    required this.onDetected,
    this.onCancel,
  });

  @override
  State<BanzamiQrScanner> createState() => _BanzamiQrScannerState();
}

enum _CamError { none, denied, notFound, notReadable, unsupported, generic }

class _BanzamiQrScannerState extends State<BanzamiQrScanner> {
  MobileScannerController _controller = _makeController();

  static MobileScannerController _makeController() => MobileScannerController(
        detectionSpeed: DetectionSpeed.normal,
        facing: CameraFacing.back,
        autoStart: false, // we start explicitly so we can classify errors + fall back
      );

  bool _scanned = false;
  bool _starting = true;
  bool _triedFallback = false;
  _CamError _error = _CamError.none;

  @override
  void initState() {
    super.initState();
    if (kIsWeb) {
      // mobile_scanner's web decoder loads @zxing/library from unpkg.com by
      // default, which the app's strict CSP (script-src 'self') refuses — so the
      // decoder never loads and the camera "fails". Point it at the copy served
      // from our own origin instead (no CSP weakening). No-op on native.
      MobileScannerPlatform.instance
          .setBarcodeLibraryScriptUrl('/zxing-library-0.21.3.js');
    }
    _boot();
  }

  @override
  void dispose() {
    // Release the camera: stop the tracks, then dispose the controller.
    _controller.dispose();
    super.dispose();
  }

  /// Start the camera, with a web-only fallback from the rear camera (which a
  /// desktop webcam cannot provide → OverconstrainedError) to any camera.
  Future<void> _boot({CameraFacing facing = CameraFacing.back}) async {
    if (mounted) setState(() { _starting = true; _error = _CamError.none; });
    try {
      await _controller.start(cameraDirection: facing);
      if (mounted) setState(() => _starting = false);
    } catch (e) {
      final cls = _classify(e);
      // Web desktop: no rear camera → retry once with the front/any camera before
      // surfacing an error. QR still scans fine from a user-facing webcam.
      if (kIsWeb && !_triedFallback && facing == CameraFacing.back &&
          (cls == _CamError.notFound || cls == _CamError.generic)) {
        _triedFallback = true;
        // RELEASE THE FAILED ATTEMPT BEFORE STARTING ANOTHER.
        //
        // On the web a rear-camera start can acquire a MediaStream and only
        // then be rejected by the facing constraint. Booting the fallback on
        // the same controller leaves that first stream live: the controller
        // tracks one stream, so disposing it later stops the SECOND and the
        // first keeps the camera on with nothing on screen.
        //
        // BZV-20260923-0001 measured started=3 stopped=2 active=1 on a device
        // with no rear camera, with the scanner proven dismissed 3/3 — a live
        // camera track after the user closed the scanner. Recreating here is
        // exactly what _retry already does for the denied→allowed transition,
        // and for the same reason.
        //
        // NOT PROVEN TO CLOSE THAT DEFECT. Measured against the deployed
        // Sandbox with the same instrument, before and after: started=3
        // stopped=2 active=1, unchanged. This is correct hygiene — releasing
        // before re-acquiring — and it is not the cause of the leak. The
        // commit that introduced it (57dbf165) claims more than the evidence
        // supports; the leak is open, and the harness now measures it as
        // "195ms, 59ms, NEVER (active=2 after 6367ms)": the first two closes
        // release, the third never does. Whatever is holding that third
        // stream is somewhere else.
        try { await _controller.dispose(); } catch (_) { /* noop */ }
        _controller = _makeController();
        MobileScannerPlatform.instance
            .setBarcodeLibraryScriptUrl('/zxing-library-0.21.3.js');
        if (mounted) setState(() {});
        await _boot(facing: CameraFacing.front);
        return;
      }
      if (mounted) setState(() { _starting = false; _error = cls; });
    }
  }

  Future<void> _retry() async {
    _triedFallback = false;
    // A controller that already errored (e.g. permission denied) does not reliably
    // restart on the web, so recreate it — this is what makes a denied→allowed
    // transition recover without a page reload.
    try { await _controller.dispose(); } catch (_) { /* noop */ }
    _controller = _makeController();
    if (kIsWeb) {
      MobileScannerPlatform.instance.setBarcodeLibraryScriptUrl('/zxing-library-0.21.3.js');
    }
    if (mounted) setState(() {});
    await _boot();
  }

  _CamError _classify(Object e) {
    MobileScannerErrorCode? code;
    var detail = '';
    if (e is MobileScannerException) {
      code = e.errorCode;
      detail = '${e.errorDetails?.code ?? ''} ${e.errorDetails?.message ?? ''}';
    }
    final blob = '$e $detail'.toLowerCase();

    // PRECISE SIGNALS FIRST, LOOSE KEYWORDS LAST.
    //
    // `blob.contains('permission')` used to be tested before everything else,
    // and it is the weakest test here: any message that merely MENTIONS
    // permission wins it, including the wrapper text around a missing device.
    // BZV-20260923-0001 measured nocam→non-permission=false on a machine with
    // no camera at all — the user was told to grant a permission they had
    // already granted, for a device that does not exist.
    //
    // The error's own NAME is not ambiguous, so it decides first. The keyword
    // stays as a last resort, because a wrapper that says only "permission"
    // and nothing else is still a denial.
    if (code == MobileScannerErrorCode.permissionDenied ||
        blob.contains('notallowed')) {
      return _CamError.denied;
    }
    if (blob.contains('notfound') || blob.contains('overconstrained') ||
        blob.contains('devicesnotfound') || blob.contains('no camera')) {
      return _CamError.notFound;
    }
    if (blob.contains('notreadable') || blob.contains('aborterror') ||
        blob.contains('could not start') || blob.contains('trackstart')) {
      return _CamError.notReadable;
    }
    if (blob.contains('permission')) {
      return _CamError.denied;
    }
    if (code == MobileScannerErrorCode.unsupported || blob.contains('unsupported')) {
      return _CamError.unsupported;
    }
    return _CamError.generic;
  }

  // Accept anything BanzamiQrParser can resolve — the parser is the SINGLE source
  // of truth. Size guard prevents a crash from pathologically large QR data.
  static bool _isValidPayload(String value) {
    if (value.length > 512) return false;
    return BanzamiQrParser.parse(value) is! BanzamiQrInvalid;
  }

  void _onDetect(BarcodeCapture capture) {
    if (_scanned) return;
    final barcode = capture.barcodes.firstOrNull;
    final value = barcode?.rawValue;
    if (value == null || value.isEmpty) return;
    if (!_isValidPayload(value)) return;
    _scanned = true;
    widget.onDetected(value);
  }

  // ── Error state (platform-correct copy) ─────────────────────────────────────

  ({String title, String body}) _copy(_CamError e) {
    switch (e) {
      case _CamError.denied:
        return kIsWeb
            ? (title: 'Câmara não autorizada', body: 'Permita o acesso à câmara no navegador para ler códigos QR.')
            : (title: 'Câmara não autorizada', body: 'Para ler códigos QR, autorize o acesso à câmara nas Definições.');
      case _CamError.notFound:
        return (title: 'Câmara não encontrada', body: 'Não foi encontrada uma câmara disponível neste dispositivo.');
      case _CamError.notReadable:
        return (title: 'Não foi possível iniciar a câmara', body: 'Feche outras aplicações que possam estar a utilizar a câmara e tente novamente.');
      case _CamError.unsupported:
        return (title: 'Leitura de QR indisponível', body: 'Este dispositivo ou navegador não suporta a leitura de códigos QR.');
      case _CamError.none:
      case _CamError.generic:
        return (title: 'Não foi possível iniciar a câmara', body: 'Ocorreu um problema ao aceder à câmara. Tente novamente.');
    }
  }

  Widget _buildError(BuildContext context) {
    final c = _copy(_error);
    // A camera error offers "Tentar novamente" only when it can be recovered by
    // re-requesting access (denied / readable / generic). "Não encontrada" and
    // "indisponível" cannot be retried into existence.
    final canRetry = _error == _CamError.denied ||
        _error == _CamError.notReadable ||
        _error == _CamError.generic;
    return Container(
      color: Colors.black,
      child: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.videocam_off_outlined, color: Colors.white54, size: 56),
                const SizedBox(height: 20),
                Semantics(
                  header: true,
                  child: Text(
                    c.title,
                    style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w600),
                    textAlign: TextAlign.center,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  c.body,
                  style: const TextStyle(color: Colors.white60, fontSize: 15, height: 1.45),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 28),
                if (canRetry)
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: BanzamiColors.primary,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      onPressed: _retry,
                      child: const Text('Tentar novamente', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                    ),
                  ),
                if (widget.onCancel != null) ...[
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: widget.onCancel,
                    child: const Text('Voltar', style: TextStyle(color: Colors.white70, fontSize: 16)),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_error != _CamError.none) return _buildError(context);

    return Stack(
      children: [
        MobileScanner(
          controller: _controller,
          onDetect: _onDetect,
          // A runtime error surfaced by the view is classified the same way and
          // shown as our error card (with retry) — never the raw plugin state.
          errorBuilder: (context, error, child) {
            final cls = _classify(error);
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted && _error != cls) setState(() => _error = cls);
            });
            return Container(color: Colors.black);
          },
        ),

        if (_starting)
          const Center(child: CircularProgressIndicator(color: BanzamiColors.primary)),

        // Viewfinder overlay
        Center(
          child: Container(
            width: 260,
            height: 260,
            decoration: BoxDecoration(
              border: Border.all(color: BanzamiColors.primary, width: 2.5),
              borderRadius: BanzamiRadius.lgAll,
            ),
          ),
        ),

        // Instruction label
        Positioned(
          bottom: 80,
          left: 0,
          right: 0,
          child: Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.xl, vertical: BanzamiSpacing.sm),
              decoration: BoxDecoration(
                color: BanzamiColors.gray900.withValues(alpha: 0.6),
                borderRadius: BanzamiRadius.fullAll,
              ),
              child: Text('Aponte para o código QR',
                  style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.white)),
            ),
          ),
        ),

        // Close button
        if (widget.onCancel != null)
          Positioned(
            top: 56,
            left: BanzamiSpacing.lg,
            child: Semantics(
              button: true,
              label: 'Fechar',
              child: GestureDetector(
                onTap: widget.onCancel,
                child: Container(
                  padding: const EdgeInsets.all(BanzamiSpacing.sm),
                  decoration: BoxDecoration(
                    color: BanzamiColors.gray900.withValues(alpha: 0.5),
                    borderRadius: BanzamiRadius.mdAll,
                  ),
                  child: const Icon(Icons.close, color: BanzamiColors.white, size: 24),
                ),
              ),
            ),
          ),

        // Torch toggle — only when the current camera actually supports it
        // (feature-detected via the controller's torch state; a desktop webcam
        // reports it unavailable and no control is shown).
        Positioned(
          top: 56,
          right: BanzamiSpacing.lg,
          child: ValueListenableBuilder<MobileScannerState>(
            valueListenable: _controller,
            builder: (context, state, _) {
              if (state.torchState == TorchState.unavailable) {
                return const SizedBox.shrink();
              }
              final on = state.torchState == TorchState.on;
              return Semantics(
                button: true,
                label: on ? 'Desligar lanterna' : 'Ligar lanterna',
                child: GestureDetector(
                  onTap: () => _controller.toggleTorch(),
                  child: Container(
                    padding: const EdgeInsets.all(BanzamiSpacing.sm),
                    decoration: BoxDecoration(
                      color: BanzamiColors.gray900.withValues(alpha: 0.5),
                      borderRadius: BanzamiRadius.mdAll,
                    ),
                    child: Icon(on ? Icons.flashlight_on : Icons.flashlight_off,
                        color: BanzamiColors.white, size: 24),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
