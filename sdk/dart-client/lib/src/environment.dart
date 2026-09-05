/// Which Banzami universe a client talks to.
///
/// The two are fully isolated: separate data, separate keys, separate hosts.
/// A key carries its environment in its prefix, so a client can refuse a
/// mismatch before it makes a request rather than after.
enum BanzamiEnvironment {
  /// Development and testing. Virtual funds; nothing reaches a banking rail.
  sandbox,

  /// Production.
  ///
  /// Not usable yet: Banzami financial LIVE is not released, and a client that
  /// silently pointed at a live host would fail in a way that looks like a
  /// network problem. Constructing a live client throws with the reason.
  live;

  bool get isSandbox => this == BanzamiEnvironment.sandbox;
  bool get isLive => this == BanzamiEnvironment.live;

  /// The API origin for this environment.
  String get apiBaseUrl => switch (this) {
        BanzamiEnvironment.sandbox => 'https://sandbox-api.banzami.com',
        BanzamiEnvironment.live => 'https://api.banzami.com',
      };

  /// The hosted payer surface — where a payment link is opened.
  ///
  /// One origin serves both environments; which universe a slug belongs to is
  /// decided by the slug, not by the host.
  String get checkoutBaseUrl => 'https://pay.banzami.com';

  /// The publishable-key prefix this environment issues.
  String get publishableKeyPrefix => switch (this) {
        BanzamiEnvironment.sandbox => 'bz_test_pk_',
        BanzamiEnvironment.live => 'bz_live_pk_',
      };
}
