import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/banzami_theme.dart';

// =============================================================================
// BanzamiScaffold — consistent page scaffold with light gradient background
// =============================================================================

class BanzamiScaffold extends StatelessWidget {
  final Widget body;
  final PreferredSizeWidget? appBar;
  final Widget? bottomNavigationBar;
  final Color? backgroundColor;
  final bool resizeToAvoidBottomInset;

  const BanzamiScaffold({
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
      backgroundColor:           backgroundColor ?? BanzamiColors.offWhite,
      resizeToAvoidBottomInset:  resizeToAvoidBottomInset,
      bottomNavigationBar:       bottomNavigationBar,
      body: body,
    );
  }
}

// =============================================================================
// BanzamiAppBar — clean, minimal app bar
// =============================================================================

class BanzamiAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String? title;
  final Widget? titleWidget;
  final List<Widget>? actions;
  final bool showBack;
  final Color backgroundColor;
  final Color foregroundColor;
  final VoidCallback? onBack;

  const BanzamiAppBar({
    super.key,
    this.title,
    this.titleWidget,
    this.actions,
    this.showBack = true,
    this.backgroundColor = BanzamiColors.offWhite,
    this.foregroundColor = BanzamiColors.gray900,
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
              ? Text(title!, style: BanzamiTextStyles.headingSm.copyWith(color: foregroundColor))
              : null),
      actions: actions,
      surfaceTintColor: Colors.transparent,
    );
  }
}

// =============================================================================
// BanzamiCard — floating white card with premium shadow
// =============================================================================

class BanzamiCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final BorderRadius? borderRadius;
  final Color color;
  final List<BoxShadow>? shadow;
  final VoidCallback? onTap;
  final Border? border;

  const BanzamiCard({
    super.key,
    required this.child,
    this.padding,
    this.borderRadius,
    this.color = BanzamiColors.white,
    this.shadow,
    this.onTap,
    this.border,
  });

  @override
  Widget build(BuildContext context) {
    final br = borderRadius ?? BanzamiRadius.xlAll;
    final sh = shadow ?? BanzamiShadows.card;

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
// BanzamiGlassCard — semi-transparent card for dark backgrounds
// =============================================================================

class BanzamiGlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final double opacity;

  const BanzamiGlassCard({
    super.key,
    required this.child,
    this.padding,
    this.opacity = 0.12,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color:        BanzamiColors.white.withValues(alpha: opacity),
        borderRadius: BanzamiRadius.xlAll,
        border: Border.all(
          color: BanzamiColors.white.withValues(alpha: opacity * 1.5),
          width: 1,
        ),
      ),
      padding: padding ?? const EdgeInsets.all(BanzamiSpacing.lg),
      child:   child,
    );
  }
}

// =============================================================================
// BanzamiPrimaryButton — full-width cherry/primary CTA with haptics
// =============================================================================

class BanzamiPrimaryButton extends StatefulWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;
  final bool fullWidth;
  final IconData? icon;
  final Color? backgroundColor;
  final Color? foregroundColor;
  final double height;
  final LinearGradient? gradient;

  const BanzamiPrimaryButton({
    super.key,
    required this.label,
    this.onPressed,
    this.isLoading    = false,
    this.fullWidth    = true,
    this.icon,
    this.backgroundColor,
    this.foregroundColor,
    this.height       = 56,
    this.gradient,
  });

  @override
  State<BanzamiPrimaryButton> createState() => _BanzamiPrimaryButtonState();
}

