import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  CONSOLE_HOST,
  MARKETING_HOSTS,
  CANONICAL_DOCS_URL,
  isConsoleSubPath,
  isDocsPath,
  isLegacyConsolePath,
  marketingToConsoleUrl,
  legacyToClean,
  cleanToInternal,
} from '@/lib/console-routing';
import { contentSecurityPolicy } from '@/lib/csp';
import { NOT_A_REFERENCE_PATH, proofPagePath } from '@/lib/proof-ref';

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

  // The proof page answers only to its one spelling. The raw pathname (escapes
  // intact — req.url, not the decoded route params) must be /r/ + a canonical
  // reference; anything else renders the not-a-reference page, without a lookup
  // and without a redirect. The edge (infra/nginx/website.conf) applies the same
  // rule before Next, which is what stops Next's own trailing-slash redirect.
  const proofPath = proofPagePath(new URL(req.url).pathname);
  if (proofPath === NOT_A_REFERENCE_PATH) {
    const dest = url.clone();
    dest.pathname = NOT_A_REFERENCE_PATH;
    dest.search = '';
    return harden(NextResponse.rewrite(dest, { request: { headers: reqHeaders } }), nonce);
  }

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

  // Marketing hosts (banzami.com / www): the Console and the documentation are
  // canonical on the console host only.
  //
  // Consolidating docs was about a duplicated canonical URL. Consolidating the
  // Console is about a surface that cannot work here at all: developer-api
  // allows one credentialed CORS origin, so the OTP request from
  // banzami.com/developers/login failed preflight and the developer saw "Sem
  // ligação ao serviço" — a login page that looked complete and could never
  // authenticate anyone. /developers itself stays: it is the developer landing
  // page, and it is marketing.
  //
  // 308 preserves the method, and the query string is carried over so the
  // Console's own /verify?email=… navigation survives the hop.
  if (MARKETING_HOSTS.includes(host)) {
    if (isConsoleSubPath(url.pathname)) {
      const dest = new URL(marketingToConsoleUrl(url.pathname));
      dest.search = url.search;
      return NextResponse.redirect(dest, 308);
    }
    if (isDocsPath(url.pathname)) {
      return NextResponse.redirect(CANONICAL_DOCS_URL, 308);
    }
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
