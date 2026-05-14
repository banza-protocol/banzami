class Merchant {
  final String id;
  final String name;
  final String email;
  final String status;
  final DateTime createdAt;
  final DateTime updatedAt;

  const Merchant({
    required this.id,
    required this.name,
    required this.email,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
  });

  bool get isActive => status == 'ACTIVE';

  factory Merchant.fromJson(Map<String, dynamic> json) => Merchant(
        id:        json['id']        as String,
        name:      json['name']      as String,
        email:     json['email']     as String,
        status:    json['status']    as String,
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
        id:         json['id']          as String,
        merchantId: json['merchant_id'] as String,
        currency:   json['currency']    as String,
        status:     json['status']      as String,
        createdAt:  DateTime.parse(json['created_at'] as String),
      );
}

class MerchantBalance {
  final String walletId;
  final String currency;
  final int availableMinor;
  final int reservedMinor;
  final int totalMinor;
  final DateTime computedAt;

  const MerchantBalance({
    required this.walletId,
    required this.currency,
    required this.availableMinor,
    required this.reservedMinor,
    required this.totalMinor,
    required this.computedAt,
  });

  factory MerchantBalance.fromJson(Map<String, dynamic> json) => MerchantBalance(
        walletId:       json['wallet_id']       as String,
        currency:       json['currency']        as String,
        availableMinor: (json['available_minor'] as num).toInt(),
        reservedMinor:  (json['reserved_minor']  as num).toInt(),
        totalMinor:     (json['total_minor']     as num).toInt(),
        computedAt:     DateTime.parse(json['computed_at'] as String),
      );
}
