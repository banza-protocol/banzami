/// Base for everything this package throws.
///
/// Typed rather than string-matched: an app deciding whether to retry, ask the
/// user to try again, or report a bug should not have to read a message.
sealed class BanzamiException implements Exception {
  const BanzamiException(this.message);
  final String message;

  @override
  String toString() => '$runtimeType: $message';
}

/// The client was constructed wrongly — a secret key, a mismatched environment,
/// a live client before live exists. Thrown before any network call.
class BanzamiConfigException extends BanzamiException {
  const BanzamiConfigException(super.message);
}

/// The key was rejected, or the operation needs authority this key does not
/// have. A publishable key cannot move money; that refusal arrives here.
class BanzamiAuthException extends BanzamiException {
  const BanzamiAuthException(super.message, {this.status});
  final int? status;
}

/// The resource does not exist, or is not this caller's to see. The operator
/// answers those two the same way on purpose, so this exception cannot tell
/// them apart either.
class BanzamiNotFoundException extends BanzamiException {
  const BanzamiNotFoundException(super.message);
}

/// The payment exists but is not in a state the operation allows — already
/// paid, cancelled, expired.
class BanzamiPaymentStateException extends BanzamiException {
  const BanzamiPaymentStateException(super.message, {this.status});
  final String? status;
}

/// Too many requests. Back off.
class BanzamiRateLimitException extends BanzamiException {
  const BanzamiRateLimitException(super.message);
}

/// The request never got an answer: no connectivity, a timeout, a DNS failure.
class BanzamiNetworkException extends BanzamiException {
  const BanzamiNetworkException(super.message);
}

/// The operator failed. Not the caller's mistake, and usually worth retrying.
class BanzamiServerException extends BanzamiException {
  const BanzamiServerException(super.message, {this.status});
  final int? status;
}
