import '../utils/money_format.dart';

class Transfer {
  final String id;
  final String idempotencyKey;
  final String senderId;
  final String recipientId;
  final int amountMinor;
  final String currency;
  final String status;
  final String? description;
  final String? failureReason;
  final DateTime createdAt;
  final DateTime updatedAt;

  const Transfer({
    required this.id,
    required this.idempotencyKey,
    required this.senderId,
    required this.recipientId,
    required this.amountMinor,
    required this.currency,
    required this.status,
    this.description,
    this.failureReason,
    required this.createdAt,
    required this.updatedAt,
  });

  bool get isCompleted => status == 'COMPLETED';
  bool get isFailed    => status == 'FAILED';
  bool get isPending   => status == 'PENDING';

  String get amountFormatted => formatMinor(amountMinor, currency);

  factory Transfer.fromJson(Map<String, dynamic> json) {
    final amount = json['amount'] as Map<String, dynamic>? ?? {};
    return Transfer(
      id:             json['id'] as String,
      idempotencyKey: json['idempotency_key'] as String,
      senderId:       json['sender_id']   as String,
      recipientId:    json['recipient_id'] as String,
      amountMinor:    (amount['amount_minor'] as num?)?.toInt()
                      ?? (json['amount_minor'] as num?)?.toInt()
                      ?? 0,
      currency:       (amount['currency'] as String?) ?? (json['currency'] as String? ?? ''),
      status:         json['status'] as String,
      description:    json['description'] as String?,
      failureReason:  json['failure_reason'] as String?,
      createdAt:      DateTime.parse(json['created_at'] as String),
      updatedAt:      DateTime.parse(json['updated_at'] as String),
    );
  }
}

class TransferPage {
  final List<Transfer> data;
  final bool hasMore;
  final String? nextCursor;

  const TransferPage({
    required this.data,
    required this.hasMore,
    this.nextCursor,
  });

  factory TransferPage.fromJson(Map<String, dynamic> json) {
    return TransferPage(
      data:       (json['data'] as List<dynamic>)
                      .map((e) => Transfer.fromJson(e as Map<String, dynamic>))
                      .toList(),
      hasMore:    json['has_more'] as bool? ?? false,
      nextCursor: json['next_cursor'] as String?,
    );
  }
}
