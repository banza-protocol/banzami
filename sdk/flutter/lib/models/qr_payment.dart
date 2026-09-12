/// A settled structured-QR payment (CAP-PAY-003).
///
/// What the server answers after the money has moved: the transfer it settled
/// as, the amount actually charged, and which kind of code was paid. The amount
/// is echoed back deliberately — for a dynamic code it is the signed record's,
/// not whatever the caller sent, and a client that displays its own figure
/// instead of this one can show a number the ledger disagrees with.
class QrPayment {
  const QrPayment({
    required this.transferId,
    required this.amountMinor,
    required this.currency,
    required this.qrType,
    this.walletPaymentId,
    this.paidAt,
  });

  /// The settled transfer. On a replayed idempotency key this is the transfer
  /// that already existed, not a second one.
  final String transferId;

  /// The amount charged, in minor units. For a dynamic QR this is the code's
  /// own amount and may differ from anything the caller supplied.
  final int amountMinor;
  final String currency;

  /// `STATIC` (reusable, payer chooses the amount) or `DYNAMIC` (single-use,
  /// fixed amount).
  final String qrType;

  /// Present only when the code belonged to a Business: the typed, refundable
  /// object the payment produced. A person-to-person QR payment has none —
  /// it is a transfer, not a merchant payment.
  final String? walletPaymentId;

  final DateTime? paidAt;

  bool get isDynamic => qrType == 'DYNAMIC';

  factory QrPayment.fromJson(Map<String, dynamic> json) => QrPayment(
        transferId: json['transfer_id'] as String,
        amountMinor: (json['amount_minor'] as num).toInt(),
        currency: json['currency'] as String? ?? 'AOA',
        qrType: json['qr_type'] as String? ?? 'STATIC',
        walletPaymentId: json['wallet_payment_id'] as String?,
        paidAt: json['paid_at'] == null
            ? null
            : DateTime.tryParse(json['paid_at'] as String),
      );
}
