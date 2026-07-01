import 'package:intl/intl.dart';

// Banzami money formatting — single source of truth.
//
// Global rule (all Banzami surfaces): group thousands with a plain SPACE, never
// a dot or comma, currency word at the end: "50 000 Kz". Kwanza (AOA) is shown
// without cêntimos (not used in practice), so 5 000 000 minor → "50 000 Kz".

/// Group an integer's thousands with a regular ASCII space: 1250000 → "1 250 000".
String _groupThousands(int n) {
  final neg = n < 0;
  final s = n.abs().toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write(' ');
    buf.write(s[i]);
  }
  return neg ? '-${buf.toString()}' : buf.toString();
}

/// Formats an integer minor-unit amount into a human-readable string.
///
/// AOA (Kwanza) has 100 cêntimos per kwanza, but cêntimos are not used in
/// practice — so we format 5 000 000 minor as "50 000 Kz". Thousands are grouped
/// with a plain space (never a dot/comma). Other currencies use the standard
/// 2-decimal convention.
String formatMinor(int amountMinor, String currency) {
  final symbol = _currencySymbol(currency);
  final divisor = _minorDivisor(currency);

  if (currency == 'AOA') {
    // Sub-kwanza (rare): show up to 2 decimals; otherwise whole kwanzas.
    if (amountMinor != 0 && amountMinor.abs() < divisor) {
      final v = amountMinor / divisor;
      return '${NumberFormat('0.##', 'en_US').format(v)} $symbol';
    }
    final whole = (amountMinor / divisor).round();
    return '${_groupThousands(whole)} $symbol';
  }

  final formatter = NumberFormat('#,##0.00', 'en_US');
  return '$symbol ${formatter.format(amountMinor / divisor)}';
}

/// Formats a WHOLE-kwanza amount (not minor units): 50000 → "50 000 Kz".
/// Use for split previews and any place that already works in whole kwanzas.
String formatKwanza(int kwanzas) => '${_groupThousands(kwanzas)} Kz';

/// Parse a user-typed amount string into a whole-kwanza integer, tolerant of the
/// space grouping we render: "50 000" → 50000, "1 250 000" → 1250000. Non-digit
/// characters (spaces, separators, letters) are stripped. Empty → 0.
int parseAmountInput(String raw) {
  final digits = raw.replaceAll(RegExp(r'[^0-9]'), '');
  return digits.isEmpty ? 0 : int.parse(digits);
}

/// Format a raw typed string as a space-grouped whole number for live input
/// display (no currency suffix): "50000" → "50 000". Empty stays empty.
String formatAmountInput(String raw) {
  final digits = raw.replaceAll(RegExp(r'[^0-9]'), '');
  if (digits.isEmpty) return '';
  return _groupThousands(int.parse(digits));
}

/// Split [total] across [people] as evenly as possible, distributing the
/// remainder one unit at a time across the first participants. The sum of the
/// result is ALWAYS exactly [total]. Example: splitEvenly(50000, 3) →
/// [16667, 16667, 16666].
List<int> splitEvenly(int total, int people) {
  if (people <= 0) return const [];
  final base = total ~/ people;
  final remainder = total % people;
  return List<int>.generate(people, (i) => base + (i < remainder ? 1 : 0));
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
