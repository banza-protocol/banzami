import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import '../theme/banza_theme.dart';

/// Async camera permission gate for QR scanner flows.
///
/// Call [ensure] before navigating to any scanner screen.
/// Returns true only when camera is ready to use.
class BanzaCameraPermission {
  BanzaCameraPermission._();

  /// Ensures camera permission is granted before proceeding.
  ///
  /// Flow:
  ///   granted           → returns true immediately
  ///   denied            → requests iOS/Android permission dialog
  ///   granted after req → returns true
  ///   permanentlyDenied → shows Settings dialog, returns false
  ///   restricted        → shows unavailable toast, returns false
  static Future<bool> ensure(BuildContext context) async {
    debugPrint('[QR-CAMERA] opening scanner');

    var status = await Permission.camera.status;
    debugPrint('[QR-CAMERA] currentStatus=$status');

    if (status.isGranted) {
      debugPrint('[QR-CAMERA] permission granted');
      return true;
    }

    if (status.isRestricted) {
      debugPrint('[QR-CAMERA] permission restricted');
      if (context.mounted) {
        _showToast(context, 'Câmara não disponível neste dispositivo.');
      }
      return false;
    }

    if (status.isPermanentlyDenied) {
      debugPrint('[QR-CAMERA] permission permanentlyDenied');
      if (context.mounted) await _showSettingsDialog(context);
      return false;
    }

    // denied — show iOS / Android system dialog
    debugPrint('[QR-CAMERA] requesting permission');
    status = await Permission.camera.request();
    debugPrint('[QR-CAMERA] permission after request=$status');

    if (status.isGranted) {
      debugPrint('[QR-CAMERA] permission granted');
      return true;
    }

    if (status.isPermanentlyDenied) {
      debugPrint('[QR-CAMERA] permission permanentlyDenied');
      if (context.mounted) await _showSettingsDialog(context);
      return false;
    }

    debugPrint('[QR-CAMERA] permission denied');
    return false;
  }

  // ── Permanently denied dialog ──────────────────────────────────────────────

  static Future<void> _showSettingsDialog(BuildContext context) async {
    await showDialog<void>(
      context:     context,
      barrierColor: Colors.black54,
      builder:     (ctx) => Dialog(
        shape:           RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        backgroundColor: BanzaColors.white,
        insetPadding:    const EdgeInsets.symmetric(horizontal: 32),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 28, 24, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64, height: 64,
                decoration: const BoxDecoration(
                  color: BanzaColors.gray100,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.camera_alt_outlined,
                  color: BanzaColors.gray400,
                  size: 32,
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Câmara não autorizada',
                style:     TextStyle(
                  fontSize:   17,
                  fontWeight: FontWeight.w600,
                  color:      BanzaColors.gray900,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              const Text(
                'Para ler códigos QR de pagamento, autorize o acesso à câmara nas Definições.',
                style:     TextStyle(
                  fontSize: 14,
                  color:    BanzaColors.gray400,
                  height:   1.4,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        side:    const BorderSide(color: BanzaColors.gray200),
                        shape:   RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        padding: const EdgeInsets.symmetric(vertical: 13),
                      ),
                      onPressed: () => Navigator.of(ctx).pop(),
                      child: const Text(
                        'Cancelar',
                        style: TextStyle(color: BanzaColors.gray400, fontSize: 15),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: BanzaColors.wine,
                        shape:          RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        padding:        const EdgeInsets.symmetric(vertical: 13),
                      ),
                      onPressed: () {
                        Navigator.of(ctx).pop();
                        openAppSettings();
                      },
                      child: const Text(
                        'Abrir definições',
                        style: TextStyle(fontSize: 15),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  static void _showToast(BuildContext context, String message) {
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(
      SnackBar(
        content:         Text(message),
        backgroundColor: BanzaColors.gray900,
        behavior:        SnackBarBehavior.floating,
      ),
    );
  }
}
