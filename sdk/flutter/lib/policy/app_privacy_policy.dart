/// The ONE product policy for App Banzami's UI privacy protections: the
/// background privacy shield, screen-capture blocking, and the foreground
/// (background-triggered) relock.
///
/// The platform adapters — the app lifecycle guard, the receipt screen, the
/// native FLAG_SECURE channel — read this single source instead of scattering
/// per-screen `kIsWeb` / `Platform.isX` / `sandbox` checks
/// (APP_PRIVACY_POLICY_SOURCE_UNIVERSE=ONE).
///
/// This governs privacy / anti-capture UX ONLY. It is not authentication:
/// login, PIN, server sessions, session expiry, revocation and logout are
/// enforced independently and are unaffected by these flags. Turning a shield
/// off never falsifies authentication state.
class AppPrivacyPolicy {
  const AppPrivacyPolicy({
    required this.backgroundPrivacyShieldEnabled,
    required this.screenCaptureProtectionEnabled,
    required this.foregroundRelockEnabled,
  });

  /// Cover app content when the app is backgrounded / loses focus — the app
  /// switcher snapshot, a hidden browser tab, the "Banzami protegido" overlay.
  /// Losing focus is NOT a session event.
  final bool backgroundPrivacyShieldEnabled;

  /// Ask the OS to block screenshots / screen recording where it can
  /// (Android FLAG_SECURE) and warn on capture where it cannot (iOS).
  final bool screenCaptureProtectionEnabled;

  /// Require re-authentication (PIN) purely because the app returned from the
  /// background, regardless of whether the session is still valid. This is
  /// distinct from the cold-start PIN and from session-expiry re-auth, which
  /// are owned elsewhere and stay enforced.
  final bool foregroundRelockEnabled;

  /// Current Public Sandbox / Beta policy: every protection OFF.
  ///
  /// Sandbox value is fictitious; screenshots and recording are useful for QA,
  /// bug reports, tester feedback and docs, and backgrounding the app is not a
  /// security event — a still-valid session simply resumes. Real authentication
  /// (login / PIN / server session / expiry / revocation / logout) is unchanged.
  static const AppPrivacyPolicy sandbox = AppPrivacyPolicy(
    backgroundPrivacyShieldEnabled: false,
    screenCaptureProtectionEnabled: false,
    foregroundRelockEnabled: false,
  );

  /// The active policy. Defaults to [sandbox]; an app sets it at startup for its
  /// environment. Financial Live is a FUTURE decision (NOT READY, fail closed):
  /// it is deliberately not defined or enabled here, so nothing turns these
  /// protections on today — but the capability to do so is retained.
  static AppPrivacyPolicy active = sandbox;
}
