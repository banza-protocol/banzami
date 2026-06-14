import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../theme/banza_theme.dart';

/// Full-screen QR scanner widget.
///
/// Calls [onDetected] once per scan with the raw string value.
/// The host screen is responsible for calling [BanzamiClient.decodeQrPayload]
/// to parse the scanned payload into a [ParsedQr].
///
/// Requires camera permission in the host app:
/// - iOS: NSCameraUsageDescription in Info.plist
/// - Android: android.permission.CAMERA in AndroidManifest.xml
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

class _BanzamiQrScannerState extends State<BanzamiQrScanner> {
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.normal,
    facing:         CameraFacing.back,
  );

  bool _scanned = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  // Accept all known Banza QR payload formats. Size-limit prevents crash from
  // pathologically large QR data. BanzamiQrParser does the detailed validation.
  static bool _isValidPayload(String value) {
    if (value.length > 512) return false;
    return value.startsWith('https://pay.banzami.org/') ||
           value.startsWith('banza://') ||
           value.startsWith('banza-sandbox://') ||
           value.startsWith('banza:@') ||
           value.startsWith('banza-sandbox:@');
  }

  void _onDetect(BarcodeCapture capture) {
    if (_scanned) return;
    final barcode = capture.barcodes.firstOrNull;
    final value   = barcode?.rawValue;
    if (value == null || value.isEmpty) return;
    if (!_isValidPayload(value)) return;

    _scanned = true;
    widget.onDetected(value);
  }

  Widget _buildPermissionDenied(BuildContext context) {
    return Container(
      color: Colors.black,
      child: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.camera_alt_outlined, color: Colors.white54, size: 64),
                const SizedBox(height: 24),
                const Text(
                  'Câmara não autorizada',
                  style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w600),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                const Text(
                  'Para ler códigos QR, autorize o acesso à câmara nas Definições do seu iPhone.',
                  style: TextStyle(color: Colors.white60, fontSize: 15),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 32),
                if (widget.onCancel != null)
                  TextButton(
                    onPressed: widget.onCancel,
                    child: const Text('Voltar', style: TextStyle(color: Colors.white70, fontSize: 16)),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        MobileScanner(
          controller:   _controller,
          onDetect:     _onDetect,
          errorBuilder: (context, error, child) => _buildPermissionDenied(context),
        ),

        // Viewfinder overlay
        Center(
          child: Container(
            width:       260,
            height:      260,
            decoration:  BoxDecoration(
              border:       Border.all(color: BanzamiColors.primary, width: 2.5),
              borderRadius: BanzamiRadius.lgAll,
            ),
          ),
        ),

        // Instruction label
        Positioned(
          bottom: 80,
          left:   0,
          right:  0,
          child: Center(
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: BanzamiSpacing.xl,
                vertical:   BanzamiSpacing.sm,
              ),
              decoration: BoxDecoration(
                color:        BanzamiColors.gray900.withValues(alpha: 0.6),
                borderRadius: BanzamiRadius.fullAll,
              ),
              child: Text(
                'Aponte para o código QR',
                style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.white),
              ),
            ),
          ),
        ),

        // Cancel button
        if (widget.onCancel != null)
          Positioned(
            top:  56,
            left: BanzamiSpacing.lg,
            child: GestureDetector(
              onTap: widget.onCancel,
              child: Container(
                padding:    const EdgeInsets.all(BanzamiSpacing.sm),
                decoration: BoxDecoration(
                  color:        BanzamiColors.gray900.withValues(alpha: 0.5),
                  borderRadius: BanzamiRadius.mdAll,
                ),
                child: const Icon(Icons.close, color: BanzamiColors.white, size: 24),
              ),
            ),
          ),

        // Torch toggle
        Positioned(
          top:   56,
          right: BanzamiSpacing.lg,
          child: GestureDetector(
            onTap: _controller.toggleTorch,
            child: Container(
              padding:    const EdgeInsets.all(BanzamiSpacing.sm),
              decoration: BoxDecoration(
                color:        BanzamiColors.gray900.withValues(alpha: 0.5),
                borderRadius: BanzamiRadius.mdAll,
              ),
              child: const Icon(Icons.flashlight_on, color: BanzamiColors.white, size: 24),
            ),
          ),
        ),
      ],
    );
  }
}
