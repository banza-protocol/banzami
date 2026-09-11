class ConsumerPayLink {
  final String id;
  final String linkCode;
  /// Present on the receiver's own reads only; the public read shows the
  /// receiver by @banza alone (A6-07).
  final String? receiverConsumerID;
  final String receiverHandle;
  final String? receiverDisplayName;
  final int? amountMinor;
  final String? note;
  final String currency;
  final bool locked;
  final String status;
  final String? expiresAt;
  final String createdAt;
  final String? paidAt;

  /// The id of the actual `transfers` record created when this link was paid.
  /// Present once [status] is PAID. This — not [id] (the pay-link id) — is what
  /// the receipt endpoint keys on, so the comprovativo must be fetched by this.
  final String? transferId;

  const ConsumerPayLink({
    required this.id,
    required this.linkCode,
    this.receiverConsumerID,
    required this.receiverHandle,
    this.receiverDisplayName,
    this.amountMinor,
    this.note,
    required this.currency,
    required this.locked,
    required this.status,
    this.expiresAt,
    required this.createdAt,
    this.paidAt,
    this.transferId,
  });

  factory ConsumerPayLink.fromJson(Map<String, dynamic> j) => ConsumerPayLink(
        id: (j['id'] as String?) ?? j['link_code'] as String,
        linkCode: j['link_code'] as String,
        receiverConsumerID: j['receiver_consumer_id'] as String?,
        receiverHandle: j['receiver_handle'] as String,
        receiverDisplayName: j['receiver_display_name'] as String?,
        amountMinor: j['amount_minor'] as int?,
        note: j['note'] as String?,
        currency: j['currency'] as String,
        locked: j['locked'] as bool,
        status: j['status'] as String,
        expiresAt: j['expires_at'] as String?,
        createdAt: j['created_at'] as String,
        paidAt: j['paid_at'] as String?,
        transferId: j['transfer_id'] as String?,
      );

  bool get isActive => status == 'ACTIVE';
  bool get isPaid => status == 'PAID';
  bool get isExpired => status == 'EXPIRED';
}
