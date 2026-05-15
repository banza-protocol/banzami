/// Build-time configuration.
///
/// Pass values via --dart-define at build time:
///   flutter run --dart-define=GATEWAY_URL=https://api.banzami.org \
///               --dart-define=PAY_BASE_URL=https://pay.banzami.org
abstract final class AppConfig {
  static const String gatewayUrl = String.fromEnvironment(
    'GATEWAY_URL',
    defaultValue: 'http://localhost:8080',
  );

  static const String payBaseUrl = String.fromEnvironment(
    'PAY_BASE_URL',
    defaultValue: 'https://pay.banzami.org',
  );
}
