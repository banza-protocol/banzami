import { NextRequest, NextResponse } from 'next/server';

// The console's Content-Security-Policy, per request, with a nonce (A6-12).
//
// It used to be a static header with `script-src 'self' 'unsafe-inline'`, which
// is the directive an injected <script> needs. Now every request gets a random
// nonce: Next.js reads it from the Content-Security-Policy header on the
// incoming request and stamps it on the scripts it emits (the bootstrap, the
// RSC flush chunks), 'strict-dynamic' covers the chunks those load, and an
// injected inline script — which cannot know the nonce — does not run.
//
// style-src keeps 'unsafe-inline': Next and next/font emit inline styles, and
// a stylesheet cannot exfiltrate a session the way a script can.
//
// Same shape as apps/pay's middleware, with the request-header line the Next.js
// docs require for the nonce to actually reach the rendered HTML.

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = [
    "default-src 'self'",
    // 'unsafe-eval' only in `next dev`, where React Fast Refresh needs it. A
    // production build never carries it.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // 'self' only. The console calls admin-api on its own origin, through /api
    // on admin.banzami.com — the browser never talks to a second host.
    "connect-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  const reqHeaders = new Headers(request.headers);
  reqHeaders.set('x-nonce', nonce);
  // Next.js takes the nonce for its own <script> tags from THIS header on the
  // request. Without it the page renders with unnonced inline scripts and the
  // policy below kills the console's own bootstrap.
  reqHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: reqHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

// Every page and API route; Next's own static assets are served with their own
// headers and need no per-request policy.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
