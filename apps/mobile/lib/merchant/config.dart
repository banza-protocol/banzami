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

  /// "Cobrança dividida" (split charge) — **enabled by default**.
  ///
  /// Backed by BANZA Collections (BANZA ADR-036, *Accepted*): a real protocol
  /// financial object created via the operator + SDK
  /// (`createEqualSplitCollection`). This satisfies protocol-first (BANZA
  /// ADR-035) — the concept originates in the protocol, then operator → SDK →
  /// app. The flag remains only to allow hiding the mode in the UI if needed.
  static const bool splitChargeEnabled = bool.fromEnvironment(
    'SPLIT_CHARGE_ENABLED',
    defaultValue: true,
  );
}
