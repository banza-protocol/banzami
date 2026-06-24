import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Product decision: creating a split ("Dividir conta") is a merchant feature,
/// not a consumer one. The consumer keeps balance / send / receive / pay /
/// history / profile — and may still PAY into a split (scan QR / deep link →
/// BanzamiSplitPayScreen) — but can no longer CREATE one.
///
/// Source-level guards (the receive hub needs a full provider tree to pump):
/// they lock the removal of the consumer split-creation entry so a regression
/// that re-adds the button or the route fails CI.
void main() {
  final receiveHub =
      File('lib/screens/receive_hub_screen.dart').readAsStringSync();

  group('consumer receive hub has no split-creation entry', () {
    test('no "Dividir conta" button', () {
      expect(receiveHub.contains('Dividir conta'), isFalse,
          reason: 'split creation is merchant-only');
    });

    test('does not open the split-create screen', () {
      expect(receiveHub.contains('BanzamiSplitCreateScreen'), isFalse);
      expect(receiveHub.contains('_openSplitCreate'), isFalse);
      expect(receiveHub.contains('createSplit'), isFalse);
    });

    test('keeps the valid consumer receive actions', () {
      expect(receiveHub.contains("'Receber'"), isTrue);
      expect(receiveHub.contains('Partilhar link'), isTrue);
    });
  });

  group('paying into a split stays a valid consumer action', () {
    test('scan screen still routes split QR to the pay screen', () {
      final scan = File('../../sdk/flutter/lib/screens/scan_screen.dart')
          .readAsStringSync();
      expect(scan.contains('BanzamiSplitPayScreen'), isTrue,
          reason: 'consumers may still pay their share of a split');
    });
  });
}
