/// A payment request — a merchant asks a specific payer (by @banza handle) to
/// pay a fixed amount. Distinct from a payment link: it targets a payer and is
/// accepted/declined rather than opened by anyone.
class PaymentRequest {
  final String id;
  final String requesterId;
  final String? payerId;
  final int amountMinor;
  final String currency;
  final String? description;
  final PaymentRequestStatus status;
  final DateTime? expiresAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  const PaymentRequest({
    required this.id,
    required this.requesterId,
    this.payerId,
    required this.amountMinor,
    required this.currency,
    this.description,
    required this.status,
    this.expiresAt,
    required this.createdAt,
    required this.updatedAt,
  });

  factory PaymentRequest.fromJson(Map<String, dynamic> json) => PaymentRequest(
        id:          json['id'] as String,
        requesterId: json['requester_id'] as String,
        payerId:     json['payer_id'] as String?,
        amountMinor: json['amount_minor'] as int,
        currency:    json['currency'] as String,
        description: json['description'] as String?,
        status:      PaymentRequestStatus.fromString(json['status'] as String),
        expiresAt:   json['expires_at'] != null
            ? DateTime.parse(json['expires_at'] as String)
            : null,
        createdAt:   DateTime.parse(json['created_at'] as String),
        updatedAt:   DateTime.parse(json['updated_at'] as String),
      );
}

enum PaymentRequestStatus {
  pending,
  paid,
  declined,
  cancelled,
  expired;

  static PaymentRequestStatus fromString(String s) => switch (s) {
        'PENDING'   => pending,
        'PAID'      => paid,
        'DECLINED'  => declined,
        'CANCELLED' => cancelled,
        'EXPIRED'   => expired,
        _           => pending,
      };

  bool get isPending => this == pending;
}

/// A page of payment requests.
class PaymentRequestPage {
  final List<PaymentRequest> data;
  final String? nextCursor;

  const PaymentRequestPage({required this.data, this.nextCursor});

  factory PaymentRequestPage.fromJson(Map<String, dynamic> json) => PaymentRequestPage(
        data: ((json['data'] as List?) ?? const [])
            .map((e) => PaymentRequest.fromJson(e as Map<String, dynamic>))
            .toList(),
        nextCursor: json['next_cursor'] as String?,
      );
}
