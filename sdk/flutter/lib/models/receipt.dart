/// The canonical receipt of a completed operation — the one the PDF and the
/// public verifier show. The operator derives it from the ledger's own records
/// (api-gateway service/receipt_semantics.go); the app renders it and never
/// reconstructs a party, a label or a reference on its own.
///
/// Four questions are kept apart: what the operation was ([operationKind]:
/// PAYMENT / P2P_TRANSFER), how it started ([channel]: PAYMENT_LINK / QR /
/// HANDLE), where the money came from ([fundingSource]: BANZAMI_BALANCE), and
/// the network (BANZA). "@banza" is how people are addressed, not a method.
class ReceiptParty {
  /// PERSON | BUSINESS
  final String kind;
  final String? displayName;
  final String? handle;

  const ReceiptParty({required this.kind, this.displayName, this.handle});

  factory ReceiptParty.fromJson(Map<String, dynamic>? json) => ReceiptParty(
        kind: (json?['kind'] as String?) ?? 'PERSON',
        displayName: _nonEmpty(json?['display_name'] as String?),
        handle: _nonEmpty(json?['handle'] as String?),
      );

  bool get isBusiness => kind == 'BUSINESS';

  /// How the payee is named on every surface: its @handle ("@doa") — a
  /// Business is paid at its public address, a person is their @handle. Only a
  /// Business with no handle falls back to its name.
  String get label {
    if (handle != null) return '@$handle';
    return displayName ?? '—';
  }
}

class Receipt {
  /// The canonical proof reference, e.g. BZM-BMJN-CFAF-00ZT-ADSF-P4N7-FB0T.
  /// The ONLY receipt reference — never a transaction id.
  final String? proofReference;
  final String? verificationUrl;
  final String operationKind;
  final String? channel;
  final String? fundingSource;
  final String status;
  final int amountMinor;
  final String currency;
  final ReceiptParty payer;
  final ReceiptParty payee;
  final String? merchantReference;
  final String? displayContext;
  final String? description;
  final DateTime? confirmedAt;
  final String environment;

  /// The operation's own id ("ID da operação"), never shown as a reference.
  final String? transactionId;

  const Receipt({
    this.proofReference,
    this.verificationUrl,
    required this.operationKind,
    this.channel,
    this.fundingSource,
    required this.status,
    required this.amountMinor,
    required this.currency,
    required this.payer,
    required this.payee,
    this.merchantReference,
    this.displayContext,
    this.description,
    this.confirmedAt,
    required this.environment,
    this.transactionId,
  });

  factory Receipt.fromJson(Map<String, dynamic> json) => Receipt(
        proofReference: _nonEmpty(json['proof_reference'] as String?),
        verificationUrl: _nonEmpty(json['verification_url'] as String?),
        operationKind: (json['operation_kind'] as String?) ?? '',
        channel: _nonEmpty(json['channel'] as String?),
        fundingSource: _nonEmpty(json['funding_source'] as String?),
        status: (json['status'] as String?) ?? '',
        amountMinor: (json['amount_minor'] as num?)?.toInt() ?? 0,
        currency: (json['currency'] as String?) ?? 'AOA',
        payer: ReceiptParty.fromJson(json['payer'] as Map<String, dynamic>?),
        payee: ReceiptParty.fromJson(json['payee'] as Map<String, dynamic>?),
        merchantReference: _nonEmpty(json['merchant_reference'] as String?),
        displayContext: _nonEmpty(json['display_context'] as String?),
        description: _nonEmpty(json['description'] as String?),
        confirmedAt: json['confirmed_at'] != null
            ? DateTime.parse(json['confirmed_at'] as String)
            : null,
        environment: (json['environment'] as String?) ?? '',
        transactionId: _nonEmpty(json['transaction_id'] as String?),
      );

  bool get isPayment => operationKind == 'PAYMENT';

  /// A receipt the screen may show: it says what the operation was and carries
  /// the proof reference. Anything less is not a receipt.
  bool get isComplete => operationKind.isNotEmpty && proofReference != null;

  /// "Pagamento" / "Transferência".
  String get operationLabel => switch (operationKind) {
        'PAYMENT' => 'Pagamento',
        'P2P_TRANSFER' => 'Transferência',
        _ => 'Operação',
      };

  /// "Link de pagamento" / "Código QR Banzami" / "Endereço @banza".
  String? get channelLabel => switch (channel) {
        'PAYMENT_LINK' => 'Link de pagamento',
        'QR' => 'Código QR Banzami',
        'HANDLE' => 'Endereço @banza',
        _ => null,
      };

  /// "Saldo Banzami".
  String? get fundingLabel =>
      fundingSource == 'BANZAMI_BALANCE' ? 'Saldo Banzami' : null;

  /// "Pagamento · Link de pagamento".
  String get operationLine =>
      channelLabel == null ? operationLabel : '$operationLabel · $channelLabel';

  /// A long SECURE_V1 reference shortened for display, keeping its start and
  /// end: BZM-BMJN-CFAF-…-FB0T. Copy/share always use [proofReference] whole.
  String? get shortReference {
    final r = proofReference;
    if (r == null) return null;
    final groups = r.split('-');
    if (groups.length <= 4) return r;
    return '${groups[0]}-${groups[1]}-${groups[2]}-…-${groups.last}';
  }
}

String? _nonEmpty(String? v) => (v == null || v.trim().isEmpty) ? null : v;
