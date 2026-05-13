import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../theme/banzami_theme.dart';
import '../utils/money_format.dart';

/// Displays a scannable QR code for a Banzami payment payload.
///
/// For static QR: shows the raw payload string.
/// For dynamic QR: shows payload + pre-set amount label.
class BanzamiQrDisplay extends StatelessWidget {
  /// The Base64url-encoded payload string produced by QrEngine.encode().
  final String payload;

  /// Optional label shown below the QR (e.g. "500 Kz").
  final String? amountLabel;

  /// Optional subtitle (e.g. "@handle" or "order-123").
  final String? subtitle;

  /// Size of the QR code in logical pixels. Default: 240.
  final double size;

  const BanzamiQrDisplay({
    super.key,
    required this.payload,
    this.amountLabel,
    this.subtitle,
    this.size = 240,
  });

  /// Convenience constructor for dynamic QR with an amount in minor units.
  factory BanzamiQrDisplay.dynamic({
    Key? key,
    required String payload,
    required int amountMinor,
    required String currency,
    String? reference,
    double size = 240,
  }) {
    return BanzamiQrDisplay(
      key:         key,
      payload:     payload,
      amountLabel: formatMinor(amountMinor, currency),
      subtitle:    reference,
      size:        size,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding:     const EdgeInsets.all(BanzamiSpacing.xl),
          decoration:  BoxDecoration(
            color:        BanzamiColors.white,
            borderRadius: BanzamiRadius.lgAll,
            border:       Border.all(color: BanzamiColors.gray100),
            boxShadow:    BanzamiShadows.card,
          ),
          child: QrImageView(
            data:            payload,
            version:         QrVersions.auto,
            size:            size,
            eyeStyle:        const QrEyeStyle(
              eyeShape: QrEyeShape.square,
              color:    BanzamiColors.wine,
            ),
            dataModuleStyle: const QrDataModuleStyle(
              dataModuleShape: QrDataModuleShape.square,
              color:           BanzamiColors.gray900,
            ),
            embeddedImage: null,
            backgroundColor: BanzamiColors.white,
          ),
        ),
        if (amountLabel != null) ...[
          const SizedBox(height: BanzamiSpacing.lg),
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
