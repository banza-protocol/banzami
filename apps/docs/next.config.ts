import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  async redirects() {
    return [
      // BanzAI route migration (pre-ADR-025 URLs → canonical)
      { source: '/banzamia',                   destination: '/banzai',                               permanent: true },
      { source: '/sobre-banzamia',             destination: '/sobre-o-banzai',                       permanent: true },
      // English-source aliases for existing pages
      { source: '/what-is-banzami',            destination: '/o-que-e-o-banza',                      permanent: true },
      { source: '/banzami-for-merchants',      destination: '/banzami-para-comerciantes',             permanent: true },
      { source: '/banzami-for-developers',     destination: '/banzami-para-programadores',            permanent: true },
      { source: '/banzami-for-consumers',      destination: '/para-consumidores',                     permanent: true },
      { source: '/security-financial-integrity', destination: '/seguranca-e-integridade-financeira',  permanent: true },
      { source: '/technical-architecture',     destination: '/arquitectura-tecnica',                  permanent: true },
    ]
  },
}

export default nextConfig
