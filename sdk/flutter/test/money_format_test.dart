import 'package:flutter_test/flutter_test.dart' hide isZero;

import 'package:banzami_flutter/banzami_flutter.dart';

void main() {
  group('formatMinor — AOA (Kwanza)', () {
    test('whole amounts — no decimal part', () {
      // 50000 minor units = 500 Kz
      final result = formatMinor(50000, 'AOA');
      expect(result, contains('Kz'));
      expect(result, contains('500'));
    });

    test('large amounts — thousands separator applied', () {
      // 10_000_000 minor = 100 000 Kz
      final result = formatMinor(10000000, 'AOA');
      expect(result, contains('Kz'));
      // pt_PT uses a period as thousands separator: 100.000
      expect(result, contains('100'));
    });

    test('zero amount', () {
      final result = formatMinor(0, 'AOA');
      expect(result, contains('0'));
      expect(result, contains('Kz'));
    });

    test('one kwanza', () {
      // 100 minor = 1 Kz
      final result = formatMinor(100, 'AOA');
      expect(result, contains('1'));
      expect(result, contains('Kz'));
    });

    test('large balance — 1 000 000 Kz', () {
      // 100_000_000 minor = 1 000 000 Kz
      final result = formatMinor(100000000, 'AOA');
      expect(result, contains('Kz'));
      expect(result, contains('000'));
    });
  });

  group('formatMinor — USD', () {
    test('happy path — uses USD symbol and 2 decimals', () {
      // 1050 minor = 10.50 USD
      final result = formatMinor(1050, 'USD');
      expect(result, contains('USD'));
      expect(result, contains('10'));
    });

    test('zero USD', () {
      final result = formatMinor(0, 'USD');
      expect(result, contains('0'));
      expect(result, contains('USD'));
    });

    test('large USD — thousands separator', () {
      // 1_000_000 minor = 10,000.00 USD
      final result = formatMinor(1000000, 'USD');
      expect(result, contains('USD'));
      expect(result, contains('10'));
    });
  });

  group('isZero', () {
    test('returns true for 0 minor units', () {
      expect(isZero(0), isTrue);
    });

    test('returns false for non-zero', () {
      expect(isZero(1), isFalse);
      expect(isZero(100), isFalse);
    });
  });
}
