import 'package:flutter/material.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

/// Canonical header for the four main tab screens (Histórico, Receber, Perfil).
/// Enforces a single title scale, top rhythm, and horizontal alignment across tabs.
///
/// Usage:
///   TabScreenHeader(title: 'Histórico', subtitle: 'As suas movimentações')
///   TabScreenHeader(title: 'Receber',   trailing: refreshButton)
class TabScreenHeader extends StatelessWidget {
  final String  title;
  final String? subtitle;

  /// Optional widget anchored to the trailing (right) edge, vertically aligned
  /// to the bottom of the title column. Use for icon buttons or badge counts.
  final Widget? trailing;

  const TabScreenHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        BanzamiSpacing.xl,
        BanzamiSpacing.xl,
        BanzamiSpacing.xl,
        BanzamiSpacing.lg,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize:       MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: BanzamiTextStyles.displayMd.copyWith(
                    fontWeight:    FontWeight.w700,
                    letterSpacing: -0.5,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle!,
                    style: BanzamiTextStyles.bodySm.copyWith(
                      color: BanzamiColors.gray400,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (trailing != null) ...[
            const SizedBox(width: BanzamiSpacing.sm),
            trailing!,
          ],
        ],
      ),
    );
  }
}
