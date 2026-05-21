import '../utils/money_format.dart';

class ActivityItem {
  final String activityId;
  final String itemType;
  final String direction;
  final int amountMinor;
  final String currency;
  final String status;
  final DateTime createdAt;
  final DateTime? completedAt;
  final String? counterpartyHandle;
  final String? counterpartyDisplayName;
  final String? note;
  final String? transferId;
  final String? fundingId;

  const ActivityItem({
    required this.activityId,
    required this.itemType,
    required this.direction,
    required this.amountMinor,
    required this.currency,
    required this.status,
    required this.createdAt,
    this.completedAt,
    this.counterpartyHandle,
    this.counterpartyDisplayName,
    this.note,
    this.transferId,
    this.fundingId,
  });

  bool get isOutgoing => direction == 'OUTGOING';
  bool get isIncoming => direction == 'INCOMING';
  bool get isP2P      => itemType == 'P2P_SENT' || itemType == 'P2P_RECEIVED';
  bool get isFunding  => itemType == 'WALLET_FUNDED' || itemType == 'WALLET_REVERSED';

  String get amountFormatted => formatMinor(amountMinor, currency);

  factory ActivityItem.fromJson(Map<String, dynamic> json) {
    return ActivityItem(
      activityId:              json['activity_id']               as String,
      itemType:                json['item_type']                 as String,
      direction:               json['direction']                 as String,
      amountMinor:             (json['amount_minor'] as num).toInt(),
      currency:                json['currency']                  as String,
      status:                  json['status']                    as String,
      createdAt:               DateTime.parse(json['created_at'] as String),
      completedAt:             json['completed_at'] != null
                                   ? DateTime.parse(json['completed_at'] as String)
                                   : null,
      counterpartyHandle:      json['counterparty_handle']       as String?,
      counterpartyDisplayName: json['counterparty_display_name'] as String?,
      note:                    json['note']                      as String?,
      transferId:              json['transfer_id']               as String?,
      fundingId:               json['funding_id']                as String?,
    );
  }
}

class ActivityPage {
  final List<ActivityItem> items;
  final String? nextCursor;
  final bool hasMore;

  const ActivityPage({
    required this.items,
    this.nextCursor,
    required this.hasMore,
  });

  factory ActivityPage.fromJson(Map<String, dynamic> json) {
    return ActivityPage(
      items:      (json['items'] as List<dynamic>)
                      .map((e) => ActivityItem.fromJson(e as Map<String, dynamic>))
                      .toList(),
      nextCursor: json['next_cursor'] as String?,
      hasMore:    json['has_more']    as bool? ?? false,
    );
  }
}
