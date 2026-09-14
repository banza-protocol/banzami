/**
 * What the README inside the published @banzami/sdk must not say.
 *
 * The README ships in the tarball and npm shows it on the package page; a
 * version cannot be edited after publish. 0.14.0 went out saying Live was
 * "for production", that publishable keys were "planned", and teaching
 * merchant-credential calls a project key cannot make. Each pattern here is a
 * sentence that was, or would be, false against the runtime.
 */
export const STALE_README_PATTERNS = [
  [/Live is for production/i, 'Live described as the production environment'],
  [/planned client-safe key/i, 'publishable keys described as planned'],
  [/Real Kwanza movement \(requires activation\)/i, 'Live described as activatable'],
  [/instant payment network/i, 'speed positioning'],
  [/merchantId:\s*'mch_/, 'Payment Links taught with a merchant id (a project key refuses a payee)'],
  [/createPayout\(|openDispute\(|createApiKey\('mch_/, 'merchant-credential calls in the tour'],
  [/\.\.\/\.\.\/docs\//, 'a relative repository link that is broken on npm'],
  [/not (yet )?published|do not (npm )?install|SDK (is )?unavailable/i, 'the SDK described as unpublished'],
  [/until the next (SDK )?release|use HTTP (for|until)/i, 'a deferral to HTTP'],
  [/\/v1\/business\/|applicationFeeBps|\/v2\//, 'a retired or non-existent API contract'],
  [/manual(ly)? approv|Candidate um Business|request (Sandbox )?access/i, 'a gated Sandbox'],
  [/\bpolling-only\b|poll(ing)? for (the )?status/i, 'polling where realtime exists'],
];

/** Required statements: the status line and the canonical docs link. */
export const REQUIRED_README_STATEMENTS = [
  [/Financial Live remains unavailable/, 'the Financial Live status'],
  [/Public Sandbox is available and fully self-service/, 'the Sandbox status'],
  [/https:\/\/developers\.banzami\.com\/docs/, 'a link to the canonical documentation'],
];

export function readmeFindings(text) {
  const stale = STALE_README_PATTERNS.filter(([re]) => re.test(text)).map(([, why]) => why);
  const missing = REQUIRED_README_STATEMENTS.filter(([re]) => !re.test(text)).map(([, why]) => why);
  return { stale, missing };
}