class _BanzamiPrimaryButtonState extends State<BanzamiPrimaryButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double>   _scale;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync:    this,
      duration: BanzamiMotion.fast,
      lowerBound: 0.0,
      upperBound: 1.0,
      value: 1.0,
    );
    _scale = Tween<double>(begin: 1.0, end: 0.96).animate(
      CurvedAnimation(parent: _controller, curve: BanzamiMotion.standard),
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
    final isDisabled  = widget.onPressed == null || widget.isLoading;
    final hasCustomBg = widget.backgroundColor != null;
    final fg          = widget.foregroundColor ?? BanzamiColors.white;

    final LinearGradient? gradient = (!hasCustomBg && !isDisabled)
        ? (widget.gradient ?? BanzamiGradients.primary)
        : null;

    final Color? flatColor = hasCustomBg
        ? (isDisabled
              ? widget.backgroundColor!.withValues(alpha: 0.5)
              : widget.backgroundColor)
        : (isDisabled ? BanzamiColors.primary.withValues(alpha: 0.40) : null);

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
            color:        flatColor,
            gradient:     gradient,
            borderRadius: BorderRadius.circular(20),
            boxShadow:    isDisabled
                ? null
                : [
                    BoxShadow(
                      color:        BanzamiColors.primary.withValues(alpha: 0.32),
                      blurRadius:   16,
                      offset:       const Offset(0, 4),
                      spreadRadius: -2,
                    ),
                  ],
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
                  mainAxisSize:      MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (widget.icon != null) ...[
                      Icon(widget.icon, color: fg, size: 18),
                      const SizedBox(width: BanzamiSpacing.sm),
                    ],
                    Text(
                      widget.label,
                      style: BanzamiTextStyles.headingSm.copyWith(
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
// BanzamiSecondaryButton — outlined button
// =============================================================================

class BanzamiSecondaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool fullWidth;
  final Color? borderColor;
  final Color? foregroundColor;
  final double height;

  const BanzamiSecondaryButton({
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
    final fg = foregroundColor ?? BanzamiColors.primary;
    final bc = borderColor ?? BanzamiColors.primary;

    return SizedBox(
      height: height,
      width:  fullWidth ? double.infinity : null,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: fg,
          side: BorderSide(color: bc, width: 1.5),
          shape: const RoundedRectangleBorder(borderRadius: BanzamiRadius.lgAll),
          textStyle: BanzamiTextStyles.headingSm.copyWith(
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
// BanzamiGhostButton — text-only button
// =============================================================================

class BanzamiGhostButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final Color? color;

  const BanzamiGhostButton({
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
        foregroundColor: color ?? BanzamiColors.gray600,
        textStyle: BanzamiTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w500),
      ),
      child: Text(label),
    );
  }
}

// =============================================================================
// BanzamiSectionTitle — section header with optional trailing action
// =============================================================================

class BanzamiSectionTitle extends StatelessWidget {
  final String title;
  final String? action;
  final VoidCallback? onAction;
  final EdgeInsetsGeometry? padding;

  const BanzamiSectionTitle({
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
          const EdgeInsets.symmetric(horizontal: BanzamiSpacing.xl),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: BanzamiTextStyles.headingSm.copyWith(
                color:      BanzamiColors.gray900,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          if (action != null)
            GestureDetector(
              onTap: onAction,
              child: Text(
                action!,
                style: BanzamiTextStyles.label.copyWith(
                  color:    BanzamiColors.primary,
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
// BanzamiActionTile — rounded icon+label action button (home screen quick actions)
// =============================================================================

class BanzamiActionTile extends StatefulWidget {
  final IconData     icon;
  final String       label;
  final VoidCallback onTap;
  /// Full primary-gradient tile — strongest visual weight.
  final bool primary;
  /// Wine-tinted icon on white tile — secondary prominence, used for QR.
  final bool accent;

  const BanzamiActionTile({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.primary = false,
    this.accent  = false,
  });

  @override
  State<BanzamiActionTile> createState() => _BanzamiActionTileState();
}

class _BanzamiActionTileState extends State<BanzamiActionTile>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double>   _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync:    this,
      duration: BanzamiMotion.fast,
      value:    1.0,
    );
    _scale = Tween(begin: 1.0, end: 0.92).animate(
      CurvedAnimation(parent: _ctrl, curve: BanzamiMotion.standard),
    );
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final isPrimary = widget.primary;
    final isAccent  = widget.accent && !isPrimary;
    final fg        = isPrimary ? BanzamiColors.white : BanzamiColors.gray900;

    return Expanded(
      child: ScaleTransition(
        scale: _scale,
        child: GestureDetector(
          onTapDown:   (_) { HapticFeedback.selectionClick(); _ctrl.reverse(); },
          onTapUp:     (_) { _ctrl.forward(); widget.onTap(); },
          onTapCancel: ()  => _ctrl.forward(),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: BanzamiSpacing.lg),
            decoration: BoxDecoration(
              color:        isPrimary ? null : BanzamiColors.white,
              gradient:     isPrimary ? BanzamiGradients.primary : null,
              borderRadius: BanzamiRadius.xlAll,
              boxShadow: isPrimary ? [
                BoxShadow(
                  color:        BanzamiColors.primary.withValues(alpha: 0.38),
                  blurRadius:   18,
                  offset:       const Offset(0, 6),
                  spreadRadius: -2,
                ),
                const BoxShadow(
                  color:      Color(0x14000000),
                  blurRadius: 4,
                  offset:     Offset(0, 2),
                ),
              ] : [
                const BoxShadow(
                  color:      Color(0x0D000000),
                  blurRadius: 12,
                  offset:     Offset(0, 4),
                ),
                const BoxShadow(
                  color:      Color(0x08000000),
                  blurRadius: 2,
                  offset:     Offset(0, 1),
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
                    color: isPrimary
                        ? BanzamiColors.white.withValues(alpha: 0.20)
                        : isAccent
                            ? BanzamiColors.primary.withValues(alpha: 0.09)
                            : BanzamiColors.gray100,
                    shape: BoxShape.circle,
                    border: isPrimary
                        ? Border.all(
                            color: BanzamiColors.white.withValues(alpha: 0.30),
                            width: 1,
                          )
                        : null,
                  ),
                  child: Icon(
                    widget.icon,
                    color: isAccent ? BanzamiColors.primary : fg,
                    size:  20,
                  ),
                ),
                const SizedBox(height: BanzamiSpacing.sm),
                Text(
                  widget.label,
                  style: BanzamiTextStyles.label.copyWith(
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
// BanzamiActivityRow — premium activity list item
// =============================================================================

class BanzamiActivityRow extends StatelessWidget {
  final String title;
  final String subtitle;
  final String amount;
  final String time;
  final bool   isCredit;
  final Widget? leading;
  final VoidCallback? onTap;

  const BanzamiActivityRow({
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
          horizontal: BanzamiSpacing.xl,
          vertical:   BanzamiSpacing.md + 2,
        ),
        child: Row(
          children: [
            // Avatar
            leading ?? _DefaultAvatar(letter: title[0]),
            const SizedBox(width: BanzamiSpacing.md),
            // Title + subtitle
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize:       MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: BanzamiTextStyles.bodyMd.copyWith(
                      color:      BanzamiColors.gray900,
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines:  1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: BanzamiTextStyles.bodySm.copyWith(
                      color: BanzamiColors.gray400,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: BanzamiSpacing.md),
            // Amount + time
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize:       MainAxisSize.min,
              children: [
                Text(
                  amount,
                  style: BanzamiTextStyles.bodyMd.copyWith(
                    color:      isCredit ? BanzamiColors.success : BanzamiColors.gray900,
                    fontWeight: FontWeight.w700,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  time,
                  style: BanzamiTextStyles.bodySm.copyWith(
                    color: BanzamiColors.gray400,
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
        gradient: BanzamiGradients.primary,
        shape:    BoxShape.circle,
      ),
      child: Center(
        child: Text(
          letter.toUpperCase(),
          style: BanzamiTextStyles.headingSm.copyWith(
            color:      BanzamiColors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// BanzamiTextField — styled text input
// =============================================================================

class BanzamiTextField extends StatelessWidget {
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

  const BanzamiTextField({
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
      style: BanzamiTextStyles.bodyLg.copyWith(color: BanzamiColors.gray900),
      decoration: InputDecoration(
        labelText:  label,
        hintText:   hint,
        errorText:  errorText,
        filled:     true,
        fillColor:  BanzamiColors.gray100,
        suffixIcon: suffix,
        prefixIcon: prefix,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: BanzamiSpacing.lg,
          vertical:   BanzamiSpacing.md + 2,
        ),
        border: const OutlineInputBorder(
          borderRadius: BanzamiRadius.fieldAll,
          borderSide:   BorderSide.none,
        ),
        enabledBorder: const OutlineInputBorder(
          borderRadius: BanzamiRadius.fieldAll,
          borderSide:   BorderSide.none,
        ),
        focusedBorder: const OutlineInputBorder(
          borderRadius: BanzamiRadius.fieldAll,
          borderSide:   BorderSide(color: BanzamiColors.primary, width: 1.5),
        ),
        errorBorder: const OutlineInputBorder(
          borderRadius: BanzamiRadius.fieldAll,
          borderSide:   BorderSide(color: BanzamiColors.error, width: 1.5),
        ),
        focusedErrorBorder: const OutlineInputBorder(
          borderRadius: BanzamiRadius.fieldAll,
          borderSide:   BorderSide(color: BanzamiColors.error, width: 1.5),
        ),
        hintStyle:  BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
        labelStyle: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
        errorStyle: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error),
        floatingLabelStyle: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.primary),
      ),
    );
  }
}

// =============================================================================
// BanzamiErrorBanner — inline error message
// =============================================================================

class BanzamiErrorBanner extends StatelessWidget {
  final String message;
  const BanzamiErrorBanner({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: BanzamiSpacing.lg,
        vertical:   BanzamiSpacing.sm + 2,
      ),
      decoration: BoxDecoration(
        color:        BanzamiColors.errorBg,
        borderRadius: BanzamiRadius.lgAll,
        border:       Border.all(color: BanzamiColors.error.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline_rounded, size: 16, color: BanzamiColors.error),
          const SizedBox(width: BanzamiSpacing.sm),
          Expanded(
            child: Text(
              message,
              style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error),
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// BanzamiWarningBanner — irreversibility warning
// =============================================================================

class BanzamiWarningBanner extends StatelessWidget {
  final String message;
  const BanzamiWarningBanner({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: BanzamiSpacing.lg,
        vertical:   BanzamiSpacing.md,
      ),
      decoration: BoxDecoration(
        color:        const Color(0xFFFFF8F0),
        borderRadius: BanzamiRadius.lgAll,
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
          const SizedBox(width: BanzamiSpacing.sm),
          Expanded(
            child: Text(
              message,
              style: BanzamiTextStyles.bodySm.copyWith(
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
// BanzamiSandboxBadge — amber "test money" pill
// =============================================================================

/// The canonical sandbox marker pill. Centralises the amber sandbox look so
/// receipt, link-pay success and any test-money surface stay identical.
class BanzamiSandboxBadge extends StatelessWidget {
  final String label;
  final IconData? icon;

  const BanzamiSandboxBadge({
    super.key,
    this.label = 'SANDBOX · Dinheiro de teste',
    this.icon  = Icons.science_rounded,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BanzamiSpacing.md,
        vertical:   BanzamiSpacing.xs + 1,
      ),
      decoration: BoxDecoration(
        color:        BanzamiColors.sandboxBg,
        borderRadius: BanzamiRadius.fullAll,
        border:       Border.all(color: BanzamiColors.sandboxBorder, width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: BanzamiColors.sandboxText),
            const SizedBox(width: BanzamiSpacing.xs + 2),
          ],
          Text(
            label,
            style: BanzamiTextStyles.label.copyWith(
              color:         BanzamiColors.sandboxText,
              fontSize:      11.5,
              fontWeight:    FontWeight.w700,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// BanzamiPageRoute — smooth page transition
// =============================================================================

class BanzamiPageRoute<T> extends PageRouteBuilder<T> {
  final Widget page;

  BanzamiPageRoute({required this.page})
      : super(
          pageBuilder: (_, __, ___) => page,
          transitionDuration:        BanzamiMotion.enter,
          reverseTransitionDuration: BanzamiMotion.exit,
          transitionsBuilder: (context, animation, secondary, child) {
            final slide = Tween<Offset>(
              begin: const Offset(1.0, 0),
              end:   Offset.zero,
            ).animate(CurvedAnimation(
              parent: animation,
              curve:  BanzamiMotion.decelerate,
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
// BanzamiScreenPadding — consistent horizontal + vertical padding
// =============================================================================

class BanzamiScreenPadding extends StatelessWidget {
  final Widget child;
  final double horizontal;
  final double vertical;
  final double? top;
  final double? bottom;

  const BanzamiScreenPadding({
    super.key,
    required this.child,
    this.horizontal = BanzamiSpacing.xl,
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
