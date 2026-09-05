import 'package:flutter_test/flutter_test.dart' hide isZero;
import 'package:banzami_flutter/banzami_flutter.dart';

void main() {
  group('parseMoneyInput → integer minor units', () {
    test('spec examples', () {
      expect(parseMoneyInput('50000'), 5000000);
      expect(parseMoneyInput('50 000'), 5000000);
      expect(parseMoneyInput('50 000,50'), 5000050);
      expect(parseMoneyInput('1250,75'), 125075);
      expect(parseMoneyInput('1 250,75'), 125075);
      expect(parseMoneyInput('0,01'), 1);
      expect(parseMoneyInput('50 000,50 Kz'), 5000050); // tolerates the symbol
    });
    test('rejects invalid input', () {
      expect(
          () => parseMoneyInput('abc'), throwsA(isA<MoneyFormatException>()));
      expect(() => parseMoneyInput('1,234'),
          throwsA(isA<MoneyFormatException>())); // >2 decimals
      expect(() => parseMoneyInput('1,,23'),
          throwsA(isA<MoneyFormatException>())); // 2 commas
      expect(() => parseMoneyInput('1.23'),
          throwsA(isA<MoneyFormatException>())); // dot decimal
      expect(() => parseMoneyInput('-5'),
          throwsA(isA<MoneyFormatException>())); // negative
      expect(() => parseMoneyInput(''), throwsA(isA<MoneyFormatException>()));
    });
    test('tryParseMoneyInput returns null on invalid', () {
      expect(tryParseMoneyInput('abc'), isNull);
      expect(tryParseMoneyInput('50 000,50'), 5000050);
    });
  });

  group('formatMoneyMinor / formatMinor', () {
    test('spec examples (comma decimals, space thousands, Kz last)', () {
      expect(formatMoneyMinor(5000000), '50 000 Kz');
      expect(formatMoneyMinor(5000050), '50 000,50 Kz');
      expect(formatMoneyMinor(125075), '1 250,75 Kz');
      expect(formatMoneyMinor(1), '0,01 Kz');
      expect(formatMoneyMinor(0), '0 Kz');
    });
    test('never a dot or comma-as-thousands', () {
      expect(formatMoneyMinor(100000000), '1 000 000 Kz');
      expect(formatMoneyMinor(5000000).contains('.'), isFalse);
    });
    test('formatMinor delegates (decimal-aware)', () {
      expect(formatMinor(5000050, 'AOA'), '50 000,50 Kz');
      expect(formatMinor(500000, 'AOA'), '5 000 Kz');
    });
    test('showCurrency:false / fromMinorUnits', () {
      expect(formatMoneyMinor(5000050, showCurrency: false), '50 000,50');
      expect(fromMinorUnits(5000050), '50000,50');
      expect(fromMinorUnits(5000000), '50000');
    });
  });

  group('formatMoneyInput — live input', () {
    test('groups + keeps one comma with ≤2 decimals', () {
      expect(formatMoneyInput('50000'), '50 000');
      expect(formatMoneyInput('50000,5'), '50 000,5');
      expect(formatMoneyInput('50000,50'), '50 000,50');
      expect(
          formatMoneyInput('50000,505'), '50 000,50'); // truncates 3rd decimal
      expect(formatMoneyInput(''), '');
    });
  });

  group('splitEvenlyMinor — remainder in cêntimos, sum == total', () {
    test('spec examples', () {
      expect(splitEvenlyMinor(5000000, 3), [1666667, 1666667, 1666666]);
      expect(splitEvenlyMinor(10001, 2), [5001, 5000]);
      expect(
          splitEvenlyMinor(10000000, 4), [2500000, 2500000, 2500000, 2500000]);
    });
    test('sum always exactly the total; parts differ by ≤1', () {
      for (final total in [1, 7, 100, 5000000, 10001, 123456789]) {
        for (final people in [2, 3, 4, 7, 20]) {
          final parts = splitEvenlyMinor(total, people);
          expect(parts.length, people);
          expect(parts.fold<int>(0, (a, b) => a + b), total);
          expect(parts.first - parts.last, lessThanOrEqualTo(1));
        }
      }
    });
    test('people <= 0 throws', () {
      expect(
          () => splitEvenlyMinor(100, 0), throwsA(isA<MoneyFormatException>()));
    });
  });

  group('feeMinor — integer FLOOR, never float, fee ≤ gross', () {
    test('5 000 050 @ 75 bps → floor', () {
      // 5000050 * 75 / 10000 = 37500.375 → 37500
      expect(feeMinor(5000050, 75), 37500);
    });
    test('guards', () {
      expect(feeMinor(0, 75), 0);
      expect(feeMinor(1000, 0), 0);
      expect(feeMinor(100, 999999), 100); // capped at gross
    });
  });

  group('isZero', () {
    test('true for 0', () {
      expect(isZero(0), isTrue);
      expect(isZero(1), isFalse);
    });
  });
}
