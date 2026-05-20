/// BanzaEnvironment selects the data universe used for all API calls.
///
/// LIVE (production) and SANDBOX are fully isolated:
/// - Separate API key prefixes: `bz_live_` vs `bz_test_`
/// - Separate financial data — no shared ledger entries, wallets, or transactions
/// - Sandbox funds are virtual and NEVER reach real banking rails
///
/// Usage:
/// ```dart
/// final client = BanzaClient(
///   apiKey:      'bz_test_...',
///   environment: BanzaEnvironment.sandbox,
/// );
/// ```
enum BanzaEnvironment {
  /// Production environment. Real money, real transactions, real payouts.
  /// Use `bz_live_` API keys.
  production,

  /// Fully isolated test environment. Virtual funds, simulated payments.
  /// Use `bz_test_` API keys. Safe for CI/CD and integration testing.
  sandbox;

  /// Default base URL for this environment when no explicit baseUrl is given.
  String get defaultBaseUrl {
    switch (this) {
      case BanzaEnvironment.production:
        return 'https://api.banzami.org';
      case BanzaEnvironment.sandbox:
        return 'https://sandbox-api.banzami.org';
    }
  }

  bool get isLive    => this == BanzaEnvironment.production;
  bool get isSandbox => this == BanzaEnvironment.sandbox;

  /// Wire-format value sent to / received from the API.
  String get apiValue {
    switch (this) {
      case BanzaEnvironment.production:
        return 'LIVE';
      case BanzaEnvironment.sandbox:
        return 'SANDBOX';
    }
  }

  /// Parses the wire-format value returned by the API.
  static BanzaEnvironment fromApiValue(String value) {
    switch (value.toUpperCase()) {
      case 'SANDBOX':
        return BanzaEnvironment.sandbox;
      default:
        return BanzaEnvironment.production;
    }
  }
}
