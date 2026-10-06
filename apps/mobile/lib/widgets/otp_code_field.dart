import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

/// A modern segmented one-time-code field: [length] separate boxes, one per
/// digit, that behave like a single input.
///
/// It is built on ONE real (transparent) [TextField] laid over the boxes rather
/// than one field per box, so paste, auto-advance, backspace-into-previous and
/// IME all work natively — the boxes are a visual projection of the controller's
/// text. Numbers only, capped at [length], no jitter.
///
/// - [onChanged] fires on every edit; [onCompleted] fires once the code reaches
///   [length] digits (used for auto-submit).
/// - [hasError] paints every box in the error colour (kept filled so the person
///   can correct rather than retype).
/// - The caller owns [controller] so it can read, clear or pre-fill the value.
class OtpCodeField extends StatefulWidget {
  final TextEditingController controller;
  final int length;
  final bool enabled;
  final bool autofocus;
  final bool hasError;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onCompleted;

  const OtpCodeField({
    super.key,
    required this.controller,
    this.length = 6,
    this.enabled = true,
    this.autofocus = true,
    this.hasError = false,
    this.onChanged,
    this.onCompleted,
  });

  @override
  State<OtpCodeField> createState() => _OtpCodeFieldState();
}

class _OtpCodeFieldState extends State<OtpCodeField> {
  final FocusNode _focus = FocusNode();
  bool _lastWasComplete = false;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onControllerChanged);
    _focus.addListener(_onFocusChanged);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onControllerChanged);
    _focus.removeListener(_onFocusChanged);
    _focus.dispose();
    super.dispose();
  }

  void _onFocusChanged() => setState(() {});

  void _onControllerChanged() {
    final code = widget.controller.text;
    setState(() {});
    widget.onChanged?.call(code);
    // onCompleted fires exactly once per transition into the complete state, so
    // a fix-up edit that briefly drops below [length] re-arms it (no duplicate
    // auto-submit while the code stays full).
    final complete = code.length == widget.length;
    if (complete && !_lastWasComplete) widget.onCompleted?.call(code);
    _lastWasComplete = complete;
  }

  @override
  Widget build(BuildContext context) {
    final code = widget.controller.text;
    final focused = _focus.hasFocus;

    return Semantics(
      label: 'Código de verificação de ${widget.length} dígitos',
      textField: true,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Visual projection of the value (decorative; input is the layer above).
          ExcludeSemantics(
            child: Row(
              children: [
                for (int i = 0; i < widget.length; i++) ...[
                  if (i > 0) const SizedBox(width: BanzamiSpacing.sm),
                  Expanded(child: _box(i, code, focused)),
                ],
              ],
            ),
          ),
          // The real input, transparent, sitting over the boxes: it owns taps,
          // the keyboard, paste and the selection.
          Positioned.fill(
            child: TextField(
              controller: widget.controller,
              focusNode: _focus,
              enabled: widget.enabled,
              autofocus: widget.autofocus,
              keyboardType: TextInputType.number,
              textInputAction: TextInputAction.done,
              enableSuggestions: false,
              autocorrect: false,
              showCursor: false,
              cursorWidth: 0,
              style: const TextStyle(color: Colors.transparent, height: 1),
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(widget.length),
              ],
              decoration: const InputDecoration(
                border: InputBorder.none,
                focusedBorder: InputBorder.none,
                enabledBorder: InputBorder.none,
                disabledBorder: InputBorder.none,
                counterText: '',
                contentPadding: EdgeInsets.zero,
                filled: false,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _box(int i, String code, bool focused) {
    final filled = i < code.length;
    final isActive = focused && (i == code.length || (i == widget.length - 1 && filled));

    final Color border = widget.hasError
        ? BanzamiColors.error
        : isActive
            ? BanzamiColors.primary
            : BanzamiColors.gray200;
    final Color fill = widget.hasError
        ? BanzamiColors.errorBg
        : BanzamiColors.gray100;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 120),
      height: 60,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BanzamiRadius.lgAll,
        border: Border.all(color: border, width: isActive || widget.hasError ? 2 : 1.5),
      ),
      child: filled
          ? Text(
              code[i],
              style: BanzamiTextStyles.headingMd.copyWith(
                color: BanzamiColors.gray900,
                fontWeight: FontWeight.w700,
              ),
            )
          : (isActive
              // A slim caret in the active empty box (no blink → no jitter).
              ? Container(width: 2, height: 24, color: BanzamiColors.primary)
              : const SizedBox.shrink()),
    );
  }
}
