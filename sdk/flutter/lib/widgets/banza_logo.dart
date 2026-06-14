import 'package:flutter/material.dart';

import '../utils/qr_logo_utils.dart';

/// Canonical Banza logo renderer — square icon with standard rounded corners.
///
/// Use this wherever the Banza icon appears in Flutter UI:
/// QR share cards, receipt screens, profile headers.
///
/// [cornerFraction] defaults to [kQrLogoCornerFraction] (0.22 — Apple app-icon
/// rounding), matching the corner style baked into QR centre logos.
class BanzamiLogoWidget extends StatelessWidget {
  final String assetPath;
  final double size;
  final double cornerFraction;
  final bool   hasShadow;

  const BanzamiLogoWidget({
    super.key,
    required this.assetPath,
    this.size            = 48,
    this.cornerFraction  = kQrLogoCornerFraction,
    this.hasShadow       = false,
  });

  @override
  Widget build(BuildContext context) {
    final radius = size * cornerFraction;
    Widget img = ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Image.asset(
        assetPath,
        width:  size,
        height: size,
        fit:    BoxFit.cover,
      ),
    );

    if (!hasShadow) return img;

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        boxShadow: [
          BoxShadow(
            color:      Colors.black.withValues(alpha: 0.12),
            blurRadius: 8,
            offset:     const Offset(0, 2),
          ),
        ],
      ),
      child: img,
    );
  }
}
