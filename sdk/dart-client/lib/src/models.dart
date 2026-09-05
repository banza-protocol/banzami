/// A payment as the PAYER may see it.
///
/// This is the whole public projection: what is being paid, to whom by display
/// name, and whether it is still payable. It deliberately carries no merchant
/// id, wallet id or account id — a payer-facing object that named the
/// recipient's internal resources would hand every payer a handle onto them.
class BanzamiCheckout {
  const BanzamiCheckout({
    required this.slug,
    required this.merchantName,
    required this.currency,
    required this.status,
    this.amountMinor,
    this.description,
    this.expiresAt,
    this.paidAt,
  });

  /// The public identifier in the checkout URL.
  final String slug;

  /// Display name of who is being paid. A name, never an identifier.
  final String merchantName;

  /// Amount in MINOR units (AOA). Null for an open-amount payment, where the
  /// payer chooses. Integer only — money is never a double here.
  final int? amountMinor;

  final String currency;
  final String? description;

  /// `ACTIVE`, `USED`, `EXPIRED` or `CANCELLED`.
  final String status;

  final DateTime? expiresAt;
  final DateTime? paidAt;

  bool get isPayable => status == 'ACTIVE';
  bool get isPaid => status == 'USED' || paidAt != null;

  factory BanzamiCheckout.fromJson(Map<String, dynamic> json) =>
      BanzamiCheckout(
        slug: json['slug'] as String,
        merchantName: (json['merchant_name'] as String?) ?? '',
        amountMinor: json['amount_minor'] as int?,
        currency: (json['currency'] as String?) ?? 'AOA',
        description: json['description'] as String?,
        status: (json['status'] as String?) ?? 'ACTIVE',
        expiresAt: _date(json['expires_at']),
        paidAt: _date(json['paid_at']),
      );

  static DateTime? _date(Object? v) =>
      v is String && v.isNotEmpty ? DateTime.tryParse(v) : null;

  @override
  String toString() =>
      'BanzamiCheckout(slug: $slug, status: $status, amountMinor: $amountMinor $currency)';
}

/// Whether a payment has been settled. The smallest possible answer, because
/// it is the one a client polls.
class BanzamiCheckoutStatus {
  const BanzamiCheckoutStatus({required this.paid});
  final bool paid;

  factory BanzamiCheckoutStatus.fromJson(Map<String, dynamic> json) =>
      BanzamiCheckoutStatus(paid: json['paid'] == true);

  @override
  String toString() => 'BanzamiCheckoutStatus(paid: $paid)';
}

/// What a publishable key is, as the operator sees it. Useful for a startup
/// check: the wrong key or the wrong environment shows up here rather than as a
/// confusing failure three screens later.
class BanzamiKeyIdentity {
  const BanzamiKeyIdentity({
    required this.environment,
    required this.project,
    required this.scopes,
    required this.keyStatus,
  });

  final String environment;
  final String project;
  final List<String> scopes;
  final String keyStatus;

  bool get isActive => keyStatus.toUpperCase() == 'ACTIVE';

  factory BanzamiKeyIdentity.fromJson(Map<String, dynamic> json) =>
      BanzamiKeyIdentity(
        environment: (json['environment'] as String?) ?? '',
        project: (json['project'] as String?) ?? '',
        scopes:
            ((json['scopes'] as List?) ?? const []).map((e) => '$e').toList(),
        keyStatus: (json['key_status'] as String?) ?? '',
      );

  @override
  String toString() =>
      'BanzamiKeyIdentity(environment: $environment, project: $project, keyStatus: $keyStatus)';
}

/// A @banza destination, confirmed to exist. Handle and display name only —
/// enough to show a payer who they are about to pay, and not a directory of
/// strangers' accounts.
class BanzamiHandle {
  const BanzamiHandle({required this.handle, required this.displayName});
  final String handle;
  final String displayName;

  factory BanzamiHandle.fromJson(Map<String, dynamic> json) => BanzamiHandle(
        handle: (json['handle'] as String?) ?? '',
        displayName: (json['display_name'] as String?) ?? '',
      );

  @override
  String toString() => 'BanzamiHandle(@$handle, $displayName)';
}
