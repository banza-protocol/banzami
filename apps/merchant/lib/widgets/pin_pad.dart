import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

const int kPinLength = 6;

class PinDots extends StatelessWidget {
  final int  filled;
  final bool error;

  const PinDots({super.key, required this.filled, this.error = false});

  @override
  Widget build(BuildContext context) {
    final color = error ? BanzamiColors.error : BanzamiColors.primary;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(kPinLength, (i) {
        final isFilled = i < filled;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          margin:   const EdgeInsets.symmetric(horizontal: 8),
          width: 16, height: 16,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isFilled ? color : Colors.transparent,
            border: Border.all(
              color: isFilled ? color : BanzamiColors.gray400,
              width: 1.5,
            ),
          ),
        );
      }),
    );
  }
}

class PinPad extends StatelessWidget {
  final ValueChanged<String> onChanged;
  final VoidCallback?        onComplete;
  final bool                 disabled;

  final _controller = _PinController();

  PinPad({
    super.key,
    required this.onChanged,
    this.onComplete,
    this.disabled = false,
  });

  void clear() => _controller.clear();

  @override
  Widget build(BuildContext context) {
    return _PinPadInner(
      controller: _controller,
      onChanged:  onChanged,
      onComplete: onComplete,
      disabled:   disabled,
    );
  }
}

class _PinController {
  _PinPadInnerState? _state;
  void clear() => _state?.clear();
}

class _PinPadInner extends StatefulWidget {
  final _PinController       controller;
  final ValueChanged<String> onChanged;
  final VoidCallback?        onComplete;
  final bool                 disabled;

  const _PinPadInner({
    required this.controller,
    required this.onChanged,
    this.onComplete,
    this.disabled = false,
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
    return Column(children: [
      PinDots(filled: _pin.length),
      const SizedBox(height: 36),
      _buildGrid(),
    ]);
  }

  Widget _buildGrid() {
    const digits = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
    ];
    return Column(children: [
      ...digits.map((row) => _buildRow(row)),
      _buildBottomRow(),
    ]);
  }

  Widget _buildRow(List<String> keys) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: keys.map((k) => _DigitKey(
          label: k, onTap: () => _add(k), disabled: widget.disabled,
        )).toList(),
      ),
    );
  }

  Widget _buildBottomRow() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(width: 96),
          _DigitKey(label: '0', onTap: () => _add('0'), disabled: widget.disabled),
          SizedBox(
            width: 96, height: 72,
            child: IconButton(
              onPressed: _delete,
              icon: const Icon(Icons.backspace_outlined, size: 22, color: BanzamiColors.gray700),
            ),
          ),
        ],
      ),
    );
  }
}

class _DigitKey extends StatelessWidget {
  final String      label;
  final VoidCallback onTap;
  final bool        disabled;

  const _DigitKey({required this.label, required this.onTap, this.disabled = false});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 96, height: 72,
      child: TextButton(
        onPressed: disabled ? null : onTap,
        style: TextButton.styleFrom(
          shape:          const CircleBorder(),
          foregroundColor: BanzamiColors.gray900,
        ),
        child: Text(
          label,
          style: BanzamiTextStyles.displayMd.copyWith(
            fontSize: 28, fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}
