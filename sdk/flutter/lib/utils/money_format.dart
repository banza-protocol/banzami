import 'package:intl/intl.dart';

/// Formats an integer minor-unit amount into a human-readable string.
///
/// AOA (Kwanza) has 100 cêntimos per kwanza, but cêntimos are not used in
/// practice — so we format 50000 as "500 Kz" rather than "500.00 Kz".
///
/// All other currencies use the standard 2-decimal convention.
String formatMinor(int amountMinor, String currency) {
  final symbol = _currencySymbol(currency);
  final divisor = _minorDivisor(currency);
  final amount  = amountMinor / divisor;

  if (currency == 'AOA') {
    if (amountMinor > 0 && amountMinor < divisor) {
      return '${NumberFormat('#,##0.##', 'pt_PT').format(amount)} $symbol';
    }
    final formatter = NumberFormat('#,##0', 'pt_PT');
    return '${formatter.format(amount)} $symbol';
  }

  final formatter = NumberFormat('#,##0.00', 'en_US');
  return '$symbol ${formatter.format(amount)}';
}

/// Returns true if the amount is zero.
bool isZero(int amountMinor) => amountMinor == 0;

String _currencySymbol(String currency) => switch (currency) {
  'AOA' => 'Kz',
  'USD' => 'USD',
  'EUR' => '€',
  _     => currency,
};

int _minorDivisor(String currency) => switch (currency) {
  'AOA' => 100,
  'USD' => 100,
  'EUR' => 100,
  _     => 100,
};
