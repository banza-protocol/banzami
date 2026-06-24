import { NextRequest, NextResponse } from 'next/server';

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
    "connect-src 'self' https://api.banzami.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  // Forward the nonce to the RSC render pipeline via a request header.
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set('x-nonce', nonce);

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
