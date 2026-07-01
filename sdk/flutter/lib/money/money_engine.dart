// Banzami / BANZA Money Engine — the single source of truth for money.
//
// GOLDEN RULE: the UI shows human money ("50 000,50 Kz"); the ledger, APIs and
// all arithmetic use integer MINOR UNITS (cêntimos). Money NEVER touches float
// or double — parsing and splitting are integer-only (BigInt while parsing,
// then a 64-bit int result).
//
//   1 Kz            = 100 minor units
//   50 000,50 Kz    = 5 000 050 minor units
//   0,01 Kz         = 1 minor unit
//
// AOA (Kwanza): symbol "Kz", scale 2, thousands separator = space, decimal
// separator = comma. Other currencies are configured but AOA is the one that
// ships first.

/// Per-currency rules.
class MoneyCurrency {
  final String code;
  final String symbol;
  final int scale; // number of decimal places (AOA = 2)
  final String thousandsSep;
  final String decimalSep;

  const MoneyCurrency({
    required this.code,
    required this.symbol,
    required this.scale,
    this.thousandsSep = ' ',
    this.decimalSep = ',',
  });

  /// Minor units per major unit (10^scale). scale 2 → 100.
  int get subunit {
    var s = 1;
    for (var i = 0; i < scale; i++) {
      s *= 10;
    }
    return s;
  }
}

const MoneyCurrency kAOA = MoneyCurrency(code: 'AOA', symbol: 'Kz', scale: 2);
const MoneyCurrency kEUR =
    MoneyCurrency(code: 'EUR', symbol: '€', scale: 2, thousandsSep: ' ', decimalSep: ',');
const MoneyCurrency kUSD =
    MoneyCurrency(code: 'USD', symbol: 'USD', scale: 2, thousandsSep: ' ', decimalSep: ',');

const Map<String, MoneyCurrency> _currencies = {
  'AOA': kAOA,
  'EUR': kEUR,
  'USD': kUSD,
};

/// Resolve a currency config, defaulting to AOA for unknown codes.
MoneyCurrency currencyOf(String code) => _currencies[code.toUpperCase()] ?? kAOA;

/// Thrown when a money string cannot be parsed. Carries a human message.
class MoneyFormatException implements Exception {
  final String message;
  const MoneyFormatException(this.message);
  @override
  String toString() => 'MoneyFormatException: $message';
}

String _groupThousands(int major, String sep) {
  final s = major.abs().toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write(sep);
    buf.write(s[i]);
  }
  return buf.toString();
}

/// Parse human input into integer MINOR UNITS. Throws [MoneyFormatException].
///
/// Accepts space thousands separators and a single comma decimal separator with
/// at most `scale` decimals. Rejects: letters, a dot decimal separator, multiple
/// commas, too many decimals, negatives, empty.
///
///   "50000"     → 5000000   (50 000 Kz)
///   "50 000,50" → 5000050
///   "1250,75"   → 125075
///   "0,01"      → 1
int parseMoneyInput(String input, {String currency = 'AOA'}) {
  final c = currencyOf(currency);
  var s = input.trim();
  if (s.isEmpty) throw const MoneyFormatException('Indique um valor.');
  // Drop the currency symbol and thousands separators (space / NBSP).
  s = s.replaceAll(c.symbol, '').replaceAll(' ', '').replaceAll(' ', '').trim();
  if (s.isEmpty) throw const MoneyFormatException('Indique um valor.');
  if (s.startsWith('-')) throw const MoneyFormatException('Valor não pode ser negativo.');
  if (s.contains('.')) {
    throw const MoneyFormatException('Use vírgula para os cêntimos (ex: 50 000,50).');
  }
  final parts = s.split(',');
  if (parts.length > 2) throw const MoneyFormatException('Use apenas uma vírgula.');
  final intPart = parts[0].isEmpty ? '0' : parts[0];
  final fracPart = parts.length == 2 ? parts[1] : '';
  if (!RegExp(r'^\d+$').hasMatch(intPart)) {
    throw const MoneyFormatException('Valor inválido.');
  }
  if (parts.length == 2 && fracPart.isEmpty) {
    throw const MoneyFormatException('Cêntimos em falta após a vírgula.');
  }
  if (fracPart.isNotEmpty && !RegExp(r'^\d+$').hasMatch(fracPart)) {
    throw const MoneyFormatException('Cêntimos inválidos.');
  }
  if (fracPart.length > c.scale) {
    throw MoneyFormatException('Máximo ${c.scale} casas decimais.');
  }
  final fracPadded = fracPart.padRight(c.scale, '0');
  final minor = BigInt.parse(intPart) * BigInt.from(c.subunit) +
      (fracPadded.isEmpty ? BigInt.zero : BigInt.parse(fracPadded));
  return minor.toInt();
}

