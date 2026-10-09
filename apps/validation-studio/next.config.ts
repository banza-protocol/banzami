import type { NextConfig } from 'next'

// LOCAL-ONLY TOOL — refuse to run in production
if (process.env.NODE_ENV === 'production') {
  throw new Error(
    '[Validation Studio] This tool is local-only and must never be deployed to production.',
  )
}

const nextConfig: NextConfig = {
  // Do not advertise the framework to whoever is fingerprinting the site.
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
