// A7-42. Histórico rows were inert: a consumer who wanted yesterday's
// comprovativo could reach it only from the notification that announced it.
// A row now opens the receipt — but only where there is one to open.
import 'package:flutter_test/flutter_test.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

ActivityItem _item({String? transferId, String type = 'P2P_SENT'}) =>
    ActivityItem(
      activityId: 'a1',
      itemType: type,
      direction: type == 'P2P_SENT' ? 'OUTGOING' : 'INCOMING',
      amountMinor: 250000,
      currency: 'AOA',
      status: 'COMPLETED',
      createdAt: DateTime.utc(2026, 9, 12),
      transferId: transferId,
    );

void main() {
  test('a movement backed by a transfer has a comprovativo', () {
    expect(_item(transferId: 't-1').hasReceipt, isTrue);
    expect(_item(transferId: 't-2', type: 'MERCHANT_PAYMENT_SENT').hasReceipt,
        isTrue);
  });

  test('a movement with no transfer has none', () {
    for (final type in [
      'WALLET_FUNDED',
      'WALLET_REVERSED',
      'REFUND_RECEIVED',
      'RESTITUTION_RECEIVED'
    ]) {
      expect(_item(transferId: null, type: type).hasReceipt, isFalse,
          reason: type);
    }
    expect(_item(transferId: '   ').hasReceipt, isFalse);
  });
}
