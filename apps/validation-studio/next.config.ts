import type { NextConfig } from 'next'

// LOCAL-ONLY TOOL — refuse to run in production
if (process.env.NODE_ENV === 'production') {
  throw new Error(
    '[Validation Studio] This tool is local-only and must never be deployed to production.',
  )
}

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
