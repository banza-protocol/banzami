import { NextRequest, NextResponse } from 'next/server';

// App Banzami Web — per-request Content-Security-Policy with a nonce, and a
// lightweight auth redirect.
//
// The CSP is a financial-app policy: scripts run only with this request's nonce
// (strict-dynamic), the browser connects only to this origin (the BFF; the BFF
// reaches the Consumer API server-side), and the page may be framed ONLY by the
// Banzami marketing origins so the homepage can host the real app — never by an
// arbitrary site (WEB-APP-001 §14/§105). No inline script, no eval in
// production.
//
// The auth redirect here is defence-in-depth only: a protected route with no
// session cookie is sent to the sign-in screen before it renders. The
// authoritative check is server-side, where the encrypted session is opened and
// validated (a present-but-invalid cookie is rejected there).

const PUBLIC_PATHS = ['/', '/entrar', '/criar-conta', '/sobre-sandbox'];
const PUBLIC_API = ['/api/auth/register', '/api/auth/login'];
const SESSION_COOKIE = 'bz_app_session';

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (PUBLIC_API.includes(pathname)) return true;
  return false;
}

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const dev = process.env.NODE_ENV === 'development';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // The browser only ever talks to this origin (the BFF). The Consumer API is
    // reached server-side, so no second host is needed here.
    "connect-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "frame-src 'none'",
    // Framed only by the marketing site (the homepage portal), never elsewhere.
    "frame-ancestors 'self' https://banzami.com https://www.banzami.com",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ');

  const { pathname } = request.nextUrl;
  // Defence-in-depth redirect: no session cookie on a protected page → sign in.
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isApi = pathname.startsWith('/api/');
  if (!isPublic(pathname) && !hasSession) {
    if (isApi) {
      return NextResponse.json({ code: 'UNAUTHENTICATED', message: 'sign in required' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/entrar';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  const reqHeaders = new Headers(request.headers);
  reqHeaders.set('x-nonce', nonce);
  reqHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: reqHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
