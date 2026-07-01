import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Product decision: splitting a bill ("Dividir cobrança") is a MERCHANT
/// feature, built on BANZA Collections (ADR-036). It is not part of the
/// consumer app at all — the consumer keeps balance / send / receive / pay /
/// history / profile, and pays a share through the normal payment-link / QR
/// surfaces. There is no consumer split-create OR split-pay screen.
///
/// Source-level guards (the receive hub / scan screen need a full provider tree
/// to pump): they lock the removal of every consumer split entry so a
/// regression that re-adds a split button, route, or client call fails CI.
void main() {
  final receiveHub =
      File('lib/screens/receive_hub_screen.dart').readAsStringSync();
  final scan = File('../../sdk/flutter/lib/screens/scan_screen.dart')
      .readAsStringSync();
  final consumerClient =
      File('../../sdk/flutter/lib/client/consumer_public_client.dart')
          .readAsStringSync();

  group('consumer receive hub has no split entry', () {
    test('no "Dividir conta" button', () {
      expect(receiveHub.contains('Dividir conta'), isFalse,
          reason: 'splitting a bill is merchant-only');
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

  group('the consumer app has no split-pay surface', () {
    test('scan screen no longer opens the split-pay screen', () {
      expect(scan.contains('BanzamiSplitPayScreen'), isFalse,
          reason: 'legacy P2P split (/v1/splits) was retired for Collections; '
              'a share is paid via the normal payment-link / QR surfaces');
      expect(scan.contains('_openSplitPayment'), isFalse);
    });

    test('consumer client exposes no split methods', () {
      expect(consumerClient.contains('createSplit'), isFalse);
      expect(consumerClient.contains('getSplit'), isFalse);
      expect(consumerClient.contains('paySplit'), isFalse);
      expect(consumerClient.contains('/v1/splits'), isFalse);
    });
  });
}
