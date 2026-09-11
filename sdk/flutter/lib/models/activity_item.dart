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
  bool get isP2P => itemType == 'P2P_SENT' || itemType == 'P2P_RECEIVED';
  bool get isFunding =>
      itemType == 'WALLET_FUNDED' || itemType == 'WALLET_REVERSED';

  /// A payment to a merchant wallet (payment-link / merchant charge — e.g. a
  /// Doa donation), as opposed to a true peer-to-peer transfer.
  bool get isMerchantPayment => itemType == 'MERCHANT_PAYMENT_SENT';

  /// User-facing category label in Portuguese.
  ///
  /// Single source of truth for activity labels — raw technical codes
  /// (P2P_SENT, MERCHANT_PAYMENT_SENT, …) must NEVER reach the UI. Any
  /// unknown/future type degrades to a safe generic "Pagamento".
  String get typeLabel {
    switch (itemType) {
      case 'P2P_SENT':
        return 'Enviado';
      case 'P2P_RECEIVED':
        return 'Recebido';
      case 'MERCHANT_PAYMENT_SENT':
        return 'Pagamento';
      case 'WALLET_FUNDED':
        return 'Carregamento';
      case 'WALLET_REVERSED':
        return 'Estorno';
      case 'REFUND_RECEIVED':
        return 'Reembolso';
      case 'RESTITUTION_RECEIVED':
        return 'Restituição';
      default:
        return 'Pagamento';
    }
  }

  /// The counterparty's @banza, "@"-prefixed, or null when unknown.
  String? get counterpartyAt {
    final handle = counterpartyHandle?.trim();
    if (handle == null || handle.isEmpty) return null;
    return handle.startsWith('@') ? handle : '@$handle';
  }

  String? get _name {
    final name = counterpartyDisplayName?.trim();
    return (name == null || name.isEmpty) ? null : name;
  }

  /// Bold title for an activity row: the counterparty's @banza when known —
  /// the identity people are addressed by, for a person and for a Business
  /// ("@doa") alike — else its name, else a clean label. Never exposes a raw
  /// technical code.
  String get displayTitle {
    final at = counterpartyAt;
    if (at != null) return at;
    final name = _name;
    if (name != null) return name;
    if (isFunding) return 'Multicaixa';
    return typeLabel;
  }

  /// Second line: the category, with the display name as secondary detail
  /// when the title is the @banza ("Enviado · Fidel Monteiro").
  String get displaySubtitle {
    final name = _name;
    if (counterpartyAt != null && name != null) return '$typeLabel · $name';
    return typeLabel;
  }

  /// The letter for the row's avatar — never the "@".
  String get avatarInitial {
    final source = _name ?? counterpartyAt?.substring(1) ?? displayTitle;
    final trimmed = source.trim();
    return trimmed.isEmpty ? '·' : trimmed[0].toUpperCase();
  }

  String get amountFormatted => formatMinor(amountMinor, currency);

  factory ActivityItem.fromJson(Map<String, dynamic> json) {
    return ActivityItem(
      activityId: json['activity_id'] as String,
      itemType: json['item_type'] as String,
      direction: json['direction'] as String,
      amountMinor: (json['amount_minor'] as num).toInt(),
      currency: json['currency'] as String,
      status: json['status'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
      completedAt: json['completed_at'] != null
          ? DateTime.parse(json['completed_at'] as String)
          : null,
      counterpartyHandle: json['counterparty_handle'] as String?,
      counterpartyDisplayName: json['counterparty_display_name'] as String?,
      note: json['note'] as String?,
      transferId: json['transfer_id'] as String?,
      fundingId: json['funding_id'] as String?,
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
      items: (json['items'] as List<dynamic>)
          .map((e) => ActivityItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      nextCursor: json['next_cursor'] as String?,
      hasMore: json['has_more'] as bool? ?? false,
    );
  }
}
