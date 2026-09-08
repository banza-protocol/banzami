/** @type {import('next').NextConfig} */

const securityHeaders = [
  { key: 'X-Frame-Options',            value: 'DENY' },
  { key: 'X-Content-Type-Options',     value: 'nosniff' },
  { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // script-src/style-src still allow 'unsafe-inline': Next.js 14 (app router)
      // emits inline bootstrap/hydration scripts and next/font injects inline
      // styles. Removing it safely requires a per-request nonce served from a
      // Next middleware — tracked as the follow-up to this phase.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      // 'self' only. The console calls admin-api on its own origin, through
      // /api on admin.banzami.com — the browser never talks to a second host.
      //
      // This used to also allow https://api.banzami.com, the LIVE gateway. That
      // origin is not reachable from this console and Financial LIVE is
      // fail-closed, so the entry granted nothing and described a connection
      // that does not exist. A CSP naming a live money host from a Sandbox
      // console is worse than a narrow one: it is the document people read to
      // learn what this page talks to.
      "connect-src 'self'",
      "object-src 'none'",
      "frame-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig = {
  output: 'standalone',
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
