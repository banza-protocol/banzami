import 'package:flutter/material.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

/// Semantic tone for a [MerchantStatusBadge], mapped to design-system tokens
/// only — never hardcoded colours.
enum MerchantBadgeTone { success, warning, info, neutral }

/// A small pill badge (e.g. "Verificado", "Sandbox", "KYB pendente") used
/// across the Banzami Business surfaces. Colours come exclusively from
/// [BanzamiColors] so the badge stays on-brand and consistent.
class MerchantStatusBadge extends StatelessWidget {
  final String label;
  final IconData? icon;
  final MerchantBadgeTone tone;

  const MerchantStatusBadge({
    super.key,
    required this.label,
    this.icon,
    this.tone = MerchantBadgeTone.neutral,
  });

  (Color fg, Color bg) get _palette {
    switch (tone) {
      case MerchantBadgeTone.success:
        return (BanzamiColors.success, BanzamiColors.successBg);
      case MerchantBadgeTone.warning:
        return (BanzamiColors.warning, BanzamiColors.warningBg);
      case MerchantBadgeTone.info:
        return (BanzamiColors.info, BanzamiColors.infoBg);
      case MerchantBadgeTone.neutral:
        return (BanzamiColors.gray600, BanzamiColors.gray100);
    }
  }

  @override
  Widget build(BuildContext context) {
    final (fg, bg) = _palette;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BanzamiSpacing.md,
        vertical: BanzamiSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BanzamiRadius.fullAll,
        border: Border.all(color: fg.withValues(alpha: 0.25)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: fg),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: BanzamiTextStyles.label.copyWith(color: fg, fontSize: 11),
          ),
        ],
      ),
    );
  }
}
