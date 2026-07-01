import 'package:flutter/material.dart';

import '../theme/banzami_theme.dart';
import '../utils/money_format.dart';
import 'banzami_qr.dart';

/// A QR "card" for a Banzami payment payload: the canonical [BanzamiQr] inside
/// the standard white rounded frame, with an optional amount + subtitle. Use
/// this for a full presentation; use [BanzamiQr] directly when you only need the
/// code. Neither renders `qr_flutter` in app code — this delegates to [BanzamiQr].
class BanzamiQrDisplay extends StatelessWidget {
  /// The payload string to encode in the QR.
  final String payload;

  /// Optional label shown below the QR (e.g. "500 Kz").
  final String? amountLabel;

  /// Optional subtitle (e.g. "@handle" or "order-123").
  final String? subtitle;

  /// Size of the QR code in logical pixels. Default: 240.
  final double size;

  /// Optional logo to embed at the centre of the QR.
  final ImageProvider? embeddedImage;

  const BanzamiQrDisplay({
    super.key,
    required this.payload,
    this.amountLabel,
    this.subtitle,
    this.size = 240,
    this.embeddedImage,
  });

  factory BanzamiQrDisplay.dynamic({
    Key? key,
    required String payload,
    required int amountMinor,
    required String currency,
    String? reference,
    double size = 240,
    ImageProvider? embeddedImage,
  }) {
    return BanzamiQrDisplay(
      key: key,
      payload: payload,
      amountLabel: formatMinor(amountMinor, currency),
      subtitle: reference,
      size: size,
      embeddedImage: embeddedImage,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.all(BanzamiSpacing.xl),
          decoration: BoxDecoration(
            color: BanzamiColors.white,
            borderRadius: BanzamiRadius.lgAll,
            border: Border.all(color: BanzamiColors.gray100),
            boxShadow: BanzamiShadows.card,
          ),
          child: BanzamiQr(
            payload: payload,
            size: size,
            logo: embeddedImage,
          ),
        ),
        if (amountLabel != null) ...[
          const SizedBox(height: BanzamiSpacing.sm),
          Text(
            amountLabel!,
            style: BanzamiTextStyles.monoLg.copyWith(color: BanzamiColors.gray900),
          ),
        ],
        if (subtitle != null) ...[
          const SizedBox(height: BanzamiSpacing.xs),
          Text(
            subtitle!,
            style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
          ),
        ],
      ],
    );
  }
}
