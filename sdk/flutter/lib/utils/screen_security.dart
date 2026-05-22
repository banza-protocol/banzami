import 'package:flutter/services.dart';

/// Dart-side wrapper for the banza/screen_security platform channels.
///
/// Android: MethodChannel `setSecure` maps to FLAG_SECURE.
/// iOS: MethodChannel `setSecure` is a no-op; isCaptured state is delivered
///      via EventChannel `banza/capture_state`.
class BanzaScreenSecurity {
  static const _methodCh = MethodChannel('banza/screen_security');
  static const _eventCh  = EventChannel('banza/capture_state');

  /// Enable or disable OS-level screen capture protection.
  /// Best-effort — swallows all platform errors (including test environments).
  static Future<void> setSecure(bool secure) async {
    try {
      await _methodCh.invokeMethod<void>('setSecure', secure);
    } catch (_) {}
  }

  /// Stream of isCaptured state changes (iOS only).
  /// Emits `true` when the screen is being mirrored or recorded.
  /// On Android, FLAG_SECURE prevents capture silently — no stream events.
  static Stream<bool> get captureState => _eventCh
      .receiveBroadcastStream()
      .where((e) => e is bool)
      .map((e) => e as bool);
}