/// Non-throwing parse — returns null on any invalid input. For live validators.
int? tryParseMoneyInput(String input, {String currency = 'AOA'}) {
  try {
    return parseMoneyInput(input, currency: currency);
  } on MoneyFormatException {
    return null;
  }
}

/// Format integer MINOR UNITS for display. Whole amounts omit the decimals
/// ("50 000 Kz"); otherwise 2 decimals with a comma ("50 000,50 Kz").
///
///   5000000 → "50 000 Kz"
///   5000050 → "50 000,50 Kz"
///   125075  → "1 250,75 Kz"
///   1       → "0,01 Kz"
///   0       → "0 Kz"
String formatMoneyMinor(int amountMinor, {String currency = 'AOA', bool showCurrency = true}) {
  final c = currencyOf(currency);
  final neg = amountMinor < 0;
  final abs = amountMinor.abs();
  final major = abs ~/ c.subunit;
  final frac = abs % c.subunit;
  var out = _groupThousands(major, c.thousandsSep);
  if (frac != 0) {
    out = '$out${c.decimalSep}${frac.toString().padLeft(c.scale, '0')}';
  }
  if (neg) out = '-$out';
  return showCurrency ? '$out ${c.symbol}' : out;
}

/// Major-unit decimal string (no grouping, no symbol) from minor units:
/// 5000050 → "50000,50", 5000000 → "50000". Useful for editable fields / APIs.
String fromMinorUnits(int amountMinor, {String currency = 'AOA'}) {
  final c = currencyOf(currency);
  final neg = amountMinor < 0;
  final abs = amountMinor.abs();
  final major = abs ~/ c.subunit;
  final frac = abs % c.subunit;
  var out = major.toString();
  if (frac != 0) out = '$out${c.decimalSep}${frac.toString().padLeft(c.scale, '0')}';
  return neg ? '-$out' : out;
}

/// Convert a major-unit string to minor units (alias of [parseMoneyInput]).
int toMinorUnits(String majorString, {String currency = 'AOA'}) =>
    parseMoneyInput(majorString, currency: currency);

/// Format a raw typed string for LIVE input display (no currency suffix):
/// groups the integer part with spaces and keeps a single comma with up to
/// `scale` decimals. "50000" → "50 000", "50000,5" → "50 000,5".
String formatMoneyInput(String raw, {String currency = 'AOA'}) {
  final c = currencyOf(currency);
  final cleaned = raw.replaceAll(RegExp(r'[^0-9,]'), '');
  final ci = cleaned.indexOf(',');
  if (ci < 0) {
    if (cleaned.isEmpty) return '';
    return _groupThousands(int.parse(cleaned), c.thousandsSep);
  }
  var intPart = cleaned.substring(0, ci).replaceAll(',', '');
  var fracPart = cleaned.substring(ci + 1).replaceAll(',', '');
  if (fracPart.length > c.scale) fracPart = fracPart.substring(0, c.scale);
  final intGrouped = intPart.isEmpty ? '0' : _groupThousands(int.parse(intPart), c.thousandsSep);
  return '$intGrouped${c.decimalSep}$fracPart';
}

/// Canonical display of an input string (parsed then formatted), or the raw
/// input unchanged if it cannot be parsed.
String normalizeMoneyInput(String input, {String currency = 'AOA'}) {
  final minor = tryParseMoneyInput(input, currency: currency);
  return minor == null ? input : formatMoneyMinor(minor, currency: currency, showCurrency: false);
}

/// Validate an input string; returns an error message or null when valid.
String? validateMoneyInput(String input, {String currency = 'AOA'}) {
  try {
    parseMoneyInput(input, currency: currency);
    return null;
  } on MoneyFormatException catch (e) {
    return e.message;
  }
}

/// Split [totalMinor] across [people] as evenly as possible in MINOR UNITS,
/// distributing the remainder one cêntimo at a time across the first
/// participants. The sum of the result is ALWAYS exactly [totalMinor].
///
///   splitEvenlyMinor(5000000, 3) → [1666667, 1666667, 1666666]
///   splitEvenlyMinor(10001, 2)   → [5001, 5000]
List<int> splitEvenlyMinor(int totalMinor, int people) {
  if (people <= 0) {
    throw const MoneyFormatException('Número de participantes inválido.');
  }
  final base = totalMinor ~/ people;
  final remainder = totalMinor % people;
  return List<int>.generate(people, (i) => base + (i < remainder ? 1 : 0));
}

/// Compute a fee in MINOR UNITS: floor(gross * bps / 10000). Integer-only,
/// never float. FLOOR rounding unless a rule says otherwise. Guarantees the fee
/// is never greater than gross.
int feeMinor(int grossMinor, int bps) {
  if (grossMinor <= 0 || bps <= 0) return 0;
  final fee = (BigInt.from(grossMinor) * BigInt.from(bps)) ~/ BigInt.from(10000);
  final f = fee.toInt();
  return f > grossMinor ? grossMinor : f;
}
