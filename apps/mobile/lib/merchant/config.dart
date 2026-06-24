/// Build-time configuration.
///
/// Pass values via --dart-define at build time:
///   flutter run --dart-define=GATEWAY_URL=https://api.banzami.com \
///               --dart-define=PAY_BASE_URL=https://pay.banzami.com
abstract final class AppConfig {
  static const String gatewayUrl = String.fromEnvironment(
    'GATEWAY_URL',
    defaultValue: 'https://api.banzami.com',
  );

  static const String payBaseUrl = String.fromEnvironment(
    'PAY_BASE_URL',
    defaultValue: 'https://pay.banzami.com',
  );
}
