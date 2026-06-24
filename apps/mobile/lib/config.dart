/// Build-time configuration.
///
/// Production build (default):
///   flutter build ipa
///
/// Sandbox / TestFlight build:
///   flutter build ipa \
///     --dart-define=PUBLIC_API_URL=https://sandbox-api.banzami.com \
///     --dart-define=ENVIRONMENT=sandbox
abstract class AppConfig {
  /// Public API base URL. Canonical Banzami API host — no dedicated
  /// `consumer.*` subdomain (the public/consumer API is served under
  /// api.banzami.com; sandbox is sandbox-api.banzami.com).
  static const String publicApiUrl = String.fromEnvironment(
    'PUBLIC_API_URL',
    defaultValue: 'https://api.banzami.com',
  );

  /// Build environment: "sandbox" (TestFlight) or "production" (default).
  /// Sandbox points at sandbox-api.banzami.com — there is no "staging" host.
  static const String _environment = String.fromEnvironment(
    'ENVIRONMENT',
    defaultValue: 'production',
  );

  /// True for sandbox / TestFlight builds. Enables sandbox badge, sandbox fund, etc.
  static bool get isSandbox => _environment == 'sandbox';
}
