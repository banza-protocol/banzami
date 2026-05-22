import 'config.dart';

abstract class BrandingAssets {
  static const String _live = 'assets/branding/live';
  static const String _sandbox = 'assets/branding/sandbox';

  static String get _base => AppConfig.isSandbox ? _sandbox : _live;

  static String get icon => '$_base/icon.png';
  static String get logo => '$_base/logo.png';
  static String get splash => '$_base/splash.png';
}
