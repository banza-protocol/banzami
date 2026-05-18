import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The docs app reads BANZAMI_REFERENCE.md from the monorepo root at build time.
  // No runtime file I/O — content is baked in at build.
  output: 'standalone',
  experimental: {
    // Allow imports from outside the apps/docs directory (for lib/reference.ts
    // which reads ../../docs/BANZAMI_REFERENCE.md relative to cwd at build time).
    serverComponentsExternalPackages: [],
  },
}

export default nextConfig
