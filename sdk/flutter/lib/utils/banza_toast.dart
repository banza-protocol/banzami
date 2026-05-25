import 'dart:async';

import 'package:flutter/material.dart';

import '../theme/banza_theme.dart';

enum _ToastType { success, error, warning, info }

/// Overlay-based premium notification toasts for the Banza UI.
///
/// Usage:
/// ```dart
/// BanzaToast.showSuccess(context, 'Link copiado');
/// BanzaToast.showError(context, 'QR inválido');
/// BanzaToast.showWarning(context, 'Este QR pertence ao ambiente sandbox.');
/// BanzaToast.showInfo(context, 'Funcionalidade em breve');
/// ```
///
/// Not tied to Scaffold hierarchy — works above modals and bottom sheets.
class BanzaToast {
  BanzaToast._();

  static int          _currentId = 0;
  static OverlayEntry? _entry;

  static void showSuccess(BuildContext context, String message) =>
      _show(context, message, _ToastType.success);

  static void showError(BuildContext context, String message) =>
      _show(context, message, _ToastType.error);

  static void showWarning(BuildContext context, String message) =>
      _show(context, message, _ToastType.warning);

  static void showInfo(BuildContext context, String message) =>
      _show(context, message, _ToastType.info);

  /// Shows an info toast that calls [onTap] when tapped (then dismisses).
  /// Used for tappable foreground notification banners.
  static void showInfoTappable(
    BuildContext context,
    String message, {
    required VoidCallback onTap,
  }) =>
      _show(context, message, _ToastType.info, onTap: onTap);

  static void _show(BuildContext context, String message, _ToastType type, {VoidCallback? onTap}) {
    _dismiss();
    final overlay = Overlay.of(context, rootOverlay: true);
    final id      = ++_currentId;
    final entry   = OverlayEntry(
      builder: (_) => _BanzaToastWidget(
        message:  message,
        type:     type,
        onDone:   () => _dismissIfCurrent(id),
        onTap:    onTap,
      ),
    );
    _entry = entry;
    overlay.insert(entry);
  }

  static void _dismissIfCurrent(int id) {
    if (_currentId == id) _dismiss();
  }

  static void _dismiss() {
    _entry?.remove();
    _entry = null;
  }
}

// ---------------------------------------------------------------------------

class _BanzaToastWidget extends StatefulWidget {
  const _BanzaToastWidget({
    required this.message,
    required this.type,
    required this.onDone,
    this.onTap,
  });

  final String       message;
  final _ToastType   type;
  final VoidCallback onDone;
  final VoidCallback? onTap;

  @override
  State<_BanzaToastWidget> createState() => _BanzaToastWidgetState();
}

class _BanzaToastWidgetState extends State<_BanzaToastWidget>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double>   _opacity;
  late final Animation<Offset>   _slide;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync:    this,
      duration: const Duration(milliseconds: 260),
    );

    _opacity = CurvedAnimation(parent: _ctrl, curve: Curves.easeOut);
    _slide   = Tween<Offset>(
      begin: const Offset(0, 0.5),
      end:   Offset.zero,
    ).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));

    _ctrl.forward();

    final hold = widget.type == _ToastType.error || widget.type == _ToastType.warning
        ? const Duration(milliseconds: 3400)
        : const Duration(milliseconds: 2500);

    _timer = Timer(hold, _dismiss);
  }

  @override
  void dispose() {
    _timer?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  void _dismiss() {
    _timer?.cancel();
    _timer = null;
    if (!mounted) { widget.onDone(); return; }
    _ctrl.reverse().then((_) => widget.onDone());
  }

  @override
  Widget build(BuildContext context) {
    final cfg     = _config(widget.type);
    final mq      = MediaQuery.of(context);
    final bottom  = mq.padding.bottom + 16;

    return Positioned(
      left:   16,
      right:  16,
      bottom: bottom + (mq.viewInsets.bottom > 0 ? mq.viewInsets.bottom + 8 : 0),
      child: SlideTransition(
        position: _slide,
        child: FadeTransition(
          opacity: _opacity,
          child: Material(
            color:        Colors.transparent,
            child: GestureDetector(
              onTap: () {
                _dismiss();
                widget.onTap?.call();
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
                decoration: BoxDecoration(
                  color:        cfg.background,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: cfg.accent.withValues(alpha: 0.28), width: 1),
                  boxShadow: [
                    BoxShadow(
                      color:      Colors.black.withValues(alpha: 0.10),
                      blurRadius: 16,
                      offset:     const Offset(0, 4),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    Icon(cfg.icon, color: cfg.accent, size: 20),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        widget.message,
                        style: BanzaTextStyles.bodySm.copyWith(
                          color:      cfg.textColor,
                          fontWeight: FontWeight.w500,
                          height:     1.35,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------

class _ToastConfig {
  const _ToastConfig({
    required this.background,
    required this.accent,
    required this.textColor,
    required this.icon,
  });
  final Color    background;
  final Color    accent;
  final Color    textColor;
  final IconData icon;
}

_ToastConfig _config(_ToastType type) {
  switch (type) {
    case _ToastType.success:
      return const _ToastConfig(
        background: BanzaColors.successBg,
        accent:     BanzaColors.success,
        textColor:  Color(0xFF14532D),
        icon:       Icons.check_circle_rounded,
      );
    case _ToastType.error:
      return const _ToastConfig(
        background: BanzaColors.errorBg,
        accent:     BanzaColors.error,
        textColor:  Color(0xFF7F1D1D),
        icon:       Icons.error_outline_rounded,
      );
    case _ToastType.warning:
      return const _ToastConfig(
        background: BanzaColors.warningBg,
        accent:     BanzaColors.warning,
        textColor:  Color(0xFF78350F),
        icon:       Icons.warning_amber_rounded,
      );
    case _ToastType.info:
      return const _ToastConfig(
        background: BanzaColors.gray100,
        accent:     BanzaColors.wine,
        textColor:  BanzaColors.gray900,
        icon:       Icons.info_outline_rounded,
      );
  }
}
