class Merchant {
  final String id;
  final String name;
  final String email;
  final String status;
  final bool verified;
  final DateTime createdAt;
  final DateTime updatedAt;

  const Merchant({
    required this.id,
    required this.name,
    required this.email,
    required this.status,
    this.verified = false,
    required this.createdAt,
    required this.updatedAt,
  });

  bool get isActive => status == 'ACTIVE';

  factory Merchant.fromJson(Map<String, dynamic> json) => Merchant(
        id: json['id'] as String,
        name: json['name'] as String,
        email: json['email'] as String,
        status: json['status'] as String,
        verified: json['verified'] as bool? ?? false,
        createdAt: DateTime.parse(json['created_at'] as String),
        updatedAt: DateTime.parse(json['updated_at'] as String),
      );
}

class MerchantWallet {
  final String id;
  final String merchantId;
  final String currency;
  final String status;
  final DateTime createdAt;

  const MerchantWallet({
    required this.id,
    required this.merchantId,
    required this.currency,
    required this.status,
    required this.createdAt,
  });

  factory MerchantWallet.fromJson(Map<String, dynamic> json) => MerchantWallet(
        id: json['id'] as String,
        merchantId: json['merchant_id'] as String,
        currency: json['currency'] as String,
        status: json['status'] as String,
        createdAt: DateTime.parse(json['created_at'] as String),
      );
}

class MerchantTransaction {
  final String id;
  final String status;
  final int amountMinor;
  final String currency;
  final String merchantId;
  final String? description;
  final DateTime createdAt;

  const MerchantTransaction({
    required this.id,
    required this.status,
    required this.amountMinor,
    required this.currency,
    required this.merchantId,
    this.description,
    required this.createdAt,
  });

  bool get isCompleted => status == 'COMPLETED' || status == 'PAID';

  factory MerchantTransaction.fromJson(Map<String, dynamic> json) =>
      MerchantTransaction(
        id: json['id'] as String,
        status: json['status'] as String,
        amountMinor: (json['amount_minor'] as num).toInt(),
        currency: json['currency'] as String,
        merchantId: json['merchant_id'] as String,
        description: json['description'] as String?,
        createdAt: DateTime.parse(json['created_at'] as String),
      );
}

class MerchantTransactionPage {
  final List<MerchantTransaction> data;
  final String? nextCursor;
  final bool hasMore;

  const MerchantTransactionPage({
    required this.data,
    this.nextCursor,
    required this.hasMore,
  });

  factory MerchantTransactionPage.fromJson(Map<String, dynamic> json) =>
      MerchantTransactionPage(
        data: (json['data'] as List<dynamic>)
            .map((e) => MerchantTransaction.fromJson(e as Map<String, dynamic>))
            .toList(),
        nextCursor: json['next_cursor'] as String?,
        hasMore: json['has_more'] as bool? ?? false,
      );
}

class MerchantBalance {
  final String walletId;
  final String currency;
  final int availableMinor;
  final int reservedMinor;
  final int totalMinor;

  /// Money held in the wallet's segregated non-PRIMARY accounts (e.g. campaign
  /// accounts) — received but not part of the spendable available balance.
  final int heldMinor;
  final DateTime computedAt;

  const MerchantBalance({
    required this.walletId,
    required this.currency,
    required this.availableMinor,
    required this.reservedMinor,
    required this.totalMinor,
    this.heldMinor = 0,
    required this.computedAt,
  });

  factory MerchantBalance.fromJson(Map<String, dynamic> json) =>
      MerchantBalance(
        walletId: json['wallet_id'] as String,
        currency: json['currency'] as String,
        availableMinor: (json['available_minor'] as num).toInt(),
        reservedMinor: (json['reserved_minor'] as num).toInt(),
        totalMinor: (json['total_minor'] as num).toInt(),
        heldMinor: (json['held_minor'] as num?)?.toInt() ?? 0,
        computedAt: DateTime.parse(json['computed_at'] as String),
      );
}

/// A segregated sub-account within a merchant wallet (BANZA ADR-042): PRIMARY is
/// the spendable balance; CAMPAIGN/PROJECT/EVENT/… hold funds for a purpose.
class MerchantWalletAccount {
  final String id;
  final String purpose;
  final String? label;
  final String? referenceType;
  final String? referenceId;
  final String status;
  final int availableBalanceMinor;
  final String currency;
  final DateTime createdAt;

  const MerchantWalletAccount({
    required this.id,
    required this.purpose,
    this.label,
    this.referenceType,
    this.referenceId,
    required this.status,
    required this.availableBalanceMinor,
    required this.currency,
    required this.createdAt,
  });

  bool get isPrimary => purpose == 'PRIMARY';

  factory MerchantWalletAccount.fromJson(Map<String, dynamic> json) =>
      MerchantWalletAccount(
        id: json['id'] as String,
        purpose: json['purpose'] as String,
        label: json['label'] as String?,
        referenceType: json['reference_type'] as String?,
        referenceId: json['reference_id'] as String?,
        status: json['status'] as String,
        availableBalanceMinor:
            (json['available_balance_minor'] as num?)?.toInt() ?? 0,
        currency: json['currency'] as String? ?? 'AOA',
        createdAt: DateTime.parse(json['created_at'] as String),
      );
}
