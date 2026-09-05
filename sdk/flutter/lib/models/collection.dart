// Payment Collections — BANZA ADR-036 (Collection + CollectionShare) and the
// ADR-037 PaymentIntent surfaced from a share.
//
// A Collection is a single financial object that groups N shares of one total
// (e.g. a restaurant bill split among 4). Each share is paid independently and
// settles straight into the merchant wallet; the collection tracks how much has
// been collected and what remains. This is protocol-defined behaviour — the
// operator implements it, the SDK exposes it, apps consume it (BANZA ADR-035).

/// Lifecycle of a collection. Raw strings are kept so an unknown future status
/// never crashes the client.
class CollectionStatus {
  static const draft = 'DRAFT';
  static const open = 'OPEN';
  static const partiallyCompleted = 'PARTIALLY_COMPLETED';
  static const completed = 'COMPLETED';
  static const cancelled = 'CANCELLED';
}

/// Lifecycle of a single share.
class ShareStatus {
  static const pending = 'PENDING';
  static const paymentRequested = 'PAYMENT_REQUESTED';
  static const paid = 'PAID';
  static const expired = 'EXPIRED';
  static const cancelled = 'CANCELLED';
}

class Collection {
  final String id;
  final String merchantId;
  final String walletId;
  final String? title;
  final String? description;
  final String currency;
  final int totalAmountMinor;
  final String status;

  /// Rule discriminator — 'EQUAL_SPLIT', 'FIXED_AMOUNTS', … (from `rule.type`).
  final String ruleType;
  final String environment;
  final DateTime? expiresAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  const Collection({
    required this.id,
    required this.merchantId,
    required this.walletId,
    this.title,
    this.description,
    required this.currency,
    required this.totalAmountMinor,
    required this.status,
    required this.ruleType,
    required this.environment,
    this.expiresAt,
    required this.createdAt,
    required this.updatedAt,
  });

  bool get isOpen => status == CollectionStatus.open;
  bool get isCompleted => status == CollectionStatus.completed;
  bool get isCancelled => status == CollectionStatus.cancelled;
  bool get isTerminal => isCompleted || isCancelled;

  factory Collection.fromJson(Map<String, dynamic> json) {
    final rule = json['rule'];
    return Collection(
      id: json['id'] as String,
      merchantId: json['merchant_id'] as String,
      walletId: json['wallet_id'] as String,
      title: json['title'] as String?,
      description: json['description'] as String?,
      currency: json['currency'] as String,
      totalAmountMinor: (json['total_amount_minor'] as num).toInt(),
      status: json['status'] as String,
      ruleType: rule is Map<String, dynamic>
          ? rule['type'] as String? ?? 'UNKNOWN'
          : 'UNKNOWN',
      environment: json['environment'] as String? ?? '',
      expiresAt: json['expires_at'] != null
          ? DateTime.parse(json['expires_at'] as String)
          : null,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );
  }
}

class CollectionShare {
  final String id;
  final String collectionId;
  final String? participant;
  final int amountMinor;
  final String currency;
  final String status;
  final String? paymentIntentId;
  final String? transferId;
  final DateTime? paidAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  const CollectionShare({
    required this.id,
    required this.collectionId,
    this.participant,
    required this.amountMinor,
    required this.currency,
    required this.status,
    this.paymentIntentId,
    this.transferId,
    this.paidAt,
    required this.createdAt,
    required this.updatedAt,
  });

  bool get isPaid => status == ShareStatus.paid;
  bool get isPending => status == ShareStatus.pending;

  factory CollectionShare.fromJson(Map<String, dynamic> json) =>
      CollectionShare(
        id: json['id'] as String,
        collectionId: json['collection_id'] as String,
        participant: json['participant'] as String?,
        amountMinor: (json['amount_minor'] as num).toInt(),
        currency: json['currency'] as String,
        status: json['status'] as String,
        paymentIntentId: json['payment_intent_id'] as String?,
        transferId: json['transfer_id'] as String?,
        paidAt: json['paid_at'] != null
            ? DateTime.parse(json['paid_at'] as String)
            : null,
        createdAt: DateTime.parse(json['created_at'] as String),
        updatedAt: DateTime.parse(json['updated_at'] as String),
      );
}

/// Result of creating a collection — the collection plus its (already generated,
/// for closed rules) shares.
class CollectionWithShares {
  final Collection collection;
  final List<CollectionShare> shares;

  const CollectionWithShares({required this.collection, required this.shares});

  factory CollectionWithShares.fromJson(Map<String, dynamic> json) =>
      CollectionWithShares(
        collection:
            Collection.fromJson(json['collection'] as Map<String, dynamic>),
        shares: ((json['shares'] as List?) ?? const [])
            .map((e) => CollectionShare.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

/// Result of reading a collection — with derived progress fields.
class CollectionDetail {
  final Collection collection;
  final int collectedAmountMinor;
  final int remainingAmountMinor;

  const CollectionDetail({
    required this.collection,
    required this.collectedAmountMinor,
    required this.remainingAmountMinor,
  });

  factory CollectionDetail.fromJson(Map<String, dynamic> json) =>
      CollectionDetail(
        collection:
            Collection.fromJson(json['collection'] as Map<String, dynamic>),
        collectedAmountMinor:
            (json['collected_amount_minor'] as num?)?.toInt() ?? 0,
        remainingAmountMinor:
            (json['remaining_amount_minor'] as num?)?.toInt() ?? 0,
      );
}

/// Result of surfacing a share — a PaymentIntent (ADR-037) with the concrete
/// surface reference (payment-link id for LINK, dynamic-qr id for QR).
class ShareSurface {
  final String paymentIntentId;
  final String surface; // 'LINK' | 'QR'
  final String? surfaceRef;
  final CollectionShare share;

  const ShareSurface({
    required this.paymentIntentId,
    required this.surface,
    this.surfaceRef,
    required this.share,
  });

  factory ShareSurface.fromJson(Map<String, dynamic> json) {
    final intent = json['payment_intent'] as Map<String, dynamic>;
    return ShareSurface(
      paymentIntentId: intent['id'] as String,
      surface: intent['surface'] as String,
      surfaceRef: intent['surface_ref'] as String?,
      share: CollectionShare.fromJson(json['share'] as Map<String, dynamic>),
    );
  }
}
