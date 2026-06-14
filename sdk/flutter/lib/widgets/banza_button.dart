import 'package:flutter/material.dart';

import '../theme/banza_theme.dart';

enum BanzamiButtonVariant { primary, secondary, ghost, destructive }

/// The canonical Banzami branded button.
///
/// Always 48dp tall on mobile. Never smaller than a 44dp touch target.
/// Text is always sentence case, never all-caps.
class BanzamiButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final BanzamiButtonVariant variant;
  final bool isLoading;
  final bool fullWidth;
  final Widget? icon;

  const BanzamiButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant    = BanzamiButtonVariant.primary,
    this.isLoading  = false,
    this.fullWidth  = true,
    this.icon,
  });

  const BanzamiButton.secondary({
    super.key,
    required this.label,
    this.onPressed,
    this.isLoading = false,
    this.fullWidth = true,
    this.icon,
  }) : variant = BanzamiButtonVariant.secondary;

  const BanzamiButton.ghost({
    super.key,
    required this.label,
    this.onPressed,
    this.isLoading = false,
    this.fullWidth = false,
    this.icon,
  }) : variant = BanzamiButtonVariant.ghost;

  const BanzamiButton.destructive({
    super.key,
    required this.label,
    this.onPressed,
    this.isLoading = false,
    this.fullWidth = true,
    this.icon,
  }) : variant = BanzamiButtonVariant.destructive;

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
                  const SizedBox(width: BanzamiSpacing.sm),
                  Text(label, style: _textStyle),
                ],
              )
            : Text(label, style: _textStyle);

    final button = switch (variant) {
      BanzamiButtonVariant.primary => ElevatedButton(
          onPressed: isLoading ? null : onPressed,
          style: ElevatedButton.styleFrom(
            backgroundColor: BanzamiColors.primary,
            foregroundColor: BanzamiColors.white,
            minimumSize:     Size(fullWidth ? double.infinity : 0, 48),
            shape:           const RoundedRectangleBorder(
              borderRadius: BanzamiRadius.mdAll,
            ),
            elevation: 0,
          ),
          child: child,
        ),
      BanzamiButtonVariant.secondary => OutlinedButton(
          onPressed: isLoading ? null : onPressed,
          style: OutlinedButton.styleFrom(
            foregroundColor: BanzamiColors.primary,
            minimumSize:     Size(fullWidth ? double.infinity : 0, 48),
            shape:           const RoundedRectangleBorder(
              borderRadius: BanzamiRadius.mdAll,
            ),
            side: const BorderSide(color: BanzamiColors.primary, width: 1.5),
          ),
          child: child,
        ),
      BanzamiButtonVariant.ghost => TextButton(
          onPressed: isLoading ? null : onPressed,
          child: child,
        ),
      BanzamiButtonVariant.destructive => ElevatedButton(
          onPressed: isLoading ? null : onPressed,
          style: ElevatedButton.styleFrom(
            backgroundColor: BanzamiColors.error,
            foregroundColor: BanzamiColors.white,
            minimumSize:     Size(fullWidth ? double.infinity : 0, 48),
            shape:           const RoundedRectangleBorder(
              borderRadius: BanzamiRadius.mdAll,
            ),
            elevation: 0,
          ),
          child: child,
        ),
    };

    return button;
  }

  Color get _contentColor => switch (variant) {
    BanzamiButtonVariant.primary     => BanzamiColors.white,
    BanzamiButtonVariant.secondary   => BanzamiColors.primary,
    BanzamiButtonVariant.ghost       => BanzamiColors.primary,
    BanzamiButtonVariant.destructive => BanzamiColors.white,
  };

  TextStyle get _textStyle => BanzamiTextStyles.label.copyWith(
    fontSize:   15,
    fontWeight: FontWeight.w600,
    color:      _contentColor,
  );
}
