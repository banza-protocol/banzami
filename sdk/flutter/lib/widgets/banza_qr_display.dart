import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../theme/banza_theme.dart';
import '../utils/money_format.dart';
import '../utils/qr_logo_utils.dart';

/// Displays a scannable QR code for a Banzami payment payload.
///
/// Loads [embeddedImage] once via [ImageStream] and renders it with
/// [QrPainter] + [CustomPaint] to avoid the repeated-load bug in
/// QrImageView's internal FutureBuilder.
class BanzaQrDisplay extends StatefulWidget {
  /// The payload string to encode in the QR.
  final String payload;

  /// Optional label shown below the QR (e.g. "500 Kz").
  final String? amountLabel;

  /// Optional subtitle (e.g. "@handle" or "order-123").
  final String? subtitle;

  /// Size of the QR code in logical pixels. Default: 240.
  final double size;

  /// Optional logo to embed at the centre of the QR.
  /// When set, error correction is forced to H so the QR remains scannable.
  final ImageProvider? embeddedImage;

  const BanzaQrDisplay({
    super.key,
    required this.payload,
    this.amountLabel,
    this.subtitle,
    this.size = 240,
    this.embeddedImage,
  });

  factory BanzaQrDisplay.dynamic({
    Key? key,
    required String payload,
    required int amountMinor,
    required String currency,
    String? reference,
    double size = 240,
    ImageProvider? embeddedImage,
  }) {
    return BanzaQrDisplay(
      key:           key,
      payload:       payload,
      amountLabel:   formatMinor(amountMinor, currency),
      subtitle:      reference,
      size:          size,
      embeddedImage: embeddedImage,
    );
  }

  @override
  State<BanzaQrDisplay> createState() => _BanzaQrDisplayState();
}

class _BanzaQrDisplayState extends State<BanzaQrDisplay> {
  ui.Image?           _loadedImage;
  ImageStream?        _stream;
  ImageStreamListener? _listener;

  @override
  void initState() {
    super.initState();
    _attachStream(widget.embeddedImage);
  }

  @override
  void didUpdateWidget(BanzaQrDisplay old) {
    super.didUpdateWidget(old);
    if (widget.embeddedImage != old.embeddedImage) {
      _detachStream();
      _attachStream(widget.embeddedImage);
    }
  }

  @override
  void dispose() {
    _detachStream();
    super.dispose();
  }

  void _attachStream(ImageProvider? provider) {
    if (provider == null) return;
    _listener = ImageStreamListener((info, _) => _applyRounding(info.image));
    _stream = provider.resolve(ImageConfiguration.empty);
    _stream!.addListener(_listener!);
  }

  Future<void> _applyRounding(ui.Image raw) async {
    final rounded = await roundQrLogoCorners(raw);
    if (mounted) setState(() => _loadedImage = rounded);
  }

  void _detachStream() {
    if (_stream != null && _listener != null) {
      _stream!.removeListener(_listener!);
    }
    _stream   = null;
    _listener = null;
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding:    const EdgeInsets.all(BanzaSpacing.xl),
          decoration: BoxDecoration(
            color:        BanzaColors.white,
            borderRadius: BanzaRadius.lgAll,
            border:       Border.all(color: BanzaColors.gray100),
            boxShadow:    BanzaShadows.card,
          ),
          child: CustomPaint(
            size: Size(widget.size, widget.size),
            painter: QrPainter(
              data:                 widget.payload,
              version:              QrVersions.auto,
              errorCorrectionLevel: widget.embeddedImage != null
                  ? QrErrorCorrectLevel.H
                  : QrErrorCorrectLevel.M,
              eyeStyle:        const QrEyeStyle(
                eyeShape: QrEyeShape.square,
                color:    BanzaColors.wine,
              ),
              dataModuleStyle: const QrDataModuleStyle(
                dataModuleShape: QrDataModuleShape.square,
                color:           BanzaColors.gray900,
              ),
              embeddedImage:      _loadedImage,
              embeddedImageStyle: _loadedImage != null
                  ? QrEmbeddedImageStyle(size: Size(widget.size * 0.2, widget.size * 0.2))
                  : null,
            ),
          ),
        ),
        if (widget.amountLabel != null) ...[
          const SizedBox(height: BanzaSpacing.sm),
          Text(
            widget.amountLabel!,
            style: BanzaTextStyles.monoLg.copyWith(color: BanzaColors.gray900),
          ),
        ],
        if (widget.subtitle != null) ...[
          const SizedBox(height: BanzaSpacing.xs),
          Text(
            widget.subtitle!,
            style: BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray400),
          ),
        ],
      ],
    );
  }
}
