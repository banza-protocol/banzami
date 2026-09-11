import { NextRequest, NextResponse } from 'next/server';

// Origin of the API this app talks to, normalised to scheme+host so it is a
// valid CSP source expression.
const GATEWAY_ORIGIN = (() => {
  const raw = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'https://api.banzami.com';
  try { return new URL(raw).origin; } catch { return 'https://api.banzami.com'; }
})();

export function middleware(request: NextRequest) {
  // Generate a cryptographically random nonce for this request.
  // Next.js App Router reads x-nonce from the incoming request headers
  // and stamps it onto every inline <script> it generates (RSC flush
  // scripts, hydration bootstrap, etc.), so the browser can verify them
  // against the Content-Security-Policy nonce directive.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const csp = [
    "default-src 'self'",
    // 'strict-dynamic' trusts scripts dynamically created by a nonce'd script,
    // which covers Next.js chunk loading. The nonce covers inline scripts.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // The gateway origin is configuration, not a constant. Hard-coding
    // api.banzami.com meant that pointing this app at any other stack — the
    // Sandbox one, say — left every client fetch (status polling, the platform
    // badge) blocked by CSP, with the page rendering perfectly and simply never
    // updating. Derived from the same value the app actually calls.
    `connect-src 'self' ${GATEWAY_ORIGIN}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  // Forward the nonce to the RSC render pipeline via a request header.
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set('x-nonce', nonce);
  // Next.js takes the nonce for its own <script> tags from THIS header on the
  // request. Without it the page renders unnonced inline scripts and the policy
  // below would kill the payer page's own bootstrap.
  reqHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: reqHeaders } });

  // Set the CSP on the response so browsers enforce it.
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

// Run on all page and API routes; skip:
//   - Next.js internal static assets
//   - .well-known/* — Apple AASA and Android assetlinks need clean JSON
//     with no extra middleware headers (Apple/Google CDNs are strict)
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|\\.well-known).*)',
  ],
};
