/// Build-time configuration.
///
/// Pass values via --dart-define at build time:
///   flutter run --dart-define=GATEWAY_URL=https://api.banzami.ao \
///               --dart-define=APP_API_KEY=bz_live_...
abstract class AppConfig {
  static const String gatewayUrl = String.fromEnvironment(
    'GATEWAY_URL',
    defaultValue: 'http://localhost:8080',
  );

  // Consumer-facing API key.  In production this is a restricted key that
  // only allows consumer endpoints (no merchant admin operations).
  static const String apiKey = String.fromEnvironment(
    'APP_API_KEY',
    defaultValue: 'bz_dev_consumer_key',
  );
}
