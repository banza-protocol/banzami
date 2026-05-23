/** @type {import('next').NextConfig} */

// CSP is intentionally absent here — it is generated per-request with a
// unique nonce by middleware.ts and set on the response there.
// Static security headers below apply to every route including static assets.
const staticSecurityHeaders = [
  { key: 'X-Accel-Buffering',     value: 'no' },
  { key: 'X-Frame-Options',       value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy',       value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',    value: 'camera=(), microphone=(), geolocation=()' },
  {
    key:   'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig = {
  output: 'standalone',
  async headers() {
    return [{ source: '/(.*)', headers: staticSecurityHeaders }];
  },
};

export default nextConfig;
