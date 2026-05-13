import '../utils/money_format.dart';

enum QrCodeType { static_, dynamic_ }
enum QrOwnerType { consumer, merchant }
enum QrCodeStatus { active, expired, used }

class QrCode {
  final String id;
  final String ownerId;
  final QrOwnerType ownerType;
  final QrCodeType qrType;
  final String currency;
  final int? amountMinor;
  final QrCodeStatus status;
  final DateTime? expiresAt;
  final DateTime? usedAt;
  final String? reference;
  final DateTime createdAt;

  const QrCode({
    required this.id,
    required this.ownerId,
    required this.ownerType,
    required this.qrType,
    required this.currency,
    this.amountMinor,
    required this.status,
    this.expiresAt,
    this.usedAt,
    this.reference,
    required this.createdAt,
  });

  bool get isActive  => status == QrCodeStatus.active;
  bool get isStatic  => qrType == QrCodeType.static_;
  bool get isDynamic => qrType == QrCodeType.dynamic_;

  String? get amountFormatted =>
      amountMinor != null ? formatMinor(amountMinor!, currency) : null;

  factory QrCode.fromJson(Map<String, dynamic> json) {
    return QrCode(
      id:       json['id'] as String,
      ownerId:  json['owner_id'] as String,
      ownerType: _parseOwnerType(json['owner_type'] as String? ?? ''),
      qrType:   _parseQrType(json['qr_type'] as String? ?? ''),
      currency: json['currency'] as String? ?? '',
      amountMinor: (json['amount_minor'] as num?)?.toInt(),
      status:   _parseStatus(json['status'] as String? ?? ''),
      expiresAt: json['expires_at'] != null
          ? DateTime.parse(json['expires_at'] as String)
          : null,
      usedAt:   json['used_at'] != null
          ? DateTime.parse(json['used_at'] as String)
          : null,
      reference: json['reference'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  static QrOwnerType _parseOwnerType(String s) =>
      s.toUpperCase() == 'MERCHANT' ? QrOwnerType.merchant : QrOwnerType.consumer;

  static QrCodeType _parseQrType(String s) =>
      s.toUpperCase() == 'DYNAMIC' ? QrCodeType.dynamic_ : QrCodeType.static_;

  static QrCodeStatus _parseStatus(String s) => switch (s.toUpperCase()) {
    'EXPIRED' => QrCodeStatus.expired,
    'USED'    => QrCodeStatus.used,
    _         => QrCodeStatus.active,
  };
}

class QrResponse {
  final QrCode qrCode;
  final String payload;

  const QrResponse({required this.qrCode, required this.payload});

  factory QrResponse.fromJson(Map<String, dynamic> json) {
    return QrResponse(
      qrCode:  QrCode.fromJson(json['qr_code'] as Map<String, dynamic>),
      payload: json['payload'] as String,
    );
  }
}

class ParsedQr {
  final String qrType;
  final String? ownerId;
  final String? ownerType;
  final String? currency;
  final String? qrCodeId;

  const ParsedQr({
    required this.qrType,
    this.ownerId,
    this.ownerType,
    this.currency,
    this.qrCodeId,
  });

  bool get isStatic  => qrType.toUpperCase() == 'STATIC';
  bool get isDynamic => qrType.toUpperCase() == 'DYNAMIC';

  factory ParsedQr.fromJson(Map<String, dynamic> json) {
    return ParsedQr(
      qrType:    json['qr_type']    as String,
      ownerId:   json['owner_id']   as String?,
      ownerType: json['owner_type'] as String?,
      currency:  json['currency']   as String?,
      qrCodeId:  json['qr_code_id'] as String?,
    );
  }
}
