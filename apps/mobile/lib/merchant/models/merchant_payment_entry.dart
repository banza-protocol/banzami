import 'package:banzami_flutter/banzami_flutter.dart';

/// What a payment means for the Business, whatever table it came from.
enum MerchantPaymentState {
  /// Money the Business received (acquiring CAPTURED).
  received,

  /// Not settled yet (acquiring PENDING / AUTHORIZED).
  pending,

  /// Never happened — no money moved (acquiring FAILED).
  failed,

  /// Authorised then voided before capture — no money moved (REVERSED).
  reversed,

  /// Received, then returned to the payer (REFUNDED).
  refunded,

  /// A status this app does not know. Shown neutrally, never counted.
  unknown,
}

/// One payment row on the Business dashboard, history and poller.
///
/// Built from the Core acquiring transaction list (`GET /v1/transactions`).
/// Core transaction statuses are PENDING, AUTHORIZED, CAPTURED, FAILED,
/// REVERSED and REFUNDED (core/transactions) — only CAPTURED is money received.
class MerchantPaymentEntry {
  final String id;
  final MerchantPaymentState state;
  final int amountMinor;
  final String currency;

  /// Merchant-written description, when there is one.
  final String? description;
  final DateTime createdAt;

  const MerchantPaymentEntry({
    required this.id,
    required this.state,
    required this.amountMinor,
    required this.currency,
    required this.createdAt,
    this.description,
  });

  bool get isReceived => state == MerchantPaymentState.received;

  /// Terminal without money received — the failure side of the success rate.
  /// A refund is not a failed payment: it was received first.
  bool get isUnsuccessful =>
      state == MerchantPaymentState.failed ||
      state == MerchantPaymentState.reversed;

  static MerchantPaymentState stateOfTransaction(String status) {
    switch (status.toUpperCase()) {
      case 'CAPTURED':
        return MerchantPaymentState.received;
      case 'PENDING':
      case 'AUTHORIZED':
        return MerchantPaymentState.pending;
      case 'FAILED':
        return MerchantPaymentState.failed;
      case 'REVERSED':
        return MerchantPaymentState.reversed;
      case 'REFUNDED':
        return MerchantPaymentState.refunded;
      default:
        return MerchantPaymentState.unknown;
    }
  }

  factory MerchantPaymentEntry.fromTransaction(MerchantTransaction tx) =>
      MerchantPaymentEntry(
        id: tx.id,
        state: stateOfTransaction(tx.status),
        amountMinor: tx.amountMinor,
        currency: tx.currency,
        description:
            (tx.description?.trim().isNotEmpty ?? false) ? tx.description : null,
        createdAt: tx.createdAt,
      );

  /// The status as the Business reads it.
  String get stateLabel => switch (state) {
        MerchantPaymentState.received => 'Pagamento recebido',
        MerchantPaymentState.pending => 'Pendente',
        MerchantPaymentState.failed => 'Falhou',
        MerchantPaymentState.reversed => 'Anulado',
        MerchantPaymentState.refunded => 'Reembolsado',
        MerchantPaymentState.unknown => 'Estado desconhecido',
      };

  /// The sign in front of the amount. Only money received carries one: a
  /// failed or voided payment moved nothing, and a refund row shows the amount
  /// that was received and then returned — never as a "−" debit.
  String get amountSign => isReceived ? '+' : '';
}
