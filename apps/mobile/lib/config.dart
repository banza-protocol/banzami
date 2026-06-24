/// Build-time configuration.
///
/// Production build (default):
///   flutter build ipa
///
/// Staging / TestFlight build:
///   flutter build ipa \
///     --dart-define=PUBLIC_API_URL=https://staging.banzami.com \
///     --dart-define=ENVIRONMENT=sandbox
abstract class AppConfig {
  /// Public API base URL (consumer-facing service, port 8083).
  static const String publicApiUrl = String.fromEnvironment(
    'PUBLIC_API_URL',
    defaultValue: 'https://consumer.banzami.com',
  );

  /// Build environment: "sandbox" (staging / TestFlight) or "production" (default).
  static const String _environment = String.fromEnvironment(
    'ENVIRONMENT',
    defaultValue: 'production',
  );

  /// True for staging / TestFlight builds. Enables sandbox badge, sandbox fund, etc.
  static bool get isSandbox => _environment == 'sandbox';
}
