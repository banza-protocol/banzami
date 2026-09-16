/// Business Receive Point (ADR-065). A Business prints ONE persistent, public QR;
/// scanning it resolves the payer-safe identity below, and the payer then mints a
/// FRESH Payment Session per payment. The QR is persistent; the session is not.
class BusinessReceivePointResolution {
  final String slug;

  /// The payee's PUBLIC identity — the name the Business presents and the @handle
  /// it owns. Never an account name, wallet id or Project name (payer-safe).
  final String displayName;
  final String handle;
  final String currency;
  final String status;
  final String environment;

  const BusinessReceivePointResolution({
    required this.slug,
    required this.displayName,
    required this.handle,
    required this.currency,
    required this.status,
    required this.environment,
  });

  bool get isActive => status == 'ACTIVE';

  factory BusinessReceivePointResolution.fromJson(Map<String, dynamic> json) =>
      BusinessReceivePointResolution(
        slug: json['slug'] as String,
        displayName: (json['display_name'] as String?) ?? '',
        handle: (json['handle'] as String?) ?? '',
        currency: (json['currency'] as String?) ?? 'AOA',
        status: (json['status'] as String?) ?? 'ACTIVE',
        environment: (json['environment'] as String?) ?? 'SANDBOX',
      );
}

/// A freshly minted Payment Session for a receive-point payment. It carries the
/// payment-link slug the payer settles against — the receive-point flow reuses the
/// existing payment-link pay path to move the money.
class MintedReceivePointSession {
  final String sessionId;
  final int? amountMinor;
  final String currency;
  final String status;

  /// The payment link the payer pays to settle this session. Empty only for a
  /// malformed response.
  final String paymentLinkSlug;
  final String payUrl;

  const MintedReceivePointSession({
    required this.sessionId,
    this.amountMinor,
    required this.currency,
    required this.status,
    required this.paymentLinkSlug,
    required this.payUrl,
  });

  factory MintedReceivePointSession.fromJson(Map<String, dynamic> json) =>
      MintedReceivePointSession(
        sessionId: json['session_id'] as String,
        amountMinor: json['amount_minor'] as int?,
        currency: (json['currency'] as String?) ?? 'AOA',
        status: (json['status'] as String?) ?? 'CREATED',
        paymentLinkSlug: (json['payment_link_slug'] as String?) ?? '',
        payUrl: (json['pay_url'] as String?) ?? '',
      );
}
