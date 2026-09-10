/// A renewed access token: what a [BanzamiClient] needs to keep sending
/// requests after its session token expired or was refused.
///
/// Returned by the app's `refreshSession` hook. `null` from that hook means the
/// session has ENDED (the server refused the renewal); a thrown error means the
/// renewal could not be attempted (outage, no network) and says nothing about
/// the session.
class RenewedSession {
  /// The new access token (a merchant JWT).
  final String token;

  /// When [token] expires.
  final DateTime expiresAt;

  const RenewedSession({required this.token, required this.expiresAt});
}

/// What Banzami issues when a Business App signs in (`POST
/// /v1/merchant/auth/token`) or renews its session (`POST
/// /v1/merchant/auth/refresh`).
///
/// The access [token] lives minutes; the [refreshToken] renews it and is
/// single-use: every renewal returns a NEW refresh token and spends the one
/// presented. Presenting a spent refresh token again ends the whole sign-in, so
/// the app must persist [refreshToken] before it uses [token].
///
/// Neither token is for display and neither may be logged.
class MerchantAuthTokens extends RenewedSession {
  /// 'LIVE' | 'SANDBOX' — the environment the session belongs to.
  final String environment;

  /// Always 'Bearer'.
  final String tokenType;

  /// The rotating refresh token. Null only when talking to a gateway that
  /// predates renewable sessions.
  final String? refreshToken;

  /// When [refreshToken] stops being accepted (at most 30 days after sign-in).
  final DateTime? refreshExpiresAt;

  const MerchantAuthTokens({
    required super.token,
    required super.expiresAt,
    required this.environment,
    this.tokenType = 'Bearer',
    this.refreshToken,
    this.refreshExpiresAt,
  });

  /// Parses the sign-in / renewal response. Throws [FormatException] when the
  /// access token is missing — a body without one is not a session.
  factory MerchantAuthTokens.fromJson(Map<String, dynamic> json) {
    final token = json['token'];
    if (token is! String || token.isEmpty) {
      throw const FormatException('session response carries no access token');
    }
    final refresh = json['refresh_token'];
    return MerchantAuthTokens(
      token: token,
      expiresAt: _parseTime(json['expires_at']) ??
          // A gateway that omits the expiry: assume the current access TTL,
          // so the client renews early rather than sending a dead token.
          DateTime.now().add(const Duration(minutes: 15)),
      environment: (json['environment'] as String?) ?? 'LIVE',
      tokenType: (json['token_type'] as String?) ?? 'Bearer',
      refreshToken: (refresh is String && refresh.isNotEmpty) ? refresh : null,
      refreshExpiresAt: _parseTime(json['refresh_expires_at']),
    );
  }

  static DateTime? _parseTime(Object? v) =>
      v is String && v.isNotEmpty ? DateTime.tryParse(v) : null;

  @override
  String toString() =>
      'MerchantAuthTokens(environment: $environment, expiresAt: $expiresAt, '
      'refreshExpiresAt: $refreshExpiresAt)'; // never the tokens themselves
}
