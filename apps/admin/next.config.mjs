/** @type {import('next').NextConfig} */

const securityHeaders = [
  { key: 'X-Frame-Options',            value: 'DENY' },
  { key: 'X-Content-Type-Options',     value: 'nosniff' },
  { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  }
];

// The Content-Security-Policy is NOT here: it is generated per request, with a
// fresh nonce, in middleware.ts, and set on the response there. A static header
// cannot carry a nonce, which is why this one used to allow 'unsafe-inline'
// scripts — the exact thing an injected script needs (A6-12).


const nextConfig = {
  output: 'standalone',
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
