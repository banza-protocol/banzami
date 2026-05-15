import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

const int kPinLength = 6;

// ---------------------------------------------------------------------------
// PIN dots — shows progress, turns red on error
// ---------------------------------------------------------------------------

class PinDots extends StatelessWidget {
  final int  filled;
  final bool error;

  const PinDots({ super.key, required this.filled, this.error = false });

  @override
  Widget build(BuildContext context) {
    final color = error ? BanzamiColors.error : BanzamiColors.wine;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(kPinLength, (i) {
        final isFilled = i < filled;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          margin:   const EdgeInsets.symmetric(horizontal: 10),
          width:    13,
          height:   13,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isFilled ? color : Colors.transparent,
            border: Border.all(
              color: isFilled ? color : BanzamiColors.gray200,
              width: 2,
            ),
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
  final VoidCallback?        onComplete;
  final bool                 disabled;
  final bool                 error;

  final _controller = _PinController();

  PinPad({
    super.key,
    required this.onChanged,
    this.onComplete,
    this.disabled = false,
    this.error    = false,
  });

  void clear() => _controller.clear();

  @override
  Widget build(BuildContext context) {
    return _PinPadInner(
      controller: _controller,
      onChanged:  onChanged,
      onComplete: onComplete,
      disabled:   disabled,
      error:      error,
    );
  }
}

class _PinController {
  _PinPadInnerState? _state;
  void clear() => _state?.clear();
}

class _PinPadInner extends StatefulWidget {
  final _PinController      controller;
  final ValueChanged<String> onChanged;
  final VoidCallback?        onComplete;
  final bool                 disabled;
  final bool                 error;

  const _PinPadInner({
    required this.controller,
    required this.onChanged,
    this.onComplete,
    this.disabled = false,
    this.error    = false,
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
      children: [
        PinDots(filled: _pin.length, error: widget.error),
        const SizedBox(height: 40),
        _buildGrid(),
      ],
    );
  }

  Widget _buildGrid() {
    const digits = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
    ];
    return Column(
      children: [
        ...digits.map((row) => _buildRow(row)),
        _buildBottomRow(),
      ],
    );
  }

  Widget _buildRow(List<String> keys) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: keys.map((k) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          child: _DigitKey(
            label:    k,
            onTap:    () => _add(k),
            disabled: widget.disabled,
          ),
        )).toList(),
      ),
    );
  }

  Widget _buildBottomRow() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(width: 100),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: _DigitKey(label: '0', onTap: () => _add('0'), disabled: widget.disabled),
          ),
          SizedBox(
            width:  100,
            height: 80,
            child: Center(
              child: IconButton(
                onPressed: widget.disabled ? null : _delete,
                icon: const Icon(
                  Icons.backspace_outlined,
                  size:  22,
                  color: BanzamiColors.gray600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Individual digit key with circular background
// ---------------------------------------------------------------------------

class _DigitKey extends StatelessWidget {
  final String        label;
  final VoidCallback  onTap;
  final bool          disabled;

  const _DigitKey({
    required this.label,
    required this.onTap,
    this.disabled = false,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width:  80,
      height: 80,
      child: Material(
        color:        Colors.transparent,
        child: InkWell(
          onTap:        disabled ? null : onTap,
          borderRadius: BorderRadius.circular(40),
          child: Ink(
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: BanzamiColors.gray100,
            ),
            child: Center(
              child: Text(
                label,
                style: const TextStyle(
                  fontFamily:  'Inter',
                  fontSize:    26,
                  fontWeight:  FontWeight.w400,
                  color:       BanzamiColors.black,
                  height:      1,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
