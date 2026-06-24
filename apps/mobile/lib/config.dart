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

  /// Classify an API base URL by environment, using the EXACT host:
  ///   api.banzami.com          → false (production / live)
  ///   sandbox-api.banzami.com  → true  (sandbox)
  ///   anything else            → null  (unrecognised — e.g. a local override)
  /// The ".com" suffix alone never implies production: pay.banzami.com is a
  /// pay host, not an API host, and must not drive this decision.
  static bool? apiHostIsSandbox(String url) {
    final host = Uri.tryParse(url)?.host ?? '';
    if (host == 'sandbox-api.banzami.com') return true;
    if (host == 'api.banzami.com') return false;
    return null;
  }

  /// Pure mismatch check (testable): true when a *recognised* API host
  /// disagrees with the build environment — sandbox build → production API, or
  /// live build → sandbox API. Unrecognised hosts never count as a mismatch.
  static bool isEnvMismatch({required bool buildIsSandbox, required String apiUrl}) {
    final urlIsSandbox = apiHostIsSandbox(apiUrl);
    return urlIsSandbox != null && urlIsSandbox != buildIsSandbox;
  }

  /// True when *this* build's environment disagrees with its configured API host.
  static bool get apiEnvMismatch =>
      isEnvMismatch(buildIsSandbox: isSandbox, apiUrl: publicApiUrl);
}
