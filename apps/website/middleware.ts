import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  CONSOLE_HOST,
  MARKETING_HOSTS,
  CANONICAL_DOCS_URL,
  isDocsPath,
  isLegacyConsolePath,
  legacyToClean,
  cleanToInternal,
} from '@/lib/console-routing';

// Host-based routing for the Developer Console, plus the response security
// headers for both hosts this app serves.
//
// The same Next app serves both banzami.com (marketing) and
// developers.banzami.com (the console). On the console host the console lives
// at the site root, but the pages are physically implemented under
// app/developers/*. This middleware:
//   1. permanently redirects (308) the legacy /developers/* URLs to their clean
//      host-root equivalents,
//   2. internally rewrites the clean host-root URLs to the app/developers/*
//      pages (so the browser keeps the clean URL), and
//   3. attaches a per-request Content-Security-Policy to every document.
//
// It only ever rewrites/redirects the pathname; query strings are preserved and
// no session/OTP/CSRF/API-key data is read or added here. Backend routing,
// developer-api, CORS, cookies and CSRF are entirely unaffected.

// ---------------------------------------------------------------------------
// Content-Security-Policy
// ---------------------------------------------------------------------------
//
// next.config.mjs called this "a static marketing site (no inline scripts
// beyond Next's own framework bundles), so no per-request CSP nonce middleware
// is needed" and shipped no CSP at all. That description stopped being true when
// the Developer Console moved onto developers.banzami.com, which this same app
// serves: the Console creates API keys and reveals a secret key once, in the
// page. pay.banzami.com and the dashboard both carry a nonce CSP; the host that
// shows a plaintext credential carried none.
//
// The policy is derived from what the app actually loads, not from a template:
//
//   script-src   'self' + nonce + strict-dynamic — there is no inline <script>
//                and no dangerouslySetInnerHTML anywhere in the source; Next's
//                own bootstrap scripts are the only inline ones and they take
//                the nonce.
//   style-src    needs 'unsafe-inline': the site styles heavily through React
//                `style={{…}}` props, which CSP treats as inline styles, and
//                the Google Fonts stylesheet is a cross-origin <link>.
//   font-src     fonts.gstatic.com, where that stylesheet's faces live.
//   connect-src  the two Banzami API origins the Console and docs call.
//   frame-ancestors 'none' duplicates X-Frame-Options for browsers that honour
//                the CSP form; both are kept deliberately.
function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://api.banzami.com https://sandbox-api.banzami.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'object-src \'none\'',
  ].join('; ');
}

/** Attach the response security headers that are not static enough for next.config. */
function harden(res: NextResponse, nonce: string): NextResponse {
  res.headers.set('Content-Security-Policy', contentSecurityPolicy(nonce));
  return res;
}

export function middleware(req: NextRequest): NextResponse {
  const host = (req.headers.get('host') ?? '').split(':')[0].toLowerCase();
  const url = req.nextUrl;

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  // Next stamps this nonce onto the framework's own inline scripts, which is
  // what makes 'strict-dynamic' usable instead of 'unsafe-inline'.
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set('x-nonce', nonce);

  // Console host: legacy /developers/* → clean (308); clean host-root → rewrite.
  if (host === CONSOLE_HOST) {
    // 1) Legacy prefixed console URL → 308 permanent redirect to the clean URL.
    if (isLegacyConsolePath(url.pathname)) {
      const dest = url.clone();
      dest.pathname = legacyToClean(url.pathname); // query string preserved by clone()
      return NextResponse.redirect(dest, 308);
    }
    // 2) Clean host-root URL → internal rewrite to the physical console page.
    const dest = url.clone();
    dest.pathname = cleanToInternal(url.pathname);
    return harden(NextResponse.rewrite(dest, { request: { headers: reqHeaders } }), nonce);
  }

  // Marketing hosts (banzami.com / www): the documentation is canonical on the
  // console host only. Consolidate any docs URL (clean /docs or legacy
  // /developers/docs) to https://developers.banzami.com/docs with a 308, so the
  // marketing host never renders a duplicated / second-canonical docs experience.
  // The browser preserves the original URL fragment (e.g. #reembolsos). Every
  // other marketing path is untouched.
  if (MARKETING_HOSTS.includes(host) && isDocsPath(url.pathname)) {
    return NextResponse.redirect(CANONICAL_DOCS_URL, 308);
  }

  // Every other host/path renders normally — with the policy attached.
  return harden(NextResponse.next({ request: { headers: reqHeaders } }), nonce);
}

export const config = {
  // Run on document/navigation paths only. Exclude Next internals and any path
  // with a file extension (static assets, favicon, manifest, sitemap, images).
  // RSC navigations (?_rsc=) hit the same extensionless pathname and are handled.
  matcher: ['/((?!_next/|.*\\.[^/]+$).*)'],
};
