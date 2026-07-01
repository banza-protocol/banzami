import 'package:flutter/material.dart';

import '../theme/banzami_theme.dart';
import '../utils/money_format.dart';

/// Visual weight of a money value. The amount is always the dominant element:
/// bold, larger than the surrounding label text, high contrast.
enum MoneySize { sm, md, lg, xl, hero }

/// Semantic tone. Use sparingly — weight/size matter more than colour.
enum MoneyTone { normal, brand, success, danger, muted }

/// Canonical money display for the Banzami apps.
///
/// One component for every amount so formatting (space-grouped "50 000 Kz") and
/// the visual standard (bold, dominant) are consistent everywhere. Takes an
/// integer **minor-unit** amount (the ledger unit); use [MoneyAmount.kwanza] for
/// a value already in whole kwanzas (e.g. a split preview).
class MoneyAmount extends StatelessWidget {
  final int amountMinor;
  final String currency;
  final MoneySize size;
  final MoneyTone tone;
  final TextAlign align;
  final bool showCurrency;

  const MoneyAmount(
    this.amountMinor, {
    super.key,
    this.currency = 'AOA',
    this.size = MoneySize.md,
    this.tone = MoneyTone.normal,
    this.align = TextAlign.left,
    this.showCurrency = true,
  });

  /// Build from a whole-kwanza integer (not minor units): 50000 → "50 000 Kz".
  factory MoneyAmount.kwanza(
    int kwanzas, {
    Key? key,
    MoneySize size = MoneySize.md,
    MoneyTone tone = MoneyTone.normal,
    TextAlign align = TextAlign.left,
    bool showCurrency = true,
  }) =>
      MoneyAmount(
        kwanzas * 100,
        key: key,
        currency: 'AOA',
        size: size,
        tone: tone,
        align: align,
        showCurrency: showCurrency,
      );

  static String _symbol(String currency) => switch (currency) {
        'AOA' => 'Kz',
        'USD' => 'USD',
        'EUR' => '€',
        _ => currency,
      };

  double get _fontSize => switch (size) {
        MoneySize.sm => 15,
        MoneySize.md => 20,
        MoneySize.lg => 28,
        MoneySize.xl => 36,
        MoneySize.hero => 48,
      };

  FontWeight get _weight =>
      size == MoneySize.sm || size == MoneySize.md ? FontWeight.w700 : FontWeight.w800;

  Color get _color => switch (tone) {
        MoneyTone.normal => BanzamiColors.gray900,
        MoneyTone.brand => BanzamiColors.primary,
        MoneyTone.success => BanzamiColors.success,
        MoneyTone.danger => BanzamiColors.error,
        MoneyTone.muted => BanzamiColors.gray400,
      };

  @override
  Widget build(BuildContext context) {
    var text = formatMinor(amountMinor, currency);
    if (!showCurrency) {
      text = text.replaceAll(' ${_symbol(currency)}', '').replaceAll('${_symbol(currency)} ', '');
    }
    return Text(
      text,
      textAlign: align,
      style: TextStyle(
        fontSize: _fontSize,
        fontWeight: _weight,
        color: _color,
        letterSpacing: -0.01 * _fontSize,
        height: 1.1,
      ),
    );
  }
}
