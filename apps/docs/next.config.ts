import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  async redirects() {
    return [
      // ── Portuguese → English canonical routes ────────────────────────────
      { source: '/sobre-o-banzai',              destination: '/banzai',             permanent: true },
      { source: '/validacao',                   destination: '/certification',       permanent: true },
      { source: '/sobre',                       destination: '/introduction',        permanent: true },
      { source: '/documentacao',                destination: '/reference',           permanent: true },
      { source: '/federacao',                   destination: '/federation',          permanent: true },

      // ── Legacy Portuguese section slugs ──────────────────────────────────
      { source: '/o-problema-angola-tem-as-pecas', destination: '/why-banza-exists', permanent: true },
      { source: '/a-camada-que-falta',             destination: '/why-banza-exists', permanent: true },
      { source: '/o-que-e-o-banza',                destination: '/introduction',     permanent: true },
      { source: '/principios-fundamentais',        destination: '/core-principles',  permanent: true },
      { source: '/visao-geral-do-ecossistema',     destination: '/core-principles',  permanent: true },
      { source: '/arquitectura-tecnica',           destination: '/core-principles',  permanent: true },
      { source: '/representacao-monetaria',        destination: '/core-principles',  permanent: true },
      { source: '/governanca',                     destination: '/governance',       permanent: true },
      { source: '/modelo-de-certificacao',         destination: '/certification',    permanent: true },
      { source: '/banzamia',                       destination: '/banzai',           permanent: true },
      { source: '/banzami-para-programadores',     destination: '/developer-resources', permanent: true },
      { source: '/banzami-para-comerciantes',      destination: '/operators',        permanent: true },
      { source: '/para-consumidores',              destination: '/introduction',     permanent: true },
      { source: '/seguranca-e-integridade-financeira', destination: '/trust',        permanent: true },
      { source: '/declaracao-de-visao',            destination: '/introduction',     permanent: true },
      { source: '/por-que-angola-por-que-agora',   destination: '/why-banza-exists', permanent: true },

      // ── Legacy English aliases (pre-ADR-025) ────────────────────────────
      { source: '/what-is-banzami',              destination: '/introduction',      permanent: true },
      { source: '/banzami-for-merchants',        destination: '/operators',         permanent: true },
      { source: '/banzami-for-developers',       destination: '/developer-resources', permanent: true },
      { source: '/banzami-for-consumers',        destination: '/introduction',      permanent: true },
      { source: '/security-financial-integrity', destination: '/trust',             permanent: true },
      { source: '/technical-architecture',       destination: '/core-principles',   permanent: true },
      { source: '/sobre-banzamia',               destination: '/banzai',            permanent: true },
    ]
  },
}

export default nextConfig
