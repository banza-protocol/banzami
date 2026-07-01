import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../theme/banzami_theme.dart';
import '../utils/qr_logo_utils.dart';

/// The ONE canonical QR painter configuration for the whole Banzami ecosystem
/// (mirrors services/common/documents/qrengine.go and web banzami-qr.ts):
/// ECC **H**, red finder eyes, near-black (#111111 / gray900) data modules, and
/// an optional centre logo on a white box. Every Flutter QR — on-screen via
/// [BanzamiQr], or rasterized to PNG for sharing — is built from this, so they
/// can never visually diverge. [renderSize] is the target px size (drives the
/// centre-logo box). Apps use [BanzamiQr]; only SDK share/export code touches
/// this directly.
QrPainter banzamiQrPainter({
  required String payload,
  ui.Image? logo,
  double renderSize = 240,
}) {
  return QrPainter(
    data: payload,
    version: QrVersions.auto,
    errorCorrectionLevel: QrErrorCorrectLevel.H,
    eyeStyle: const QrEyeStyle(
      eyeShape: QrEyeShape.square,
      color: BanzamiColors.primary,
    ),
    dataModuleStyle: const QrDataModuleStyle(
      dataModuleShape: QrDataModuleShape.square,
      color: BanzamiColors.gray900,
    ),
    embeddedImage: logo,
    embeddedImageStyle: logo != null
        ? QrEmbeddedImageStyle(
            size: Size(renderSize * kQrEmbeddedBoxFraction,
                renderSize * kQrEmbeddedBoxFraction))
        : null,
  );
}

/// The canonical Banzami QR — the ONLY authorized QR renderer in the app
/// ecosystem (design system; mirrors the server engine in
/// services/common/documents/qrengine.go and the web `banzami-qr.ts`).
///
/// Spec (never diverge): error correction **H**, red finder "eyes"
/// ([BanzamiColors.primary]), near-black data modules ([BanzamiColors.gray900]),
/// centre Banzami logo on a white box. No screen uses `qr_flutter` directly —
/// they use this widget.
///
/// Loads [logo] once via an [ImageStream] and composes it with
/// [composeQrCenterLogo], avoiding the repeated-load bug in QrImageView's
/// internal FutureBuilder.
class BanzamiQr extends StatefulWidget {
  /// The payload to encode. Owned by the caller / SDK — never built here.
  final String payload;

  /// QR size in logical pixels.
  final double size;

  /// Centre logo. When [showLogo] is true and this is set, it is embedded on a
  /// white box at the centre (ECC stays H, so the occlusion is safe).
  final ImageProvider? logo;

  /// Whether to embed the centre logo. Default true.
  final bool showLogo;

  const BanzamiQr({
    super.key,
    required this.payload,
    this.size = 240,
    this.logo,
    this.showLogo = true,
  });

  @override
  State<BanzamiQr> createState() => _BanzamiQrState();
}

class _BanzamiQrState extends State<BanzamiQr> {
  ui.Image? _logoImage;
  ImageStream? _stream;
  ImageStreamListener? _listener;

  bool get _wantsLogo => widget.showLogo && widget.logo != null;

  @override
  void initState() {
    super.initState();
    if (_wantsLogo) _attach(widget.logo!);
  }

  @override
  void didUpdateWidget(BanzamiQr old) {
    super.didUpdateWidget(old);
    if (widget.logo != old.logo || widget.showLogo != old.showLogo) {
      _detach();
      setState(() => _logoImage = null);
      if (_wantsLogo) _attach(widget.logo!);
    }
  }

  @override
  void dispose() {
    _detach();
    super.dispose();
  }

  void _attach(ImageProvider provider) {
    _listener = ImageStreamListener((info, _) async {
      final composed = await composeQrCenterLogo(info.image);
      if (mounted) setState(() => _logoImage = composed);
    });
    _stream = provider.resolve(ImageConfiguration.empty);
    _stream!.addListener(_listener!);
  }

  void _detach() {
    if (_stream != null && _listener != null) {
      _stream!.removeListener(_listener!);
    }
    _stream = null;
    _listener = null;
  }

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size(widget.size, widget.size),
      painter: banzamiQrPainter(
        payload: widget.payload,
        logo: _logoImage,
        renderSize: widget.size,
      ),
    );
  }
}
