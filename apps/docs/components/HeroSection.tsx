import Link from 'next/link'
import { HeroBanzamIAWidget } from './HeroBanzamIAWidget'

interface Props {
  tagline: string
}

const CAPABILITY_TAGS = [
  'Operadores certificados',
  'Federação',
  'Liquidação',
  'Rastreabilidade',
  'Conformidade',
  'BanzAI',
]

export function HeroSection({ tagline }: Props) {
  return (
    <section className="relative overflow-hidden pb-12 pt-10 md:pb-20 md:pt-16">
      {/* Subtle background gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(153,0,17,0.07) 0%, transparent 70%)',
        }}
      />

      <div className="mx-auto max-w-4xl text-center">

        {/* 1 — Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-bz-primary/20 bg-bz-primary-light px-4 py-2">
          <span className="h-2 w-2 animate-pulse-slow rounded-full bg-bz-primary" />
          <span className="text-xs font-semibold tracking-wide text-bz-primary">
            Infraestrutura Financeira Programável para Angola
          </span>
        </div>

        {/* 2 — Main headline */}
        <h1 className="mb-5 text-balance text-4xl font-bold tracking-tight text-bz-text sm:text-5xl lg:text-6xl xl:text-7xl">
          Infraestrutura financeira{' '}
          <span
            style={{
              backgroundImage: 'linear-gradient(135deg, #990011 0%, #CC001A 50%, #C89B3C 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            programável.
          </span>
        </h1>

        {/* 3 — Subheadline */}
        <p className="mx-auto mb-7 max-w-2xl text-lg leading-relaxed text-bz-muted md:text-xl">
          Banzami é o produto de pagamentos de Angola, construído sobre o Banza — protocolo aberto de infraestrutura financeira.
        </p>

        {/* 4 — Capability tags — single row, scroll on mobile */}
        <div className="mb-8 flex justify-center gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {CAPABILITY_TAGS.map((tag) => (
            <span
              key={tag}
              className="shrink-0 rounded-full border border-bz-border bg-white px-3 py-1 text-xs font-medium text-bz-muted"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* 5 — BanzAI entry (centerpiece) */}
        <HeroBanzamIAWidget />

        {/* 6 — CTA buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/reference" className="btn-primary px-6 py-3 text-base">
            Ler o manifesto
          </Link>
          <Link href="/arquitectura-tecnica" className="btn-ghost px-6 py-3 text-base">
            Ver arquitectura
          </Link>
          <Link href="/visao-geral-do-ecossistema" className="btn-ghost px-6 py-3 text-base">
            Explorar ecossistema
          </Link>
        </div>
      </div>
    </section>
  )
}
