import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../money/money_engine.dart';
import '../theme/banzami_theme.dart';

/// Live thousands+decimal formatter for money input: "50000" → "50 000",
/// "50000,5" → "50 000,5". Whole kwanzas + a single comma with ≤ scale
/// decimals. The currency suffix is rendered by the field, not stored.
class MoneyInputFormatter extends TextInputFormatter {
  final String currency;
  const MoneyInputFormatter({this.currency = 'AOA'});

  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final formatted = formatMoneyInput(newValue.text, currency: currency);
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}

/// Canonical money input. Shows human money while typing (space grouping, comma
/// decimals, "Kz" suffix); reports the value in integer MINOR UNITS via
/// [onChanged] (null when empty or invalid). Money never becomes a float.
class MoneyInput extends StatefulWidget {
  final String currency;
  final int? initialMinor;
  final void Function(int? amountMinor) onChanged;
  final String? label;
  final String? hint;
  final String? errorText;
  final bool enabled;
  final bool autofocus;

  const MoneyInput({
    super.key,
    this.currency = 'AOA',
    this.initialMinor,
    required this.onChanged,
    this.label,
    this.hint,
    this.errorText,
    this.enabled = true,
    this.autofocus = false,
  });

  @override
  State<MoneyInput> createState() => _MoneyInputState();
}

class _MoneyInputState extends State<MoneyInput> {
  late final TextEditingController _ctrl;

  @override
  void initState() {
    super.initState();
    final initial = widget.initialMinor != null
        ? fromMinorUnits(widget.initialMinor!, currency: widget.currency)
        : '';
    _ctrl = TextEditingController(text: formatMoneyInput(initial, currency: widget.currency));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  String get _symbol => currencyOf(widget.currency).symbol;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (widget.label != null) ...[
        Text(widget.label!,
            style: BanzamiTextStyles.label.copyWith(
                color: BanzamiColors.gray900, fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
      ],
      TextField(
        controller: _ctrl,
        enabled: widget.enabled,
        autofocus: widget.autofocus,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        inputFormatters: [MoneyInputFormatter(currency: widget.currency)],
        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: BanzamiColors.gray900),
        decoration: InputDecoration(
          hintText: widget.hint,
          suffixText: _symbol,
          suffixStyle: const TextStyle(
              fontSize: 16, fontWeight: FontWeight.w700, color: BanzamiColors.gray400),
          errorText: widget.errorText,
          prefixIcon: const Icon(Icons.payments_outlined),
        ),
        onChanged: (raw) => widget.onChanged(tryParseMoneyInput(raw, currency: widget.currency)),
      ),
    ]);
  }
}
