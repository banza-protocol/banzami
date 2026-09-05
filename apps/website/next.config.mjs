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
  // The production build typechecks the application, not the tests. The tests
  // read the assurance manifest from the repository root, and only apps/website/
  // is synced into the image build context — typechecking them here made the
  // build depend on files that are deliberately not shipped. They are still
  // typechecked by `npx tsc -p tsconfig.json` and in CI.
  typescript: { tsconfigPath: './tsconfig.build.json' },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  // NOTE: docs URL routing is intentionally NOT done here. next.config redirects
  // run before middleware and are host-agnostic, which would invert the canonical
  // (/docs) on the console host and loop with the host-aware middleware. All
  // docs/console host routing lives in middleware.ts + lib/console-routing.ts.
};

export default nextConfig;
