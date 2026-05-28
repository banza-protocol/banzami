import Link from 'next/link'

interface Props {
  tagline: string
}

export function HeroSection({ tagline }: Props) {
  return (
    <section className="relative overflow-hidden pb-16 pt-20 md:pb-24 md:pt-28">
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
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-bz-primary/20 bg-bz-primary-light px-4 py-2">
          <span className="h-2 w-2 animate-pulse-slow rounded-full bg-bz-primary" />
          <span className="text-xs font-semibold tracking-wide text-bz-primary">
            Infraestrutura Financeira Programável para Angola
          </span>
        </div>

        {/* Main headline */}
        <h1 className="mb-6 text-4xl font-bold tracking-tight text-bz-text text-balance sm:text-5xl lg:text-6xl xl:text-7xl">
          Infraestrutura financeira{' '}
          <span
            className="relative"
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

        {/* Tagline from BANZAMI_REFERENCE.md */}
        <p className="mx-auto mb-5 max-w-2xl text-lg leading-relaxed text-bz-muted md:text-xl">
          {tagline}
        </p>

        {/* Protocol pillars */}
        <div className="mb-8 mx-auto flex flex-wrap justify-center gap-2 max-w-2xl">
          {[
            'Operadores certificados',
            'Protocolo aberto',
            'Rastreabilidade financeira',
            'IA para integração',
            'Pagamentos QR instantâneos',
          ].map((pill) => (
            <span key={pill} className="rounded-full border border-bz-border bg-white px-3 py-1 text-xs font-medium text-bz-muted">
              {pill}
            </span>
          ))}
        </div>

        {/* SCAN → CONFIRM → PAID strip */}
        <div className="mb-10 mx-auto flex w-fit flex-col items-center rounded-2xl border border-bz-border bg-white px-8 py-4 shadow-card sm:flex-row sm:gap-0 sm:px-6 sm:py-3">
          {['Escanear', 'Confirmar', 'Pago instantaneamente'].map((step, i) => (
            <div key={i} className="flex flex-col items-center sm:flex-row sm:items-center">
              <span className="py-1.5 font-semibold text-bz-text sm:py-0">{step}</span>
              {i < 2 && (
                <span className="inline-block rotate-90 font-light text-bz-primary sm:rotate-0 sm:px-3">→</span>
              )}
            </div>
          ))}
        </div>

        {/* CTA buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/reference" className="btn-primary text-base px-6 py-3">
            Ler o manifesto
          </Link>
          <Link href="/arquitectura-tecnica" className="btn-ghost text-base px-6 py-3">
            Ver arquitectura
          </Link>
          <Link href="/visao-geral-do-ecossistema" className="btn-ghost text-base px-6 py-3">
            Explorar ecossistema
          </Link>
        </div>
      </div>
    </section>
  )
}
