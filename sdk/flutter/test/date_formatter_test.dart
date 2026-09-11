import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'package:banzami_flutter/banzami_flutter.dart';

void main() {
  setUpAll(() async => initializeDateFormatting('pt_PT'));

  // All instants are LOCAL so the test reads the same in every time zone.
  final now = DateTime(2026, 9, 11, 9, 0); // 09:00 today

  group('BanzamiDateFormatter — calendar days, not elapsed hours', () {
    test('20:30 yesterday seen at 09:00 today is "Ontem", not "Hoje"', () {
      final lastNight = DateTime(2026, 9, 10, 20, 30); // 12.5 h ago
      expect(BanzamiDateFormatter.formatActivityTime(lastNight, now: now), 'Ontem, 20:30');
      expect(BanzamiDateFormatter.formatListTime(lastNight, now: now), 'Ontem');
      expect(BanzamiDateFormatter.formatShortTime(lastNight, now: now), 'Ontem');
      expect(BanzamiDateFormatter.formatDayHeader(lastNight, now: now), 'Ontem');
    });

    test('00:10 today is "Hoje"', () {
      final early = DateTime(2026, 9, 11, 0, 10);
      expect(BanzamiDateFormatter.formatActivityTime(early, now: now), 'Hoje, 00:10');
      expect(BanzamiDateFormatter.formatListTime(early, now: now), '00:10');
      expect(BanzamiDateFormatter.formatDayHeader(early, now: now), 'Hoje');
    });

    test('two calendar days ago is a date even if under 48 h', () {
      final twoDays = DateTime(2026, 9, 9, 23, 0); // 34 h ago
      expect(BanzamiDateFormatter.formatListTime(twoDays, now: now), '9/9');
      expect(BanzamiDateFormatter.formatActivityTime(twoDays, now: now), '9/9');
    });

    test('formatDate is a plain local calendar date', () {
      expect(BanzamiDateFormatter.formatDate(DateTime(2027, 1, 5, 12)), '05/01/2027');
    });
  });
}
