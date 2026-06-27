/// Official Banzami brand assets used in-app (logo/icon on splash, login,
/// receipts, notifications). There is a single official set: Banzami.
///
/// Sandbox does NOT have its own branding — it reuses the official assets. The
/// only visual difference in Sandbox is the permanent yellow banner shown inside
/// the app (driven by AppConfig.isSandbox), not the brand assets.
abstract class BrandingAssets {
  static const String _base = 'assets/banzami';

  static String get icon => '$_base/icon.png';
  static String get logo => '$_base/logo.png';
  static String get splash => '$_base/splash.png';
}
