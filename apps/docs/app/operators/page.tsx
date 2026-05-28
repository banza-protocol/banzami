import type { Metadata } from 'next'
import { getAllOperators } from '@/lib/operators'
import { RegistryFilters } from '@/components/operators/RegistryFilters'

export const metadata: Metadata = {
  title: 'Registo de Operadores',
  description:
    'Registo público de operadores Banzami — manifests, capacidades, conformidade e preparação para federação. Transparência de infraestrutura, não vigilância financeira.',
}

export default function OperatorsPage() {
  const operators = getAllOperators()
  const totalLevel2Plus = operators.filter(op => op.certification_level >= 2).length
  const totalActive = operators.filter(op => op.status === 'active').length

  return (
    <div>
      {/* Hero */}
      <div className="border-b border-bz-border bg-white px-5 py-10 md:px-8 lg:px-12">
        <div className="mx-auto max-w-4xl">

          {/* Eyebrow */}
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-bz-primary/20 bg-bz-primary-light px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-bz-primary" />
            <span className="text-xs font-semibold text-bz-primary">
              Registo Público · Protocolo v1.0
            </span>
          </div>

          <h1 className="mb-3 text-3xl font-bold tracking-tight text-bz-text sm:text-4xl">
            Registo de Operadores Banzami
          </h1>

          <p className="mb-6 max-w-2xl text-base text-bz-muted">
            Registo curado de operadores que implementam o protocolo Banzami.
            Manifests validados, capacidades declaradas, níveis de conformidade
            e preparação para federação — visibilidade de infraestrutura, não exposição de dados financeiros.
          </p>

          {/* Stats row */}
          <div className="flex flex-wrap gap-6">
            {[
              { value: operators.length, label: 'Operadores registados' },
              { value: totalActive, label: 'Activos' },
              { value: totalLevel2Plus, label: 'Level 2+ (Trace-compatible)' },
            ].map(({ value, label }) => (
              <div key={label}>
                <div className="text-2xl font-bold text-bz-text">{value}</div>
                <div className="text-xs text-bz-muted">{label}</div>
              </div>
            ))}
          </div>

          {/* Privacy notice */}
          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-bz-border bg-bz-surface px-4 py-3 max-w-2xl">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-bz-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="7" width="10" height="7" rx="1.5" />
              <path d="M5.5 7V5a2.5 2.5 0 015 0v2" strokeLinecap="round" />
            </svg>
            <p className="text-xs text-bz-muted">
              <strong className="text-bz-text">Transparência de infraestrutura, não vigilância financeira.</strong>
              {' '}Este registo expõe operadores, manifests e capacidades de protocolo.
              Nunca expõe wallets, saldos, transacções de utilizadores, actividade de comerciantes ou dados financeiros privados.
            </p>
          </div>
        </div>
      </div>

      {/* Registry content */}
      <div className="px-5 py-8 md:px-8 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <RegistryFilters operators={operators} />
        </div>
      </div>

      {/* Footer note */}
      <div className="border-t border-bz-border px-5 py-8 md:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              {
                icon: (
                  <path d="M8 2a6 6 0 100 12A6 6 0 008 2zM8 6v4M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                ),
                title: 'Registo curado',
                body: 'Actualmente um registo estático aprovado manualmente. A descoberta dinâmica via federação está planeada em futuras versões do protocolo.',
              },
              {
                icon: (
                  <path d="M3 4h10M3 8h8M3 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                ),
                title: 'Manifests validados',
                body: 'Cada operador expõe /.well-known/banzami/operator.json. O registo valida o schema, os invariantes de segurança e as declarações de capacidade.',
              },
              {
                icon: (
                  <><path d="M4 8l2.5 2.5L12 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></>
                ),
                title: 'Conformidade pública',
                body: 'Os níveis de conformidade (0–4) são determinados pelo runner oficial do Banzami. Nenhum operador pode auto-declarar certificação sem ter passado os testes.',
              },
            ].map(({ icon, title, body }) => (
              <div key={title} className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bz-primary-light">
                  <svg className="h-4 w-4 text-bz-primary" viewBox="0 0 16 16" fill="none">{icon}</svg>
                </div>
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-bz-text">{title}</h3>
                  <p className="text-xs text-bz-muted">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
