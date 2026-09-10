/**
 * The Content-Security-Policy for banzami.com and developers.banzami.com.
 *
 * This lives outside middleware.ts so it can be tested. That is not tidiness:
 * the first version of this policy shipped to production with an incomplete
 * connect-src and broke the Console's own sign-in, because
 * developer-api.banzami.com is only ever built from an environment variable and
 * never appears as a literal anywhere in the source. Searching for origins found
 * four of them and missed the one that mattered.
 *
 * So the allowed origins are declared here, next to a test that reads the same
 * defaults out of lib/api.ts and lib/developer-api.ts and fails if either is
 * missing from the policy.
 */

/**
 * Just the shape this module reads. Not NodeJS.ProcessEnv, which requires
 * NODE_ENV and so cannot be satisfied by a small literal in a test.
 */
type EnvLike = Record<string, string | undefined>;

/** Origin of a URL, or '' if it is unset or unparseable. */
function originOf(raw: string | undefined): string {
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
}

/**
 * Every origin the browser is allowed to call.
 *
 * The two literals are the defaults compiled into lib/api.ts and
 * lib/developer-api.ts. The two environment reads cover a deployment that points
 * the browser somewhere else — a preview, or a different Sandbox — because an
 * override that is not in the policy is an app that cannot reach its own API.
 */
/** R2's S3 API hosts: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. */
export const KYB_UPLOAD_ORIGIN = 'https://*.r2.cloudflarestorage.com';

export function connectOrigins(env: EnvLike = process.env): string[] {
  return [
    "'self'",
    'https://api.banzami.com', // lib/api.ts default
    'https://sandbox-api.banzami.com', // the Sandbox rail
    'https://developer-api.banzami.com', // lib/developer-api.ts default — the Console's own API
    // Business documents are PUT straight to KYB storage with the short-lived
    // signed URL the Gateway issues (docs/ops/KYB_R2_SETUP.md). The account id
    // in that host is configuration the browser never sees, so the policy names
    // R2's S3 host family, not one account.
    KYB_UPLOAD_ORIGIN,
    originOf(env.NEXT_PUBLIC_BANZAMI_API_URL),
    originOf(env.NEXT_PUBLIC_DEVELOPER_API_URL),
  ].filter(Boolean);
}

/**
 * Build the policy for one request.
 *
 * `script-src` takes a nonce plus strict-dynamic: there is no inline <script>
 * and no dangerouslySetInnerHTML in this app, so Next's own bootstrap scripts
 * are the only inline ones and they carry the nonce.
 *
 * `style-src` needs 'unsafe-inline' because the site styles through React
 * `style={{…}}` props, which CSP counts as inline styles, and because the Google
 * Fonts stylesheet is a cross-origin <link>.
 *
 * `frame-ancestors 'none'` duplicates X-Frame-Options for browsers that honour
 * the CSP form; both are kept deliberately.
 */
export function contentSecurityPolicy(
  nonce: string,
  env: EnvLike = process.env,
): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src ${connectOrigins(env).join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}
