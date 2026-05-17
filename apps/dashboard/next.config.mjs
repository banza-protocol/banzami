/** @type {import('next').NextConfig} */

// Security headers and CSP with nonce are handled by middleware.ts.
// Nonce-based CSP is required for Next.js App Router inline scripts.
const nextConfig = {
  output: 'standalone',
};

export default nextConfig;
