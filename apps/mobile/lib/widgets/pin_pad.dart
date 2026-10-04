import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

const int kPinLength = 6;

// ---------------------------------------------------------------------------
// PIN dots — shows progress, turns red on error
// ---------------------------------------------------------------------------

class PinDots extends StatelessWidget {
  final int filled;
  final bool error;

  const PinDots({super.key, required this.filled, this.error = false});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(kPinLength, (i) {
        final isFilled = i < filled;
        final isError = error && isFilled;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          margin: const EdgeInsets.symmetric(horizontal: 10),
          width: 13,
          height: 13,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            // gradient for normal filled; flat color for error; transparent for empty
            gradient: isFilled && !isError ? BanzamiGradients.primary : null,
            color: isFilled
                ? (isError ? BanzamiColors.error : null)
                : Colors.transparent,
            border: Border.all(
              color: isError
                  ? BanzamiColors.error
                  : isFilled
                      ? BanzamiColors.primaryDark
                      : const Color(0xFFD8D0CF), // Soft Neutral
              width: 2,
            ),
            boxShadow: isFilled && !isError
                ? const [
                    BoxShadow(
                      color: Color(0x60990011), // cherry glow
                      blurRadius: 6,
                      spreadRadius: -1,
                    ),
                  ]
                : null,
          ),
        );
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// PIN pad — numeric keyboard
// ---------------------------------------------------------------------------

class PinPad extends StatelessWidget {
  final ValueChanged<String> onChanged;
  final VoidCallback? onComplete;
  final bool disabled;
  final bool error;

  final _controller = _PinController();

  PinPad({
    super.key,
    required this.onChanged,
    this.onComplete,
    this.disabled = false,
    this.error = false,
  });

  void clear() => _controller.clear();

  @override
  Widget build(BuildContext context) {
    return _PinPadInner(
      controller: _controller,
      onChanged: onChanged,
      onComplete: onComplete,
      disabled: disabled,
      error: error,
    );
  }
}

class _PinController {
  _PinPadInnerState? _state;
  void clear() => _state?.clear();
}

class _PinPadInner extends StatefulWidget {
  final _PinController controller;
  final ValueChanged<String> onChanged;
  final VoidCallback? onComplete;
  final bool disabled;
  final bool error;

  const _PinPadInner({
    required this.controller,
    required this.onChanged,
    this.onComplete,
    this.disabled = false,
    this.error = false,
  });

  @override
  State<_PinPadInner> createState() => _PinPadInnerState();
}

class _PinPadInnerState extends State<_PinPadInner> {
  String _pin = '';

  @override
  void initState() {
    super.initState();
    widget.controller._state = this;
  }

  void clear() {
    setState(() => _pin = '');
    widget.onChanged('');
  }

  void _add(String digit) {
    if (widget.disabled || _pin.length >= kPinLength) return;
    HapticFeedback.lightImpact();
    setState(() => _pin += digit);
    widget.onChanged(_pin);
    if (_pin.length == kPinLength) widget.onComplete?.call();
  }

  void _delete() {
    if (_pin.isEmpty) return;
    HapticFeedback.lightImpact();
    setState(() => _pin = _pin.substring(0, _pin.length - 1));
    widget.onChanged(_pin);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        PinDots(filled: _pin.length, error: widget.error),
        const SizedBox(height: 40),
        _buildGrid(),
      ],
    );
  }

  // Responsive 3-column keypad. Keys scale with the available width (three equal
  // Expanded columns), so a row can NEVER overflow on a narrow device, while
  // staying compact and centred on wide ones. No fixed key or row widths.
  Widget _buildGrid() {
    const rows = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
    ];
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 320),
        child: LayoutBuilder(
          builder: (context, c) {
            final maxW = c.maxWidth.isFinite ? c.maxWidth : 300.0;
            // Diameter ≈ a third of the width minus a gap, capped at the design
            // size (80) and floored for a comfortable touch target (≥ 48dp).
            final d = (maxW / 3 - 10).clamp(56.0, 80.0);
            Widget cell(Widget child) => Expanded(child: Center(child: child));
            Widget digitRow(List<String> keys) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    children: [
                      for (final k in keys)
                        cell(_DigitKey(
                          size: d,
                          label: k,
                          onTap: () => _add(k),
                          disabled: widget.disabled,
                        )),
                    ],
                  ),
                );
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final r in rows) digitRow(r),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    children: [
                      const Expanded(child: SizedBox.shrink()),
                      cell(_DigitKey(
                        size: d,
                        label: '0',
                        onTap: () => _add('0'),
                        disabled: widget.disabled,
                      )),
                      cell(_BackspaceKey(
                        size: d,
                        onTap: _delete,
                        disabled: widget.disabled,
                      )),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Individual digit key with circular background
// ---------------------------------------------------------------------------

class _DigitKey extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  final bool disabled;
  final double size;

  const _DigitKey({
    required this.label,
    required this.onTap,
    this.size = 80,
    this.disabled = false,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: Container(
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          color: BanzamiColors.white,
          border: Border.fromBorderSide(
            BorderSide(color: Color(0xFFEDE8E7), width: 1.5),
          ),
          boxShadow: [
            BoxShadow(
              color: Color(0x0A000000),
              blurRadius: 8,
              offset: Offset(0, 2),
            ),
          ],
        ),
        child: Material(
          color: Colors.transparent,
          shape: const CircleBorder(),
          clipBehavior: Clip.antiAlias,
          child: Semantics(
            button: true,
            label: label,
            excludeSemantics: true,
            child: InkWell(
              onTap: disabled ? null : onTap,
              splashColor: const Color(0x14990011), // cherry 8 %
              highlightColor: const Color(0x0A990011), // cherry 4 %
              child: Center(
                child: Text(
                  label,
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: size * 0.325, // 80 → 26, scales with the key
                    fontWeight: FontWeight.w400,
                    color: BanzamiColors.black,
                    height: 1,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// Backspace key — a borderless circular tap target (no filled circle, matching
// the original), sized to match the digit keys so the bottom row stays aligned.
class _BackspaceKey extends StatelessWidget {
  final double size;
  final VoidCallback onTap;
  final bool disabled;

  const _BackspaceKey({
    required this.size,
    required this.onTap,
    this.disabled = false,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: Material(
        color: Colors.transparent,
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: Semantics(
          button: true,
          label: 'Apagar',
          excludeSemantics: true,
          child: InkWell(
            onTap: disabled ? null : onTap,
            splashColor: const Color(0x14990011),
            highlightColor: const Color(0x0A990011),
            child: Center(
              child: Icon(
                Icons.backspace_outlined,
                size: size * 0.275, // 80 → 22
                color: BanzamiColors.gray600,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
