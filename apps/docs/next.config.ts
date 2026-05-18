import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The docs app reads BANZAMI_REFERENCE.md from the monorepo root at build time.
  // Content is baked in statically — no runtime file I/O.
  output: 'standalone',
}

export default nextConfig
