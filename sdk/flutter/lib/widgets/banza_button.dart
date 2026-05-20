import 'package:flutter/material.dart';

import '../theme/banza_theme.dart';

enum BanzaButtonVariant { primary, secondary, ghost, destructive }

/// The canonical Banzami branded button.
///
/// Always 48dp tall on mobile. Never smaller than a 44dp touch target.
/// Text is always sentence case, never all-caps.
class BanzaButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final BanzaButtonVariant variant;
  final bool isLoading;
  final bool fullWidth;
  final Widget? icon;

  const BanzaButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant    = BanzaButtonVariant.primary,
    this.isLoading  = false,
    this.fullWidth  = true,
    this.icon,
  });

  const BanzaButton.secondary({
    super.key,
    required this.label,
    this.onPressed,
    this.isLoading = false,
    this.fullWidth = true,
    this.icon,
  }) : variant = BanzaButtonVariant.secondary;

  const BanzaButton.ghost({
    super.key,
    required this.label,
    this.onPressed,
    this.isLoading = false,
    this.fullWidth = false,
    this.icon,
  }) : variant = BanzaButtonVariant.ghost;

  const BanzaButton.destructive({
    super.key,
    required this.label,
    this.onPressed,
    this.isLoading = false,
    this.fullWidth = true,
    this.icon,
  }) : variant = BanzaButtonVariant.destructive;

  @override
  Widget build(BuildContext context) {
    final child = isLoading
        ? SizedBox(
            width:  20,
            height: 20,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: _contentColor,
            ),
          )
        : icon != null
            ? Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  icon!,
                  const SizedBox(width: BanzaSpacing.sm),
                  Text(label, style: _textStyle),
                ],
              )
            : Text(label, style: _textStyle);

    final button = switch (variant) {
      BanzaButtonVariant.primary => ElevatedButton(
          onPressed: isLoading ? null : onPressed,
          style: ElevatedButton.styleFrom(
            backgroundColor: BanzaColors.wine,
            foregroundColor: BanzaColors.white,
            minimumSize:     Size(fullWidth ? double.infinity : 0, 48),
            shape:           const RoundedRectangleBorder(
              borderRadius: BanzaRadius.mdAll,
            ),
            elevation: 0,
          ),
          child: child,
        ),
      BanzaButtonVariant.secondary => OutlinedButton(
          onPressed: isLoading ? null : onPressed,
          style: OutlinedButton.styleFrom(
            foregroundColor: BanzaColors.wine,
            minimumSize:     Size(fullWidth ? double.infinity : 0, 48),
            shape:           const RoundedRectangleBorder(
              borderRadius: BanzaRadius.mdAll,
            ),
            side: const BorderSide(color: BanzaColors.wine, width: 1.5),
          ),
          child: child,
        ),
      BanzaButtonVariant.ghost => TextButton(
          onPressed: isLoading ? null : onPressed,
          child: child,
        ),
      BanzaButtonVariant.destructive => ElevatedButton(
          onPressed: isLoading ? null : onPressed,
          style: ElevatedButton.styleFrom(
            backgroundColor: BanzaColors.error,
            foregroundColor: BanzaColors.white,
            minimumSize:     Size(fullWidth ? double.infinity : 0, 48),
            shape:           const RoundedRectangleBorder(
              borderRadius: BanzaRadius.mdAll,
            ),
            elevation: 0,
          ),
          child: child,
        ),
    };

    return button;
  }

  Color get _contentColor => switch (variant) {
    BanzaButtonVariant.primary     => BanzaColors.white,
    BanzaButtonVariant.secondary   => BanzaColors.wine,
    BanzaButtonVariant.ghost       => BanzaColors.wine,
    BanzaButtonVariant.destructive => BanzaColors.white,
  };

  TextStyle get _textStyle => BanzaTextStyles.label.copyWith(
    fontSize:   15,
    fontWeight: FontWeight.w600,
    color:      _contentColor,
  );
}
