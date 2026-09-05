import '../utils/money_format.dart';

class WalletBalance {
  final String walletId;
  final String consumerId;
  final String currency;
  final int availableMinor;
  final int reservedMinor;
  final int totalMinor;
  final DateTime computedAt;

  const WalletBalance({
    required this.walletId,
    required this.consumerId,
    required this.currency,
    required this.availableMinor,
    required this.reservedMinor,
    required this.totalMinor,
    required this.computedAt,
  });

  /// Human-readable available balance, e.g. "50 000 Kz".
  String get availableFormatted => formatMinor(availableMinor, currency);
  String get reservedFormatted => formatMinor(reservedMinor, currency);
  String get totalFormatted => formatMinor(totalMinor, currency);

  factory WalletBalance.fromJson(Map<String, dynamic> json) {
    return WalletBalance(
      walletId: json['wallet_id'] as String,
      consumerId: json['consumer_id'] as String,
      currency: json['currency'] as String,
      availableMinor: json['available_minor'] as int,
      reservedMinor: json['reserved_minor'] as int,
      totalMinor: json['total_minor'] as int,
      computedAt: DateTime.parse(json['computed_at'] as String),
    );
  }
}
