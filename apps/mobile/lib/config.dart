/// Build-time configuration.
///
/// Pass values via --dart-define at build time:
///   flutter run --dart-define=GATEWAY_URL=https://api.banzami.org \
///               --dart-define=APP_API_KEY=bz_live_...
abstract class AppConfig {
  /// Public API base URL (consumer-facing service, port 8083).
  /// Pass via --dart-define=PUBLIC_API_URL=https://api.banzami.org at build time.
  static const String publicApiUrl = String.fromEnvironment(
    'PUBLIC_API_URL',
    defaultValue: 'http://localhost:8083',
  );
}
