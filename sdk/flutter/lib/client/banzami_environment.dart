/// BanzamiEnvironment selects the data universe used for all API calls.
///
/// LIVE (production) and SANDBOX are fully isolated:
/// - Separate API key prefixes: `bz_live_` vs `bz_test_`
/// - Separate financial data — no shared ledger entries, wallets, or transactions
/// - Sandbox funds are virtual and NEVER reach real banking rails
///
/// Usage:
/// ```dart
/// final client = BanzamiClient(
///   apiKey:      'bz_test_...',
///   environment: BanzamiEnvironment.sandbox,
/// );
/// ```
enum BanzamiEnvironment {
  /// Production environment. Real money, real transactions, real payouts.
  /// Use `bz_live_` API keys.
  production,

  /// Fully isolated test environment. Virtual funds, simulated payments.
  /// Use `bz_test_` API keys. Safe for CI/CD and integration testing.
  sandbox;

  /// Default base URL for this environment when no explicit baseUrl is given.
  String get defaultBaseUrl {
    switch (this) {
      case BanzamiEnvironment.production:
        return 'https://api.banzami.com';
      case BanzamiEnvironment.sandbox:
        return 'https://sandbox-api.banzami.com';
    }
  }

  bool get isLive    => this == BanzamiEnvironment.production;
  bool get isSandbox => this == BanzamiEnvironment.sandbox;

  /// Wire-format value sent to / received from the API.
  String get apiValue {
    switch (this) {
      case BanzamiEnvironment.production:
        return 'LIVE';
      case BanzamiEnvironment.sandbox:
        return 'SANDBOX';
    }
  }

  /// Parses the wire-format value returned by the API.
  static BanzamiEnvironment fromApiValue(String value) {
    switch (value.toUpperCase()) {
      case 'SANDBOX':
        return BanzamiEnvironment.sandbox;
      default:
        return BanzamiEnvironment.production;
    }
  }
}
