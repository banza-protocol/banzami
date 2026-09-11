import 'package:flutter_test/flutter_test.dart';

import 'package:banzami_flutter/banzami_flutter.dart';

/// Builds an ActivityItem with sensible defaults so each test can override
/// only the fields it cares about.
ActivityItem _item({
  required String itemType,
  String direction = 'OUTGOING',
  String? counterpartyHandle,
  String? counterpartyDisplayName,
  String? note,
}) {
  return ActivityItem(
    activityId: 'a1',
    itemType: itemType,
    direction: direction,
    amountMinor: 100000,
    currency: 'AOA',
    status: 'COMPLETED',
    createdAt: DateTime.utc(2026, 6, 25),
    counterpartyHandle: counterpartyHandle,
    counterpartyDisplayName: counterpartyDisplayName,
    note: note,
  );
}

void main() {
  group('ActivityItem.typeLabel', () {
    test('maps every known technical type to a clean PT label', () {
      expect(_item(itemType: 'P2P_SENT').typeLabel, 'Enviado');
      expect(_item(itemType: 'P2P_RECEIVED', direction: 'INCOMING').typeLabel,
          'Recebido');
      expect(_item(itemType: 'MERCHANT_PAYMENT_SENT').typeLabel, 'Pagamento');
      expect(_item(itemType: 'WALLET_FUNDED', direction: 'INCOMING').typeLabel,
          'Carregamento');
      expect(_item(itemType: 'WALLET_REVERSED').typeLabel, 'Estorno');
    });

    test('never leaks a raw technical code for unknown/future types', () {
      for (final raw in const [
        'P2P_SENT',
        'P2P_RECEIVED',
        'MERCHANT_PAYMENT_SENT',
        'PAYMENT_LINK_SENT',
        'TRANSFER_COMPLETED',
        'SOMETHING_NEW',
      ]) {
        final label = _item(itemType: raw).typeLabel;
        expect(label, isNot(contains('_')),
            reason: 'label for "$raw" must not expose the raw code');
        expect(label, isNot(equals(raw)));
      }
    });
  });

  group('ActivityItem.displayTitle', () {
    test('merchant payment with no @banza shows the merchant name (e.g. Doa)', () {
      final doa = _item(
        itemType: 'MERCHANT_PAYMENT_SENT',
        counterpartyDisplayName: 'Doa',
        note: 'Payment link: abc123',
      );
      expect(doa.displayTitle, 'Doa');
      expect(doa.typeLabel, 'Pagamento');
      expect(doa.isMerchantPayment, isTrue);
    });

    test('P2P with only a handle is prefixed with @', () {
      expect(
          _item(itemType: 'P2P_SENT', counterpartyHandle: 'fm65').displayTitle,
          '@fm65');
      // already-prefixed handles are not double-prefixed
      expect(
          _item(itemType: 'P2P_SENT', counterpartyHandle: '@fm65').displayTitle,
          '@fm65');
    });

    test('the @banza is the title; the display name is secondary', () {
      final i = _item(
        itemType: 'P2P_SENT',
        counterpartyHandle: 'fm65',
        counterpartyDisplayName: 'Fidel Monteiro',
      );
      expect(i.displayTitle, '@fm65');
      expect(i.displaySubtitle, 'Enviado · Fidel Monteiro');
      expect(i.avatarInitial, 'F');
      final bare = _item(itemType: 'P2P_RECEIVED', counterpartyHandle: 'ana');
      expect(bare.displaySubtitle, 'Recebido');
      expect(bare.avatarInitial, 'A', reason: 'never "@"');
    });

    test('funding with no counterparty falls back to Multicaixa', () {
      expect(
        _item(itemType: 'WALLET_FUNDED', direction: 'INCOMING').displayTitle,
        'Multicaixa',
      );
    });

    test('unknown type with no counterparty degrades to a clean label', () {
      final t = _item(itemType: 'TRANSFER_COMPLETED').displayTitle;
      expect(t, isNot(contains('_')));
    });
  });

  test('isMerchantPayment is false for true P2P', () {
    expect(_item(itemType: 'P2P_SENT').isMerchantPayment, isFalse);
    expect(_item(itemType: 'P2P_SENT').isP2P, isTrue);
  });
}
