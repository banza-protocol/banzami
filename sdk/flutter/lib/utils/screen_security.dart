import 'package:flutter/services.dart';

/// Dart-side wrapper for the banza/screen_security platform channels.
///
/// Android: MethodChannel `setSecure` maps to FLAG_SECURE.
/// iOS: MethodChannel `setSecure` is a no-op; isCaptured state is delivered
///      via EventChannel `banza/capture_state`.
class BanzamiScreenSecurity {
  static const _methodCh = MethodChannel('banza/screen_security');
  static const _eventCh  = EventChannel('banza/capture_state');

  // Cached broadcast stream — avoids registering multiple native listeners when
  // both captureState and screenshotTaken are subscribed simultaneously.
  static Stream<dynamic>? _raw;
  static Stream<dynamic> get _rawStream {
    _raw ??= _eventCh.receiveBroadcastStream().asBroadcastStream();
    return _raw!;
  }

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
  static Stream<bool> get captureState => _rawStream
      .where((e) => e is bool)
      .map((e) => e as bool);

  /// Stream that emits once per screenshot detection (iOS only).
  /// The native layer fires UIApplication.userDidTakeScreenshotNotification
  /// and sends the string sentinel "screenshot" — distinct from Bool events.
  static Stream<void> get screenshotTaken => _rawStream
      .where((e) => e is String && e == 'screenshot')
      .map((_) {});
}
