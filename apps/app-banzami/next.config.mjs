/** @type {import('next').NextConfig} */
// App Banzami Web — a financial application, not a marketing site. Security
// headers are stricter and the CSP is applied per-request with a nonce in
// middleware.ts. Framing is allowed ONLY from the Banzami marketing origins so
// the homepage can host the real app (WEB-APP-001 §13/§14/§105); everything else
// is refused. Private financial state must never sit in a shared cache (§29).
const nextConfig = {
  output: 'standalone',
  typescript: { tsconfigPath: './tsconfig.build.json' },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // Private-by-default: authenticated shells and API responses set their
          // own no-store; this is the safe floor for everything else.
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
};
export default nextConfig;
