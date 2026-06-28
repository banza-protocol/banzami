/// Official Banzami brand assets used in-app. Two sets:
///   • Banzami (consumer)  — `icon` / `logo` / `splash`   (assets/banzami/)
///   • Banzami Business    — `business*`                  (assets/business/)
/// Consumer surfaces use the Banzami set; merchant surfaces use the Business set.
///
/// Sandbox does NOT have its own branding — it reuses these official assets. The
/// only visual difference in Sandbox is the permanent yellow banner shown inside
/// the app (driven by AppConfig.isSandbox), not the brand assets.
abstract class BrandingAssets {
  static const String _base = 'assets/banzami';

  // Banzami (consumer)
  static String get icon => '$_base/icon.png';
  static String get logo => '$_base/logo.png';
  static String get splash => '$_base/splash.png';

  // Banzami Business (merchant) — used by every merchant surface.
  static const String _business = 'assets/business';
  static String get businessIcon => '$_business/business_icon.png';
  static String get businessLogo => '$_business/business_logo.png';
  static String get businessSplash => '$_business/business_splash.png';
}
