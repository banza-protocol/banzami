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

  /// The public marketing site. The canonical Business Sandbox application form
  /// (candidatura) is served there — it is NOT reimplemented in the app. The
  /// welcome screen's "Criar conta Business" opens `$siteBaseUrl/candidatura`.
  static const String siteBaseUrl = String.fromEnvironment(
    'SITE_BASE_URL',
    defaultValue: 'https://banzami.com',
  );

  /// The canonical Business Sandbox application (candidatura) URL. Data-minimized
  /// Sandbox onboarding — never LIVE/KYB, never real-money operations. The route
  /// lives under /comerciantes on the marketing site (lib/marketing/nav.ts).
  static String get businessApplicationUrl => '$siteBaseUrl/comerciantes/candidatura';

  /// "Cobrança dividida" (split charge) — **enabled by default**.
  ///
  /// Backed by BANZA Collections (BANZA ADR-016, *Accepted*): a real protocol
  /// financial object created via the operator + SDK
  /// (`createEqualSplitCollection`). This satisfies protocol-first (BANZA
  /// ADR-003) — the concept originates in the protocol, then operator → SDK →
  /// app. The flag remains only to allow hiding the mode in the UI if needed.
  static const bool splitChargeEnabled = bool.fromEnvironment(
    'SPLIT_CHARGE_ENABLED',
    defaultValue: true,
  );
}
