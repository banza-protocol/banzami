import 'dart:ui';

import 'package:banza_flutter/banza_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

// ── Variant ───────────────────────────────────────────────────────────────────

enum BanzaDialogVariant {
  /// Default wine-red confirm button.
  standard,

  /// Amber confirm button — "use another account" type actions.
  warning,

  /// Bright red confirm button — destructive actions like account removal.
  danger,
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Shows a premium Banzami confirmation dialog and returns [true] (confirmed),
/// [false] (cancelled), or [null] (barrier dismissed).
Future<bool?> showBanzaDialog({
  required BuildContext      context,
  required IconData          icon,
  required String            title,
  required String            description,
  String                     cancelLabel  = 'Cancelar',
  required String            confirmLabel,
  BanzaDialogVariant         variant      = BanzaDialogVariant.standard,
  bool                       barrierDismissible = true,
}) {
  HapticFeedback.mediumImpact();
  return showGeneralDialog<bool>(
    context:             context,
    barrierDismissible:  barrierDismissible,
    barrierLabel:        'Fechar',
    barrierColor:        Colors.transparent,
    transitionDuration:  const Duration(milliseconds: 260),
    pageBuilder: (ctx, _, __) => _BanzaDialogContent(
      icon:        icon,
      title:       title,
      description: description,
      cancelLabel: cancelLabel,
      confirmLabel: confirmLabel,
      variant:     variant,
    ),
    transitionBuilder: (ctx, anim, _, child) {
      final eased = CurvedAnimation(parent: anim, curve: Curves.easeOutCubic);
      return Stack(
        children: [
          // ── Blurred dark backdrop ──────────────────────────────────────
          FadeTransition(
            opacity: eased,
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
              child: ColoredBox(
                color: Colors.black.withValues(alpha: 0.42),
                child: const SizedBox.expand(),
              ),
            ),
          ),
          // ── Modal card — scale + fade ─────────────────────────────────
          ScaleTransition(
            scale: Tween<double>(begin: 0.88, end: 1.0).animate(
              CurvedAnimation(parent: anim, curve: Curves.easeOutBack),
            ),
            child: FadeTransition(
              opacity: CurvedAnimation(
                parent: anim,
                curve:  const Interval(0.0, 0.65, curve: Curves.easeOut),
              ),
              child: child,
            ),
          ),
        ],
      );
    },
  );
}

// ── Dialog content ────────────────────────────────────────────────────────────

class _BanzaDialogContent extends StatelessWidget {
  final IconData         icon;
  final String           title;
  final String           description;
  final String           cancelLabel;
  final String           confirmLabel;
  final BanzaDialogVariant variant;

  const _BanzaDialogContent({
    required this.icon,
    required this.title,
    required this.description,
    required this.cancelLabel,
    required this.confirmLabel,
    required this.variant,
  });

  List<Color> get _iconGradient => switch (variant) {
    BanzaDialogVariant.warning  => const [Color(0xFFFFB347), Color(0xFFD97706)],
    BanzaDialogVariant.danger   => const [Color(0xFFDC2626), Color(0xFF7F1D1D)],
    BanzaDialogVariant.standard => const [Color(0xFF990011), Color(0xFF5E000A)],
  };

