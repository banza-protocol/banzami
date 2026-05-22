import '../utils/money_format.dart';

/// P2P transfer receipt — returned by POST /v1/transfers.
///
/// Uses @handle identity for sender/recipient (no internal UUIDs exposed).
class Transfer {
  final String transferId;
  final String sender;
  final String recipient;
  final int amountMinor;
  final String currency;
  final String status;
  final String? note;
  final DateTime createdAt;
  final DateTime? completedAt;
  final String? traceId;

  const Transfer({
    required this.transferId,
    required this.sender,
    required this.recipient,
    required this.amountMinor,
    required this.currency,
    required this.status,
    this.note,
    required this.createdAt,
    this.completedAt,
    this.traceId,
  });

  bool get isCompleted => status == 'COMPLETED';

  String get amountFormatted => formatMinor(amountMinor, currency);

  factory Transfer.fromJson(Map<String, dynamic> json) {
    return Transfer(
      transferId:  json['transfer_id'] as String,
      sender:      (json['sender']    as String).replaceFirst('@', ''),
      recipient:   (json['recipient'] as String).replaceFirst('@', ''),
      amountMinor: (json['amount_minor'] as num).toInt(),
      currency:    json['currency']    as String,
      status:      json['status']      as String,
      note:        json['note']        as String?,
      createdAt:   DateTime.parse(json['created_at'] as String),
      completedAt: json['completed_at'] != null
                       ? DateTime.parse(json['completed_at'] as String)
                       : null,
      traceId:     json['trace_id']    as String?,
    );
  }
}
