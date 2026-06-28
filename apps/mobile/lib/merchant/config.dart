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

  /// Pre-protocol prototype flag — **disabled by default**.
  ///
  /// "Cobrança dividida" (split charge) anticipates BANZA Collections
  /// (BANZA ADR-036, *Proposed*) but is NOT an official feature: there is no
  /// `Collection` concept in the protocol yet, so the app-side flow only groups
  /// independent payment links visually. Per BANZA ADR-035 (protocol-first) a
  /// structural concept must originate in the protocol, then operator → SDK →
  /// app. The code is kept as a prototype behind this flag; see Banzami ADR-019.
  /// Do not enable in production until Collections is implemented protocol-first.
  static const bool splitChargeEnabled = bool.fromEnvironment(
    'SPLIT_CHARGE_ENABLED',
    defaultValue: false,
  );
}
