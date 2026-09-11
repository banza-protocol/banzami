import '../money/money_engine.dart' as money;

/// The operator's published wallet-withdrawal fee (Banzami ADR-031: 0,75%),
/// in basis points. Used ONLY to tell a Business what to expect before it
/// asks; Core prices every withdrawal itself (core/payouts, FLOOR rounding)
/// when the payout is processed, and that decision is the one that counts.
const int kWalletWithdrawalFeeBps = 75;

/// "0,75%" — the rate as the Business reads it.
String get walletWithdrawalFeeRateLabel {
  const whole = kWalletWithdrawalFeeBps ~/ 100;
  final frac = (kWalletWithdrawalFeeBps % 100).toString().padLeft(2, '0');
  return '$whole,$frac%';
}

/// What a withdrawal of [grossMinor] costs and what reaches the bank.
///
/// The fee is split OUT of the requested amount (gross = net + fee), rounded
/// down — the same `floor(gross × bps / 10 000)` Core applies. Integer minor
/// units only.
class PayoutBreakdown {
  final int grossMinor;
  final int feeMinor;
  final int netMinor;

  /// True when the numbers are Core's own (returned with the payout), false
  /// when they are the published-rate estimate.
  final bool fromServer;

  const PayoutBreakdown._(
      this.grossMinor, this.feeMinor, this.netMinor, this.fromServer);

  factory PayoutBreakdown.estimate(int grossMinor) {
    final fee = money.feeMinor(grossMinor, kWalletWithdrawalFeeBps);
    return PayoutBreakdown._(grossMinor, fee, grossMinor - fee, false);
  }

  /// Core's numbers when the payout carries them; otherwise the estimate.
  factory PayoutBreakdown.of(Payout payout) {
    final fee = payout.feeMinor;
    final net = payout.netMinor;
    if (fee != null && net != null && fee + net == payout.amountMinor) {
      return PayoutBreakdown._(payout.amountMinor, fee, net, true);
    }
    return PayoutBreakdown.estimate(payout.amountMinor);
  }
}

/// A Business withdrawal to a bank account (`/v1/payouts`).
///
/// Statuses: PENDING, PROCESSING, SENT, CONFIRMED, FAILED, RETURNED.
class Payout {
  final String id;
  final String status;
  final int amountMinor;
  final String currency;
  final String? bankCode;
  final DateTime createdAt;

  /// Core's fee and net for this payout, when the API returns them.
  final int? feeMinor;
  final int? netMinor;

  const Payout({
    required this.id,
    required this.status,
    required this.amountMinor,
    required this.currency,
    required this.createdAt,
    this.bankCode,
    this.feeMinor,
    this.netMinor,
  });

  factory Payout.fromJson(Map<String, dynamic> json) {
    final dest = json['destination'];
    return Payout(
      id: json['id'] as String,
      status: (json['status'] as String?) ?? '',
      amountMinor: (json['amount_minor'] as num).toInt(),
      currency: (json['currency'] as String?) ?? 'AOA',
      bankCode: dest is Map ? dest['bank_code'] as String? : null,
      createdAt: DateTime.parse(json['created_at'] as String),
      feeMinor: (json['fee_minor'] as num?)?.toInt(),
      netMinor: (json['net_minor'] as num?)?.toInt(),
    );
  }

  /// The status as the Business reads it.
  String get statusLabel => switch (status.toUpperCase()) {
        'PENDING' => 'Pedido',
        'PROCESSING' => 'Em processamento',
        'SENT' => 'Enviado ao banco',
        'CONFIRMED' => 'Concluído',
        'FAILED' => 'Falhou',
        'RETURNED' => 'Devolvido',
        _ => 'Estado desconhecido',
      };

  /// Still on its way — neither confirmed nor ended in failure.
  bool get isInFlight => const {'PENDING', 'PROCESSING', 'SENT'}
      .contains(status.toUpperCase());
}
