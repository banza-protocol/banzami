import 'dart:ui' as ui;

import 'package:flutter/material.dart';

/// Corner-radius fraction applied to QR centre logos (≈ Apple app-icon rounding).
const double kQrLogoCornerFraction = 0.22;

/// Logo width as a fraction of the QR width (spec: 18–20%). Shared by every QR
/// surface so Consumer and Merchant render the centre logo at the same size.
const double kQrLogoFraction = 0.19;

/// Uniform white margin around the logo, as a fraction of the logo size (each
/// side). Produces the white "legibility" square behind the logo.
const double kQrLogoMarginFraction = 0.16;

/// Width of the white centre square as a fraction of the QR width — the value to
/// pass to `QrEmbeddedImageStyle.size`. box = logo · (1 + 2·margin) ≈ 0.25.
const double kQrEmbeddedBoxFraction =
    kQrLogoFraction * (1 + 2 * kQrLogoMarginFraction);

/// Returns a copy of [src] with smooth rounded corners baked in.
///
/// [QrPainter.embeddedImage] renders the raw [ui.Image] without clipping.
/// Pre-processing with this function produces premium, anti-aliased corners
/// that are consistent across every QR surface in the Banzami ecosystem.
///
/// [cornerFraction] is the corner radius expressed as a fraction of the
/// image width. Default [kQrLogoCornerFraction] ≈ Apple's app-icon rounding.
Future<ui.Image> roundQrLogoCorners(
  ui.Image src, {
  double cornerFraction = kQrLogoCornerFraction,
}) async {
  final w = src.width.toDouble();
  final h = src.height.toDouble();
  final r = (w * cornerFraction).clamp(1.0, w / 2);

  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);

  final paint = Paint()
    ..isAntiAlias = true
    ..filterQuality = FilterQuality.high;

  canvas.clipPath(
    Path()
      ..addRRect(RRect.fromRectAndRadius(
        Rect.fromLTWH(0, 0, w, h),
        Radius.circular(r),
      )),
    doAntiAlias: true,
  );
  canvas.drawImage(src, Offset.zero, paint);

  return recorder.endRecording().toImage(src.width, src.height);
}

/// Builds the canonical QR centre asset: the official [logo] centred on a white,
/// rounded-corner square with a uniform white margin. This is the single shared
/// composition used by every QR surface (Consumer + Merchant); the only thing
/// that changes between apps is which logo is passed in.
///
/// Pass the result as the qr_flutter `embeddedImage`, with
/// `QrEmbeddedImageStyle.size = qrWidth * kQrEmbeddedBoxFraction`. The logo then
/// occupies ≈[kQrLogoFraction] of the QR width, never sitting directly on the
/// modules. No badges, overlays, text or effects are added — only the PNG.
Future<ui.Image> composeQrCenterLogo(
  ui.Image logo, {
  double cornerFraction = kQrLogoCornerFraction,
  double marginFraction = kQrLogoMarginFraction,
}) async {
  const int box = 240; // fixed high-res canvas; scaled by qr_flutter on draw
  final double boxF = box.toDouble();
  final double logoSize = boxF / (1 + 2 * marginFraction);
  final double pad = (boxF - logoSize) / 2;

  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  final paint = Paint()
    ..isAntiAlias = true
    ..filterQuality = FilterQuality.high;

  // White rounded square — the legibility backing behind the logo.
  canvas.drawRRect(
    RRect.fromRectAndRadius(
      Rect.fromLTWH(0, 0, boxF, boxF),
      Radius.circular(boxF * cornerFraction),
    ),
    Paint()
      ..color = const Color(0xFFFFFFFF)
      ..isAntiAlias = true,
  );

  // Official logo, centred with a uniform white margin and matching rounded
  // corners. Nothing else is drawn.
  canvas.save();
  canvas.clipRRect(
    RRect.fromRectAndRadius(
      Rect.fromLTWH(pad, pad, logoSize, logoSize),
      Radius.circular(logoSize * cornerFraction),
    ),
    doAntiAlias: true,
  );
  canvas.drawImageRect(
    logo,
    Rect.fromLTWH(0, 0, logo.width.toDouble(), logo.height.toDouble()),
    Rect.fromLTWH(pad, pad, logoSize, logoSize),
    paint,
  );
  canvas.restore();

  return recorder.endRecording().toImage(box, box);
}
