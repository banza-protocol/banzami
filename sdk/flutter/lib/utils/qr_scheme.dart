/// Single source of truth for Banzami QR / deep-link URI schemes.
///
/// Generators MUST build links through these helpers, and the parser MUST derive
/// its accepted prefixes from these same constants. This is what prevents the
/// generator and parser from ever drifting again — the banza→banzami rename drift
/// that silently broke scan-to-pay (f765113a) is structurally impossible when
/// every emitter and the parser share this one definition.
///
/// Rules encoded here:
///  - emit ONLY the canonical `banzami` / `banzami-sandbox` schemes;
///  - accept legacy `banza` / `banza-sandbox` on READ only (QRs already printed);
///  - sandbox never emits a live scheme and live never emits a sandbox scheme.
library;

class BanzamiQrScheme {
  BanzamiQrScheme._();

  /// Canonical schemes — the only ones a generator may emit.
  static const live = 'banzami';
  static const sandbox = 'banzami-sandbox';

  /// Legacy schemes — accepted on READ only, never emitted.
  static const legacyLive = 'banza';
  static const legacySandbox = 'banza-sandbox';

  /// The canonical scheme for an environment.
  static String scheme(bool isSandbox) => isSandbox ? sandbox : live;

  // ── Builders — the ONLY supported way to produce a Banzami link ────────────

  /// `banzami:@handle` — a P2P handle address.
  static String handle(String handle, {required bool isSandbox}) =>
      '${scheme(isSandbox)}:@$handle';

  /// `banzami://pay?request=CODE` — a fixed-amount payment request.
  static String paymentRequest(String code, {required bool isSandbox}) =>
      '${scheme(isSandbox)}://pay?request=$code';

  /// `banzami://pay/link/SLUG` — a merchant payment link (Banzami Checkout).
  /// The environment is implicit in the resolving gateway, so there is no sandbox
  /// variant — must match the checkout-web SDK and the parser's `link` case.
  static String payLink(String slug) => '$live://pay/link/$slug';

  /// `banzami://pay/split/ID` — a split-payment session. Must match the core's
  /// emission (core/api/src/routes/splits.rs) and the parser's `split` case.
  static String split(String id) => '$live://pay/split/$id';

  // ── Prefixes the parser accepts (canonical + legacy). Longest/sandbox first
  //    so a sandbox QR is never matched as live. ───────────────────────────────

  /// Handle-QR prefixes: `<scheme>:@`.
  static const handlePrefixes = <String>[
    '$sandbox:@', // banzami-sandbox:@
    '$legacySandbox:@', // banza-sandbox:@
    '$live:@', // banzami:@
    '$legacyLive:@', // banza:@
  ];

  /// Deep-link scheme prefixes: `<scheme>://`.
  static const deepLinkPrefixes = <String>[
    '$live://', // banzami://
    '$sandbox://', // banzami-sandbox://
    '$legacyLive://', // banza://
    '$legacySandbox://', // banza-sandbox://
  ];

  /// Whether a raw string uses a sandbox scheme (canonical or legacy).
  static bool isSandboxScheme(String raw) => raw.contains('-sandbox:');
}
