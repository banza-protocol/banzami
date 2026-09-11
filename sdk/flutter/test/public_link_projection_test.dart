import 'package:flutter_test/flutter_test.dart';
import 'package:banzami_flutter/models/payment_link.dart';
import 'package:banzami_flutter/models/consumer_pay_link.dart';

// A6-07. The public payer reads no longer carry internal ids — the Business's
// merchant, wallet and account ids on a payment link; the receiver's and the
// payer's consumer ids on a payment request. The models read what remains.
void main() {
  test('a public payment link decodes without its internal ids', () {
    final l = PaymentLink.fromJson({
      'slug': 'abcdef012345', 'amount_minor': 2000, 'currency': 'AOA', 'status': 'ACTIVE',
      'merchant_name': 'Loja', 'merchant_handle': 'loja',
      'created_at': '2026-09-11T00:00:00Z', 'updated_at': '2026-09-11T00:00:00Z',
    });
    expect(l.id, 'abcdef012345');
    expect(l.merchantId, isNull);
    expect(l.walletId, isNull);
  });

  test('a public payment request decodes with the receiver by @banza only', () {
    final r = ConsumerPayLink.fromJson({
      'link_code': 'ABCD2345', 'receiver_handle': 'ana', 'currency': 'AOA',
      'locked': true, 'status': 'ACTIVE', 'created_at': '2026-09-11T00:00:00Z',
    });
    expect(r.id, 'ABCD2345');
    expect(r.receiverConsumerID, isNull);
    expect(r.receiverHandle, 'ana');
    expect(r.receiverDisplayName, isNull);
  });
}
