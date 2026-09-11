import 'package:uuid/uuid.dart';

/// One idempotency key per user intent to move money.
///
/// A key minted per tap turns "the answer was lost, tap again" into a second
/// payment. The key is minted the first time an intent is submitted and reused
/// for every retry of that same intent — the server then answers the retry
/// with the original outcome instead of executing it again. It changes only
/// when the intent itself changes (another amount, another destination) or
/// after the intent completed.
class IdempotencyIntent {
  IdempotencyIntent({String Function()? mint})
      : _mint = mint ?? (() => const Uuid().v4());

  final String Function() _mint;
  String? _key;
  Object? _fingerprint;

  /// The key for the intent described by [fingerprint] — anything with value
  /// equality (a record of amount + destination is typical). The same
  /// fingerprint returns the same key until [complete] or [reset].
  String keyFor(Object? fingerprint) {
    if (_key == null || fingerprint != _fingerprint) {
      _key = _mint();
      _fingerprint = fingerprint;
    }
    return _key!;
  }

  /// The key in use, if an intent has been submitted and not completed.
  String? get current => _key;

  /// The intent succeeded — the next submission is a new intent.
  void complete() {
    _key = null;
    _fingerprint = null;
  }

  /// The user changed what they are asking for — forget the old key.
  void reset() => complete();
}
