import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../theme/banzami_theme.dart';

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

  // Only accept payloads that look like Banzami payment links (deep-link or
  // web URL form). Size-limit prevents crash from pathologically large QR data.
  static bool _isValidPayload(String value) {
    if (value.length > 512) return false;
    return value.startsWith('banzami://pay/') ||
           value.startsWith('https://pay.banzami.org/');
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

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        MobileScanner(
          controller: _controller,
          onDetect:   _onDetect,
        ),

        // Viewfinder overlay
        Center(
          child: Container(
            width:       260,
            height:      260,
            decoration:  BoxDecoration(
              border:       Border.all(color: BanzamiColors.wine, width: 2.5),
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
