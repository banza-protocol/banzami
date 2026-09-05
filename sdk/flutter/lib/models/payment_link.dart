class PaymentLink {
  final String id;
  final String slug;
  final String merchantId;
  final String? merchantName;
  final String walletId;
  final int? amountMinor;
  final String currency;
  final String? description;
  final PaymentLinkStatus status;
  final DateTime? expiresAt;
  final DateTime? paidAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  /// The resulting transfer's id, present only on the pay response. The receipt
  /// (comprovativo) endpoint keys on the transaction id, not the link id, so the
  /// receipt MUST be fetched by this when available.
  final String? transferId;

  const PaymentLink({
    required this.id,
    required this.slug,
    required this.merchantId,
    this.merchantName,
    required this.walletId,
    this.amountMinor,
    required this.currency,
    this.description,
    required this.status,
    this.expiresAt,
    this.paidAt,
    required this.createdAt,
    required this.updatedAt,
    this.transferId,
  });

  factory PaymentLink.fromJson(Map<String, dynamic> json) => PaymentLink(
        id: json['id'] as String,
        slug: json['slug'] as String,
        merchantId: json['merchant_id'] as String,
        merchantName: json['merchant_name'] as String?,
        walletId: json['wallet_id'] as String,
        amountMinor: json['amount_minor'] as int?,
        currency: json['currency'] as String,
        description: json['description'] as String?,
        status: PaymentLinkStatus.fromString(json['status'] as String),
        transferId: json['transaction_id'] as String?,
        expiresAt: json['expires_at'] != null
            ? DateTime.parse(json['expires_at'] as String)
            : null,
        paidAt: json['paid_at'] != null
            ? DateTime.parse(json['paid_at'] as String)
            : null,
        createdAt: DateTime.parse(json['created_at'] as String),
        updatedAt: DateTime.parse(json['updated_at'] as String),
      );
}

enum PaymentLinkStatus {
  active,
  used,
  expired,
  cancelled;

  static PaymentLinkStatus fromString(String s) => switch (s) {
        'ACTIVE' => active,
        'USED' => used,
        'EXPIRED' => expired,
        'CANCELLED' => cancelled,
        _ => active,
      };
}

class PaymentLinkPage {
  final List<PaymentLink> data;
  final String? nextCursor;

  const PaymentLinkPage({required this.data, this.nextCursor});

  factory PaymentLinkPage.fromJson(Map<String, dynamic> json) =>
      PaymentLinkPage(
        data: (json['data'] as List<dynamic>)
            .map((e) => PaymentLink.fromJson(e as Map<String, dynamic>))
            .toList(),
        nextCursor: json['next_cursor'] as String?,
      );
}
