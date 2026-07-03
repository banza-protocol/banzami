/** @type {import('next').NextConfig} */

// Static security headers applied to every route. This is a static marketing
// site (no inline scripts beyond Next's own framework bundles), so no
// per-request CSP nonce middleware is needed.
const securityHeaders = [
  { key: 'X-Frame-Options',        value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
  output: 'standalone',
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  async redirects() {
    // /docs is the public shortcut to the Developer Documentation (canonical at
    // /developers/docs). The URL hash (e.g. #reembolsos) is preserved by the browser.
    return [
      { source: '/docs', destination: '/developers/docs', permanent: true },
    ];
  },
};

export default nextConfig;
