import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/banza_theme.dart';

// =============================================================================
// BanzaScaffold — consistent page scaffold with light gradient background
// =============================================================================

class BanzaScaffold extends StatelessWidget {
  final Widget body;
  final PreferredSizeWidget? appBar;
  final Widget? bottomNavigationBar;
  final Color? backgroundColor;
  final bool resizeToAvoidBottomInset;

  const BanzaScaffold({
    super.key,
    required this.body,
    this.appBar,
    this.bottomNavigationBar,
    this.backgroundColor,
    this.resizeToAvoidBottomInset = true,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar:                    appBar,
      backgroundColor:           backgroundColor ?? BanzaColors.offWhite,
      resizeToAvoidBottomInset:  resizeToAvoidBottomInset,
      bottomNavigationBar:       bottomNavigationBar,
      body: body,
    );
  }
}

// =============================================================================
// BanzaAppBar — clean, minimal app bar
// =============================================================================

class BanzaAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String? title;
  final Widget? titleWidget;
  final List<Widget>? actions;
  final bool showBack;
  final Color backgroundColor;
  final Color foregroundColor;
  final VoidCallback? onBack;

  const BanzaAppBar({
    super.key,
    this.title,
    this.titleWidget,
    this.actions,
    this.showBack = true,
    this.backgroundColor = BanzaColors.offWhite,
    this.foregroundColor = BanzaColors.gray900,
    this.onBack,
  });

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      backgroundColor:        backgroundColor,
      foregroundColor:        foregroundColor,
      elevation:              0,
      scrolledUnderElevation: 0,
      centerTitle:            false,
      automaticallyImplyLeading: showBack,
      leading: showBack
          ? IconButton(
              icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
              onPressed: onBack ?? () => Navigator.of(context).pop(),
            )
          : null,
      title: titleWidget ??
          (title != null
              ? Text(title!, style: BanzaTextStyles.headingSm.copyWith(color: foregroundColor))
              : null),
      actions: actions,
      surfaceTintColor: Colors.transparent,
    );
  }
}

// =============================================================================
// BanzaCard — floating white card with premium shadow
// =============================================================================

class BanzaCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final BorderRadius? borderRadius;
  final Color color;
  final List<BoxShadow>? shadow;
  final VoidCallback? onTap;
  final Border? border;

  const BanzaCard({
    super.key,
    required this.child,
    this.padding,
    this.borderRadius,
    this.color = BanzaColors.white,
    this.shadow,
    this.onTap,
    this.border,
  });

  @override
  Widget build(BuildContext context) {
    final br = borderRadius ?? BanzaRadius.xlAll;
    final sh = shadow ?? BanzaShadows.card;

    Widget container = Container(
      decoration: BoxDecoration(
        color:        color,
        borderRadius: br,
        boxShadow:    sh,
        border:       border,
      ),
      padding: padding,
      child:   child,
    );

    if (onTap != null) {
      return Material(
        color:        Colors.transparent,
        borderRadius: br,
        child: InkWell(
          onTap:        onTap,
          borderRadius: br,
          child:        container,
        ),
      );
    }

    return container;
  }
}

// =============================================================================
// BanzaGlassCard — semi-transparent card for dark backgrounds
// =============================================================================

class BanzaGlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final double opacity;

  const BanzaGlassCard({
    super.key,
    required this.child,
    this.padding,
    this.opacity = 0.12,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color:        BanzaColors.white.withValues(alpha: opacity),
        borderRadius: BanzaRadius.xlAll,
        border: Border.all(
          color: BanzaColors.white.withValues(alpha: opacity * 1.5),
          width: 1,
        ),
      ),
      padding: padding ?? const EdgeInsets.all(BanzaSpacing.lg),
      child:   child,
    );
  }
}

// =============================================================================
// BanzaPrimaryButton — full-width cherry/wine CTA with haptics
// =============================================================================

class BanzaPrimaryButton extends StatefulWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;
  final bool fullWidth;
  final IconData? icon;
  final Color? backgroundColor;
  final Color? foregroundColor;
  final double height;

  const BanzaPrimaryButton({
    super.key,
    required this.label,
    this.onPressed,
    this.isLoading    = false,
    this.fullWidth    = true,
    this.icon,
    this.backgroundColor,
    this.foregroundColor,
    this.height       = 52,
  });

  @override
  State<BanzaPrimaryButton> createState() => _BanzaPrimaryButtonState();
}

