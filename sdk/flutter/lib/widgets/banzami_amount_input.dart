import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/banzami_theme.dart';

/// Large-format monetary amount input.
///
/// Displays the amount in major units while internally tracking minor units.
/// The user types "500" and sees "500 Kz"; the widget exposes 50000 minor units.
///
/// Designed to sit prominently at the top of payment initiation screens.
class BanzamiAmountInput extends StatefulWidget {
  final String currency;
  final int? initialAmountMinor;
  final void Function(int amountMinor) onChanged;
  final String? errorText;
  final bool enabled;

  const BanzamiAmountInput({
    super.key,
    this.currency = 'AOA',
    this.initialAmountMinor,
    required this.onChanged,
    this.errorText,
    this.enabled = true,
  });

  @override
  State<BanzamiAmountInput> createState() => _BanzamiAmountInputState();
}

class _BanzamiAmountInputState extends State<BanzamiAmountInput> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    final initial = widget.initialAmountMinor != null
        ? (widget.initialAmountMinor! / 100).toStringAsFixed(0)
        : '';
    _controller = TextEditingController(text: initial);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String get _symbol => switch (widget.currency) {
        'AOA' => 'Kz',
        'USD' => 'USD',
        'EUR' => '€',
        _ => widget.currency,
      };

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          decoration: BoxDecoration(
            color: BanzamiColors.gray100,
            borderRadius: BanzamiRadius.lgAll,
            border: widget.errorText != null
                ? Border.all(color: BanzamiColors.error, width: 1.5)
                : null,
          ),
          padding: const EdgeInsets.symmetric(
            horizontal: BanzamiSpacing.xl,
            vertical: BanzamiSpacing.lg,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  enabled: widget.enabled,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: false),
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    _ThousandsSeparatorFormatter(),
                  ],
                  style: BanzamiTextStyles.monoLg.copyWith(
                    color: BanzamiColors.gray900,
                  ),
                  decoration: InputDecoration(
                    border: InputBorder.none,
                    hintText: '0',
                    hintStyle: BanzamiTextStyles.monoLg.copyWith(
                      color: BanzamiColors.gray400,
                    ),
                    contentPadding: EdgeInsets.zero,
                    isDense: true,
                    fillColor: Colors.transparent,
                    filled: true,
                  ),
                  onChanged: (raw) {
                    final digits = raw.replaceAll(RegExp(r'[^\d]'), '');
                    final major = int.tryParse(digits) ?? 0;
                    widget.onChanged(major * 100);
                  },
                ),
              ),
              const SizedBox(width: BanzamiSpacing.sm),
              Text(
                _symbol,
                style: BanzamiTextStyles.headingMd.copyWith(
                  color: BanzamiColors.gray400,
                ),
              ),
            ],
          ),
        ),
        if (widget.errorText != null) ...[
          const SizedBox(height: BanzamiSpacing.xs),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.sm),
            child: Text(
              widget.errorText!,
              style:
                  BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error),
            ),
          ),
        ],
      ],
    );
  }
}

/// Inserts a space separator every 3 digits (e.g. 1000000 → 1 000 000).
class _ThousandsSeparatorFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = newValue.text.replaceAll(RegExp(r'[^\d]'), '');
    if (digits.isEmpty) return newValue.copyWith(text: '');

    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(' ');
      buffer.write(digits[i]);
    }
    final formatted = buffer.toString();
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}
