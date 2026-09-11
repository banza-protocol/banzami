import 'package:flutter/material.dart';

import '../money/money_engine.dart';
import '../theme/banzami_theme.dart';
import 'money_input.dart';

/// Large-format monetary amount input.
///
/// Displays the amount in major units while internally tracking minor units.
/// The user types "500" and sees "500 Kz"; the widget exposes 50000 minor units.
/// Parsing and formatting go through the Money Engine — integer minor units
/// only, never a double ("50 000,50" → 5000050).
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
        ? formatMoneyInput(
            fromMinorUnits(widget.initialAmountMinor!, currency: widget.currency),
            currency: widget.currency)
        : '';
    _controller = TextEditingController(text: initial);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String get _symbol => currencyOf(widget.currency).symbol;

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
                      const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [
                    MoneyInputFormatter(currency: widget.currency),
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
                  onChanged: (raw) => widget.onChanged(
                      tryParseMoneyInput(raw, currency: widget.currency) ?? 0),
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