class _BanzaPrimaryButtonState extends State<BanzaPrimaryButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double>   _scale;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync:    this,
      duration: BanzaMotion.fast,
      lowerBound: 0.0,
      upperBound: 1.0,
      value: 1.0,
    );
    _scale = Tween<double>(begin: 1.0, end: 0.96).animate(
      CurvedAnimation(parent: _controller, curve: BanzaMotion.standard),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onTap() async {
    if (widget.onPressed == null || widget.isLoading) return;
    HapticFeedback.lightImpact();
    await _controller.reverse();
    await _controller.forward();
    widget.onPressed!();
  }

  @override
  Widget build(BuildContext context) {
    final bg = widget.backgroundColor ?? BanzaColors.wine;
    final fg = widget.foregroundColor ?? BanzaColors.white;

    return ScaleTransition(
      scale: _scale,
      child: GestureDetector(
        onTapDown:   (_) => _controller.reverse(),
        onTapUp:     (_) => _controller.forward(),
        onTapCancel: ()  => _controller.forward(),
        onTap:       _onTap,
        child: Container(
          height: widget.height,
          width:  widget.fullWidth ? double.infinity : null,
          decoration: BoxDecoration(
            color:        widget.onPressed == null || widget.isLoading
                ? bg.withValues(alpha: 0.5)
                : bg,
            borderRadius: BanzaRadius.lgAll,
          ),
          alignment: Alignment.center,
          child: widget.isLoading
              ? SizedBox(
                  width:  20,
                  height: 20,
                  child:  CircularProgressIndicator(
                    color:       fg,
                    strokeWidth: 2,
                  ),
                )
              : Row(
                  mainAxisSize:     MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (widget.icon != null) ...[
                      Icon(widget.icon, color: fg, size: 18),
                      const SizedBox(width: BanzaSpacing.sm),
                    ],
                    Text(
                      widget.label,
                      style: BanzaTextStyles.headingSm.copyWith(
                        color:      fg,
                        fontWeight: FontWeight.w600,
                        fontSize:   16,
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

// =============================================================================
// BanzaSecondaryButton — outlined button
// =============================================================================

class BanzaSecondaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool fullWidth;
  final Color? borderColor;
  final Color? foregroundColor;
  final double height;

  const BanzaSecondaryButton({
    super.key,
    required this.label,
    this.onPressed,
    this.fullWidth     = true,
    this.borderColor,
    this.foregroundColor,
    this.height        = 52,
  });

  @override
  Widget build(BuildContext context) {
    final fg = foregroundColor ?? BanzaColors.wine;
    final bc = borderColor ?? BanzaColors.wine;

    return SizedBox(
      height: height,
      width:  fullWidth ? double.infinity : null,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: fg,
          side: BorderSide(color: bc, width: 1.5),
          shape: const RoundedRectangleBorder(borderRadius: BanzaRadius.lgAll),
          textStyle: BanzaTextStyles.headingSm.copyWith(
            fontWeight: FontWeight.w600,
            fontSize:   16,
          ),
        ),
        child: Text(label),
      ),
    );
  }
}

// =============================================================================
// BanzaGhostButton — text-only button
// =============================================================================

class BanzaGhostButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final Color? color;

  const BanzaGhostButton({
    super.key,
    required this.label,
    this.onPressed,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        foregroundColor: color ?? BanzaColors.gray600,
        textStyle: BanzaTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w500),
      ),
      child: Text(label),
    );
  }
}

// =============================================================================
// BanzaSectionTitle — section header with optional trailing action
// =============================================================================

class BanzaSectionTitle extends StatelessWidget {
  final String title;
  final String? action;
  final VoidCallback? onAction;
  final EdgeInsetsGeometry? padding;

  const BanzaSectionTitle({
    super.key,
    required this.title,
    this.action,
    this.onAction,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding ??
          const EdgeInsets.symmetric(horizontal: BanzaSpacing.xl),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: BanzaTextStyles.headingSm.copyWith(
                color:      BanzaColors.gray900,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          if (action != null)
            GestureDetector(
              onTap: onAction,
              child: Text(
                action!,
                style: BanzaTextStyles.label.copyWith(
                  color:    BanzaColors.wine,
                  fontSize: 13,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// =============================================================================
// BanzaActionTile — rounded icon+label action button (home screen quick actions)
// =============================================================================

class BanzaActionTile extends StatefulWidget {
  final IconData icon;
  final String   label;
  final VoidCallback onTap;
  final bool primary;

  const BanzaActionTile({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.primary = false,
  });

  @override
  State<BanzaActionTile> createState() => _BanzaActionTileState();
}

class _BanzaActionTileState extends State<BanzaActionTile>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double>   _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync:    this,
      duration: BanzaMotion.fast,
      value:    1.0,
    );
    _scale = Tween(begin: 1.0, end: 0.92).animate(
      CurvedAnimation(parent: _ctrl, curve: BanzaMotion.standard),
    );
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final bg = widget.primary ? BanzaColors.wine   : BanzaColors.white;
    final fg = widget.primary ? BanzaColors.white  : BanzaColors.gray900;
    final shadowColor = widget.primary
        ? BanzaColors.wine.withValues(alpha: 0.30)
        : const Color(0x0D000000);

    return Expanded(
      child: ScaleTransition(
        scale: _scale,
        child: GestureDetector(
          onTapDown:   (_) { HapticFeedback.selectionClick(); _ctrl.reverse(); },
          onTapUp:     (_) { _ctrl.forward(); widget.onTap(); },
          onTapCancel: ()  => _ctrl.forward(),
          child: Container(
            padding: const EdgeInsets.symmetric(
              vertical: BanzaSpacing.lg,
            ),
            decoration: BoxDecoration(
              color:        bg,
              borderRadius: BanzaRadius.xlAll,
              boxShadow: [
                BoxShadow(
                  color:      shadowColor,
                  blurRadius: 12,
                  offset:     const Offset(0, 4),
                ),
                BoxShadow(
                  color:      const Color(0x08000000),
                  blurRadius: 2,
                  offset:     const Offset(0, 1),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width:  40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: widget.primary
                        ? BanzaColors.white.withValues(alpha: 0.18)
                        : BanzaColors.gray100,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(widget.icon, color: fg, size: 20),
                ),
                const SizedBox(height: BanzaSpacing.sm),
                Text(
                  widget.label,
                  style: BanzaTextStyles.label.copyWith(
                    color:      fg,
                    fontWeight: FontWeight.w600,
                    fontSize:   12,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// BanzaActivityRow — premium activity list item
// =============================================================================

class BanzaActivityRow extends StatelessWidget {
  final String title;
  final String subtitle;
  final String amount;
  final String time;
  final bool   isCredit;
  final Widget? leading;
  final VoidCallback? onTap;

  const BanzaActivityRow({
    super.key,
    required this.title,
    required this.subtitle,
    required this.amount,
    required this.time,
    required this.isCredit,
    this.leading,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: BanzaSpacing.xl,
          vertical:   BanzaSpacing.md + 2,
        ),
        child: Row(
          children: [
            // Avatar
            leading ?? _DefaultAvatar(letter: title[0]),
            const SizedBox(width: BanzaSpacing.md),
            // Title + subtitle
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize:       MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: BanzaTextStyles.bodyMd.copyWith(
                      color:      BanzaColors.gray900,
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines:  1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: BanzaTextStyles.bodySm.copyWith(
                      color: BanzaColors.gray400,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: BanzaSpacing.md),
            // Amount + time
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize:       MainAxisSize.min,
              children: [
                Text(
                  amount,
                  style: BanzaTextStyles.bodyMd.copyWith(
                    color:      isCredit ? BanzaColors.success : BanzaColors.gray900,
                    fontWeight: FontWeight.w700,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  time,
                  style: BanzaTextStyles.bodySm.copyWith(
                    color: BanzaColors.gray400,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _DefaultAvatar extends StatelessWidget {
  final String letter;
  const _DefaultAvatar({required this.letter});

  @override
  Widget build(BuildContext context) {
    return Container(
      width:  44,
      height: 44,
      decoration: const BoxDecoration(
        gradient: BanzaGradients.wine,
        shape:    BoxShape.circle,
      ),
      child: Center(
        child: Text(
          letter.toUpperCase(),
          style: BanzaTextStyles.headingSm.copyWith(
            color:      BanzaColors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// BanzaTextField — styled text input
// =============================================================================

class BanzaTextField extends StatelessWidget {
  final TextEditingController? controller;
  final FocusNode?             focusNode;
  final String?                label;
  final String?                hint;
  final String?                errorText;
  final TextInputType?         keyboardType;
  final TextInputAction?       textInputAction;
  final ValueChanged<String>?  onChanged;
  final VoidCallback?          onEditingComplete;
  final Widget?                suffix;
  final Widget?                prefix;
  final bool                   enabled;
  final bool                   readOnly;
  final VoidCallback?          onTap;

  const BanzaTextField({
    super.key,
    this.controller,
    this.focusNode,
    this.label,
    this.hint,
    this.errorText,
    this.keyboardType,
    this.textInputAction,
    this.onChanged,
    this.onEditingComplete,
    this.suffix,
    this.prefix,
    this.enabled   = true,
    this.readOnly  = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller:        controller,
      focusNode:         focusNode,
      keyboardType:      keyboardType,
      textInputAction:   textInputAction,
      onChanged:         onChanged,
      onEditingComplete: onEditingComplete,
      enabled:           enabled,
      readOnly:          readOnly,
      onTap:             onTap,
      style: BanzaTextStyles.bodyLg.copyWith(color: BanzaColors.gray900),
      decoration: InputDecoration(
        labelText:  label,
        hintText:   hint,
        errorText:  errorText,
        filled:     true,
        fillColor:  BanzaColors.gray100,
        suffixIcon: suffix,
        prefixIcon: prefix,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: BanzaSpacing.lg,
          vertical:   BanzaSpacing.md + 2,
        ),
        border: const OutlineInputBorder(
          borderRadius: BanzaRadius.lgAll,
          borderSide:   BorderSide.none,
        ),
        enabledBorder: const OutlineInputBorder(
          borderRadius: BanzaRadius.lgAll,
          borderSide:   BorderSide.none,
        ),
        focusedBorder: const OutlineInputBorder(
          borderRadius: BanzaRadius.lgAll,
          borderSide:   BorderSide(color: BanzaColors.wine, width: 1.5),
        ),
        errorBorder: const OutlineInputBorder(
          borderRadius: BanzaRadius.lgAll,
          borderSide:   BorderSide(color: BanzaColors.error, width: 1.5),
        ),
        focusedErrorBorder: const OutlineInputBorder(
          borderRadius: BanzaRadius.lgAll,
          borderSide:   BorderSide(color: BanzaColors.error, width: 1.5),
        ),
        hintStyle:  BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray400),
        labelStyle: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
        errorStyle: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.error),
        floatingLabelStyle: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.wine),
      ),
    );
  }
}

// =============================================================================
// BanzaErrorBanner — inline error message
// =============================================================================

class BanzaErrorBanner extends StatelessWidget {
  final String message;
  const BanzaErrorBanner({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: BanzaSpacing.lg,
        vertical:   BanzaSpacing.sm + 2,
      ),
      decoration: BoxDecoration(
        color:        BanzaColors.errorBg,
        borderRadius: BanzaRadius.lgAll,
        border:       Border.all(color: BanzaColors.error.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline_rounded, size: 16, color: BanzaColors.error),
          const SizedBox(width: BanzaSpacing.sm),
          Expanded(
            child: Text(
              message,
              style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.error),
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// BanzaWarningBanner — irreversibility warning
// =============================================================================

class BanzaWarningBanner extends StatelessWidget {
  final String message;
  const BanzaWarningBanner({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: BanzaSpacing.lg,
        vertical:   BanzaSpacing.md,
      ),
      decoration: BoxDecoration(
        color:        const Color(0xFFFFF8F0),
        borderRadius: BanzaRadius.lgAll,
        border:       Border.all(color: const Color(0xFFFFE4C0), width: 1),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.info_outline_rounded,
            size:  16,
            color: Color(0xFFB45309),
          ),
          const SizedBox(width: BanzaSpacing.sm),
          Expanded(
            child: Text(
              message,
              style: BanzaTextStyles.bodySm.copyWith(
                color:  const Color(0xFF92400E),
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// BanzaPageRoute — smooth page transition
// =============================================================================

class BanzaPageRoute<T> extends PageRouteBuilder<T> {
  final Widget page;

  BanzaPageRoute({required this.page})
      : super(
          pageBuilder: (_, __, ___) => page,
          transitionDuration:        BanzaMotion.enter,
          reverseTransitionDuration: BanzaMotion.exit,
          transitionsBuilder: (context, animation, secondary, child) {
            final slide = Tween<Offset>(
              begin: const Offset(1.0, 0),
              end:   Offset.zero,
            ).animate(CurvedAnimation(
              parent: animation,
              curve:  BanzaMotion.decelerate,
            ));
            final fade = Tween<double>(begin: 0.0, end: 1.0).animate(
              CurvedAnimation(
                parent: animation,
                curve:  const Interval(0, 0.5, curve: Curves.easeOut),
              ),
            );
            return FadeTransition(
              opacity: fade,
              child:   SlideTransition(position: slide, child: child),
            );
          },
        );
}

// =============================================================================
// BanzaScreenPadding — consistent horizontal + vertical padding
// =============================================================================

class BanzaScreenPadding extends StatelessWidget {
  final Widget child;
  final double horizontal;
  final double vertical;
  final double? top;
  final double? bottom;

  const BanzaScreenPadding({
    super.key,
    required this.child,
    this.horizontal = BanzaSpacing.xl,
    this.vertical   = 0,
    this.top,
    this.bottom,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        horizontal,
        top    ?? vertical,
        horizontal,
        bottom ?? vertical,
      ),
      child: child,
    );
  }
}