  List<Color> get _confirmGradient => switch (variant) {
    BanzaDialogVariant.warning  => const [Color(0xFFF59E0B), Color(0xFFD97706)],
    BanzaDialogVariant.danger   => const [Color(0xFFDC2626), Color(0xFF991B1B)],
    BanzaDialogVariant.standard => [BanzaColors.wine, BanzaColors.wineDark],
  };

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 22),
        child: Material(
          color:         Colors.transparent,
          borderRadius:  const BorderRadius.all(Radius.circular(32)),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.97),
              borderRadius: const BorderRadius.all(Radius.circular(32)),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.55),
                width: 0.5,
              ),
              boxShadow: [
                BoxShadow(
                  color:        Colors.black.withValues(alpha: 0.14),
                  blurRadius:   52,
                  offset:       const Offset(0, 20),
                ),
                BoxShadow(
                  color:        Colors.black.withValues(alpha: 0.06),
                  blurRadius:   8,
                  offset:       const Offset(0, 2),
                ),
              ],
            ),
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _IconBadge(gradient: _iconGradient, icon: icon),
                const SizedBox(height: 20),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize:   22,
                    fontWeight: FontWeight.w700,
                    color:      BanzaColors.gray900,
                    height:     1.2,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  description,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize:   14,
                    fontWeight: FontWeight.w400,
                    color:      BanzaColors.gray600,
                    height:     1.6,
                  ),
                ),
                const SizedBox(height: 28),
                Row(
                  children: [
                    Expanded(
                      child: _PressableButton(
                        onTap: () {
                          HapticFeedback.selectionClick();
                          Navigator.pop(context, false);
                        },
                        child: _CancelButton(label: cancelLabel),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _PressableButton(
                        onTap: () {
                          HapticFeedback.mediumImpact();
                          Navigator.pop(context, true);
                        },
                        child: _ConfirmButton(
                          label:    confirmLabel,
                          gradient: _confirmGradient,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Icon badge ────────────────────────────────────────────────────────────────

class _IconBadge extends StatelessWidget {
  final List<Color> gradient;
  final IconData    icon;
  const _IconBadge({required this.gradient, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      width:  64,
      height: 64,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: gradient,
          begin:  Alignment.topLeft,
          end:    Alignment.bottomRight,
        ),
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color:      gradient.last.withValues(alpha: 0.40),
            blurRadius: 18,
            offset:     const Offset(0, 6),
          ),
        ],
      ),
      child: Icon(icon, color: Colors.white, size: 26),
    );
  }
}

// ── Cancel button ─────────────────────────────────────────────────────────────

class _CancelButton extends StatelessWidget {
  final String label;
  const _CancelButton({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 52,
      decoration: BoxDecoration(
        color:        BanzaColors.gray100,
        borderRadius: const BorderRadius.all(Radius.circular(18)),
        border:       Border.all(color: BanzaColors.gray200),
      ),
      child: Center(
        child: Text(
          label,
          style: const TextStyle(
            fontSize:   15,
            fontWeight: FontWeight.w600,
            color:      BanzaColors.gray900,
          ),
        ),
      ),
    );
  }
}

// ── Confirm button ────────────────────────────────────────────────────────────

class _ConfirmButton extends StatelessWidget {
  final String       label;
  final List<Color>  gradient;
  const _ConfirmButton({required this.label, required this.gradient});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 52,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: gradient,
          begin:  Alignment.topLeft,
          end:    Alignment.bottomRight,
        ),
        borderRadius: const BorderRadius.all(Radius.circular(18)),
        boxShadow: [
          BoxShadow(
            color:      gradient.first.withValues(alpha: 0.32),
            blurRadius: 12,
            offset:     const Offset(0, 4),
          ),
        ],
      ),
      child: Center(
        child: Text(
          label,
          style: const TextStyle(
            fontSize:   15,
            fontWeight: FontWeight.w700,
            color:      Colors.white,
          ),
        ),
      ),
    );
  }
}

// ── Press-scale wrapper ───────────────────────────────────────────────────────

class _PressableButton extends StatefulWidget {
  final Widget       child;
  final VoidCallback onTap;
  const _PressableButton({required this.child, required this.onTap});

  @override
  State<_PressableButton> createState() => _PressableButtonState();
}

class _PressableButtonState extends State<_PressableButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double>   _scale;

  @override
  void initState() {
    super.initState();
    _ctrl  = AnimationController(
      vsync:    this,
      duration: const Duration(milliseconds: 80),
    );
    _scale = Tween<double>(begin: 1.0, end: 0.95)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeIn));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown:   (_) => _ctrl.forward(),
      onTapUp:     (_) { _ctrl.reverse(); widget.onTap(); },
      onTapCancel: ()  => _ctrl.reverse(),
      child: ScaleTransition(scale: _scale, child: widget.child),
    );
  }
}
