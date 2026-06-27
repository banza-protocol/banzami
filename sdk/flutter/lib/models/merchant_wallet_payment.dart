/// A merchant's received wallet-native payment (canonical source:
/// wallet_payments). Read-only view used to list payments and offer the official
/// receipt PDF.
class MerchantWalletPayment {
  final String id;
  final String reference;
  final int amountMinor;
  final String currency;
  final String status;
  final String payerName;
  final DateTime createdAt;
  final bool receiptAvailable;

  const MerchantWalletPayment({
    required this.id,
    required this.reference,
    required this.amountMinor,
    required this.currency,
    required this.status,
    required this.payerName,
    required this.createdAt,
    required this.receiptAvailable,
  });

  factory MerchantWalletPayment.fromJson(Map<String, dynamic> json) {
    return MerchantWalletPayment(
      id:               json['id'] as String,
      reference:        (json['reference'] as String?) ?? '',
      amountMinor:      (json['amount_minor'] as num).toInt(),
      currency:         (json['currency'] as String?) ?? 'AOA',
      status:           (json['status'] as String?) ?? '',
      payerName:        (json['payer_name'] as String?) ?? '',
      createdAt:        DateTime.parse(json['created_at'] as String),
      receiptAvailable: (json['receipt_available'] as bool?) ?? false,
    );
  }
}

/// One page of received payments with an opaque cursor for the next page.
class MerchantWalletPaymentPage {
  final List<MerchantWalletPayment> items;
  final String? nextCursor;

  const MerchantWalletPaymentPage({required this.items, this.nextCursor});

  factory MerchantWalletPaymentPage.fromJson(Map<String, dynamic> json) {
    final raw = (json['items'] as List<dynamic>? ?? const []);
    return MerchantWalletPaymentPage(
      items: raw
          .map((e) => MerchantWalletPayment.fromJson(e as Map<String, dynamic>))
          .toList(),
      nextCursor: json['next_cursor'] as String?,
    );
  }
}
