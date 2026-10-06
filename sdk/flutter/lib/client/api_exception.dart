/// Typed error returned by BanzamiClient when the gateway responds with 4xx/5xx.
class BanzamiApiException implements Exception {
  final int statusCode;
  final String code;
  final String message;

  /// The full decoded error body, so callers can read top-level extras the
  /// endpoint returns alongside code/message (e.g. remaining_attempts).
  final Map<String, dynamic> data;

  const BanzamiApiException({
    required this.statusCode,
    required this.code,
    required this.message,
    this.data = const {},
  });

  bool get isNotFound => statusCode == 404;
  bool get isConflict => statusCode == 409;
  bool get isUnprocessable => statusCode == 422;
  bool get isInsufficientFunds => code == 'INSUFFICIENT_FUNDS';
  bool get isHandleTaken => code == 'HANDLE_TAKEN';
  bool get isWalletNotFound => code == 'WALLET_NOT_FOUND';
  bool get isQrExpired => code == 'QR_EXPIRED';
  bool get isQrAlreadyUsed => code == 'QR_ALREADY_USED';

  /// Attempts remaining before PIN recovery is required, when the server includes
  /// it on a wrong-PIN login (trusted device). Null when not provided.
  int? get remainingAttempts {
    final v = data['remaining_attempts'];
    if (v is int) return v;
    if (v is num) return v.toInt();
    return null;
  }

  /// True when a wrong PIN has tripped the recovery requirement.
  bool get isPinRecoveryRequired => code == 'PIN_RECOVERY_REQUIRED';

  factory BanzamiApiException.fromJson(
      int statusCode, Map<String, dynamic> json) {
    return BanzamiApiException(
      statusCode: statusCode,
      code: json['code'] as String? ?? 'UNKNOWN',
      message: json['message'] as String? ?? 'Unknown error',
      data: json,
    );
  }

  @override
  String toString() => 'BanzamiApiException($statusCode, $code): $message';
}

/// Network-level failure — no HTTP response was received.
class BanzamiNetworkException implements Exception {
  final String message;
  const BanzamiNetworkException(this.message);
  @override
  String toString() => 'BanzamiNetworkException: $message';
}

/// The request left but no answer came back in time. Like any network
/// failure it says nothing about the outcome: a payment may have been made.
class BanzamiTimeoutException extends BanzamiNetworkException {
  const BanzamiTimeoutException(super.message);
  @override
  String toString() => 'BanzamiTimeoutException: $message';
}
