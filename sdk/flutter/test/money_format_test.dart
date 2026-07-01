import 'package:flutter_test/flutter_test.dart' hide isZero;

import 'package:banzami_flutter/banzami_flutter.dart';

void main() {
  group('formatMinor — AOA (Kwanza), space-grouped, no cêntimos', () {
    test('500 Kz (50000 minor)', () {
      expect(formatMinor(50000, 'AOA'), '500 Kz');
    });

    test('100 000 Kz uses a SPACE separator (never a dot/comma)', () {
      final r = formatMinor(10000000, 'AOA');
      expect(r, '100 000 Kz');
      expect(r, isNot(contains('.')));
      expect(r, isNot(contains(',')));
    });

    test('1 000 000 Kz', () {
      expect(formatMinor(100000000, 'AOA'), '1 000 000 Kz');
    });

    test('zero', () {
      expect(formatMinor(0, 'AOA'), '0 Kz');
    });

    test('one kwanza (100 minor)', () {
      expect(formatMinor(100, 'AOA'), '1 Kz');
    });

    test('a split share of 16 667 Kz (1 666 700 minor)', () {
      expect(formatMinor(1666700, 'AOA'), '16 667 Kz');
    });
  });

  group('formatKwanza — whole kwanzas', () {
    test('spec examples', () {
      expect(formatKwanza(0), '0 Kz');
      expect(formatKwanza(500), '500 Kz');
      expect(formatKwanza(50000), '50 000 Kz');
      expect(formatKwanza(1250000), '1 250 000 Kz');
    });
  });

  group('parseAmountInput', () {
    test('strips the space grouping we render', () {
      expect(parseAmountInput('50 000'), 50000);
      expect(parseAmountInput('1 250 000'), 1250000);
      expect(parseAmountInput('50000'), 50000);
    });
    test('empty / non-numeric → 0', () {
      expect(parseAmountInput(''), 0);
      expect(parseAmountInput('Kz'), 0);
    });
  });

  group('formatAmountInput — live input display', () {
    test('groups the integer with spaces, no suffix', () {
      expect(formatAmountInput('50000'), '50 000');
      expect(formatAmountInput('1250000'), '1 250 000');
      expect(formatAmountInput('28525'), '28 525');
      expect(formatAmountInput(''), '');
    });
  });

  group('splitEvenly — remainder distributed, sum always == total', () {
    test('50000 / 3 → [16667, 16667, 16666]', () {
      expect(splitEvenly(50000, 3), [16667, 16667, 16666]);
    });
    test('10000 / 4 → [2500, 2500, 2500, 2500]', () {
      expect(splitEvenly(10000, 4), [2500, 2500, 2500, 2500]);
    });
    test('10001 / 4 → [2501, 2500, 2500, 2500]', () {
      expect(splitEvenly(10001, 4), [2501, 2500, 2500, 2500]);
    });
    test('sum is always exactly the total (many cases)', () {
      for (final total in [1, 7, 100, 999, 50000, 10001, 1234567]) {
        for (final people in [2, 3, 4, 5, 7, 20]) {
          final parts = splitEvenly(total, people);
          expect(parts.length, people);
          expect(parts.fold<int>(0, (a, b) => a + b), total,
              reason: 'sum($total/$people) must equal total');
          expect(parts.every((p) => p >= 0), isTrue);
          // parts differ by at most 1
          expect(parts.first - parts.last, lessThanOrEqualTo(1));
        }
      }
    });
    test('people <= 0 → empty', () {
      expect(splitEvenly(100, 0), isEmpty);
    });
  });

  group('formatMinor — USD (unchanged 2-decimal convention)', () {
    test('10.50 USD', () {
      expect(formatMinor(1050, 'USD'), contains('10.50'));
      expect(formatMinor(1050, 'USD'), contains('USD'));
    });
  });

  group('isZero', () {
    test('true for 0, false otherwise', () {
      expect(isZero(0), isTrue);
      expect(isZero(1), isFalse);
    });
  });
}
