import 'package:flutter/material.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

/// Canonical screen header for every primary screen across both the Consumer
/// and the Merchant (Business) applications.
///
/// This is the single source of truth for the title hierarchy: font size,
/// weight, line-height, letter-spacing and the surrounding spacing all live
/// here. Changing the typography here changes it for both apps at once — no
/// per-screen, per-app duplication is allowed.
///
/// Usage (tab / destination screen, no back button):
///   AppScreenHeader(title: 'Histórico', subtitle: 'As suas movimentações')
///   AppScreenHeader(title: 'Receber',   trailing: refreshButton)
///
/// Usage (pushed screen, with a back button):
///   AppScreenHeader(title: 'Nova cobrança', onBack: () => Navigator.pop(context))
class AppScreenHeader extends StatelessWidget {
  final String  title;
  final String? subtitle;

  /// Optional widget anchored to the trailing (right) edge, vertically aligned
  /// to the bottom of the title column. Use for icon buttons or badge counts.
  final Widget? trailing;

  /// When provided, a leading back button is rendered above the title and this
  /// callback fires on tap. Use for pushed (non-tab) screens.
  final VoidCallback? onBack;

  const AppScreenHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onBack,
  });

  @override
  Widget build(BuildContext context) {
    final titleRow = Row(
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
    );

    // Tab / destination screen: title sits directly under the safe-area top.
    if (onBack == null) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(
          BanzamiSpacing.xl,
          BanzamiSpacing.xl,
          BanzamiSpacing.xl,
          BanzamiSpacing.lg,
        ),
        child: titleRow,
      );
    }

    // Pushed screen: a back affordance above the big title (iOS large-title
    // rhythm). Top spacing is tightened since a back row precedes the title.
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        BanzamiSpacing.xl,
        BanzamiSpacing.md,
        BanzamiSpacing.xl,
        BanzamiSpacing.lg,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize:       MainAxisSize.min,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Transform.translate(
              offset: const Offset(-8, 0),
              child: IconButton(
                padding:        EdgeInsets.zero,
                visualDensity:  VisualDensity.compact,
                constraints:    const BoxConstraints.tightFor(width: 40, height: 40),
                icon: const Icon(
                  Icons.arrow_back_ios_new_rounded,
                  size:  20,
                  color: BanzamiColors.gray900,
                ),
                tooltip:   MaterialLocalizations.of(context).backButtonTooltip,
                onPressed: onBack,
              ),
            ),
          ),
          const SizedBox(height: BanzamiSpacing.sm),
          titleRow,
        ],
      ),
    );
  }
}
