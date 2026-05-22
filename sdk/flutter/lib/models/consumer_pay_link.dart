class ConsumerPayLink {
  final String  id;
  final String  linkCode;
  final String  receiverConsumerID;
  final String  receiverHandle;
  final String? receiverDisplayName;
  final int?    amountMinor;
  final String? note;
  final String  currency;
  final bool    locked;
  final String  status;
  final String? expiresAt;
  final String  createdAt;
  final String? paidAt;

  const ConsumerPayLink({
    required this.id,
    required this.linkCode,
    required this.receiverConsumerID,
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
  });

  factory ConsumerPayLink.fromJson(Map<String, dynamic> j) => ConsumerPayLink(
    id:                   j['id']                    as String,
    linkCode:             j['link_code']              as String,
    receiverConsumerID:   j['receiver_consumer_id']   as String,
    receiverHandle:       j['receiver_handle']        as String,
    receiverDisplayName:  j['receiver_display_name']  as String?,
    amountMinor:          j['amount_minor']           as int?,
    note:                 j['note']                   as String?,
    currency:             j['currency']               as String,
    locked:               j['locked']                 as bool,
    status:               j['status']                 as String,
    expiresAt:            j['expires_at']             as String?,
    createdAt:            j['created_at']             as String,
    paidAt:               j['paid_at']                as String?,
  );

  bool get isActive   => status == 'ACTIVE';
  bool get isPaid     => status == 'PAID';
  bool get isExpired  => status == 'EXPIRED';
}
