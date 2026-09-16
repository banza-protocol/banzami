// The facts every public Banzami page states about what is available today.
//
// Pages render these instead of writing their own sentence about the Sandbox,
// Financial Live, the app or the API version, so a change in the product is one
// edit here — and tools/check-public-site-truth.mjs fails the build when this
// file disagrees with the runtime, or when a page states the same fact in its
// own words and gets it wrong (PUBLIC-TRUTH-001).

export const PUBLIC_TRUTH = {
  /** The only public API version. There is no /v2. */
  apiVersion: 'v1',
  sandbox: {
    status: 'AVAILABLE' as const,
    name: 'Sandbox pública',
    state: 'Disponível',
    summary: 'Totalmente self-service, sem aprovação de um operador Banzami. Dinheiro fictício.',
  },
  live: {
    status: 'NOT_READY' as const,
    name: 'Financial Live',
    state: 'Indisponível',
    summary:
      'O Financial Live permanece indisponível e sujeito às aprovações regulatórias, contratuais e operacionais aplicáveis.',
    // Concise variant for dense surfaces (e.g. the homepage hero) — same truth,
    // fewer words. Still says Live is unavailable and gates on approvals.
    summaryShort:
      'O Financial Live permanece indisponível, sujeito às aprovações aplicáveis.',
  },
  /** The Banzami app is not in the App Store or Google Play. */
  appInStores: false,
  /**
   * How the mobile apps are actually distributed today (APP-BETA-001). They are
   * functional and given to invited testers through TestFlight (iOS) and Google
   * Play testing (Android) — a private beta, not a public store listing. Status
   * is BETA_TESTING; both apps are on both platforms. This is the single fact
   * pages and the beta program state, so the product status never contradicts
   * itself across surfaces.
   */
  appBeta: {
    status: 'BETA_TESTING' as const,
    ios: 'TestFlight',
    android: 'Google Play testing',
    inviteOnly: true,
    apps: ['App Banzami', 'App Banzami Business'] as const,
  },
  /** Key prefixes the runtime issues in the Sandbox. */
  keyPrefixes: { secret: 'bz_test_sk_', publishable: 'bz_test_pk_' },
  docsUrl: 'https://developers.banzami.com/docs',
  consoleUrl: 'https://developers.banzami.com/login',
} as const;
