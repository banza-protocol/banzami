import 'dart:ui' as ui;

import 'package:flutter/material.dart';

/// Corner-radius fraction applied to QR centre logos (≈ Apple app-icon rounding).
const double kQrLogoCornerFraction = 0.22;

/// Returns a copy of [src] with smooth rounded corners baked in.
///
/// [QrPainter.embeddedImage] renders the raw [ui.Image] without clipping.
/// Pre-processing with this function produces premium, anti-aliased corners
/// that are consistent across every QR surface in the Banza ecosystem.
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
  final canvas   = Canvas(recorder);

  final paint = Paint()
    ..isAntiAlias   = true
    ..filterQuality = FilterQuality.high;

  canvas.clipPath(
    Path()..addRRect(RRect.fromRectAndRadius(
      Rect.fromLTWH(0, 0, w, h),
      Radius.circular(r),
    )),
    doAntiAlias: true,
  );
  canvas.drawImage(src, Offset.zero, paint);

  return recorder.endRecording().toImage(src.width, src.height);
}
