import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  async redirects() {
    return [
      { source: '/what-is-banzami',           destination: '/o-que-e-o-banzami',                    permanent: true },
      { source: '/why-banzami-exists',         destination: '/por-que-o-banzami-existe',              permanent: true },
      { source: '/why-now',                    destination: '/por-que-agora',                         permanent: true },
      { source: '/the-vision',                 destination: '/a-visao',                               permanent: true },
      { source: '/a-morning-in-luanda',        destination: '/uma-manha-em-luanda',                   permanent: true },
      { source: '/how-banzami-works',          destination: '/como-o-banzami-funciona',               permanent: true },
      { source: '/core-features',              destination: '/funcionalidades-principais',             permanent: true },
      { source: '/real-angola-use-cases',      destination: '/casos-de-uso-reais-em-angola',          permanent: true },
      { source: '/qr-payment-ecosystem',       destination: '/ecossistema-de-pagamentos-qr',          permanent: true },
      { source: '/wallet-native-philosophy',   destination: '/filosofia-wallet-native',               permanent: true },
      { source: '/banzami-for-merchants',      destination: '/banzami-para-comerciantes',             permanent: true },
      { source: '/banzami-for-developers',     destination: '/banzami-para-programadores',            permanent: true },
      { source: '/banzami-for-consumers',      destination: '/banzami-para-consumidores',             permanent: true },
      { source: '/the-banzami-flywheel',       destination: '/o-motor-de-crescimento-banzami',        permanent: true },
      { source: '/banzami-business-ecosystem', destination: '/ecossistema-de-negocio-banzami',        permanent: true },
      { source: '/security-financial-integrity', destination: '/seguranca-e-integridade-financeira',  permanent: true },
      { source: '/technical-architecture',     destination: '/arquitectura-tecnica',                  permanent: true },
      { source: '/the-banzami-ecosystem',      destination: '/o-ecossistema-banzami',                 permanent: true },
      { source: '/roadmap-future',             destination: '/roadmap-e-futuro',                      permanent: true },
      { source: '/final-vision-statement',     destination: '/declaracao-de-visao-final',             permanent: true },
    ]
  },
}

export default nextConfig
