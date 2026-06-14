/// Typed error returned by BanzamiClient when the gateway responds with 4xx/5xx.
class BanzamiApiException implements Exception {
  final int statusCode;
  final String code;
  final String message;

  const BanzamiApiException({
    required this.statusCode,
    required this.code,
    required this.message,
  });

  bool get isNotFound         => statusCode == 404;
  bool get isConflict         => statusCode == 409;
  bool get isUnprocessable    => statusCode == 422;
  bool get isInsufficientFunds => code == 'INSUFFICIENT_FUNDS';
  bool get isHandleTaken      => code == 'HANDLE_TAKEN';
  bool get isWalletNotFound   => code == 'WALLET_NOT_FOUND';
  bool get isQrExpired        => code == 'QR_EXPIRED';
  bool get isQrAlreadyUsed    => code == 'QR_ALREADY_USED';

  factory BanzamiApiException.fromJson(int statusCode, Map<String, dynamic> json) {
    return BanzamiApiException(
      statusCode: statusCode,
      code:       json['code']    as String? ?? 'UNKNOWN',
      message:    json['message'] as String? ?? 'Unknown error',
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
