import type { Metadata } from 'next'
import { getAllOperators } from '@/lib/operators'
import { RegistryFilters } from '@/components/operators/RegistryFilters'
import { DiagramPanel } from '@/components/protocol/DiagramPanel'

export const metadata: Metadata = {
  title: 'Operator Registry — BANZA Protocol',
  description:
    'Public registry of certified BANZA operators — manifests, capabilities, conformance levels, and federation readiness. Infrastructure transparency, not financial surveillance.',
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

          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-bz-primary/20 bg-bz-primary-light px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-bz-primary" />
            <span className="text-xs font-semibold text-bz-primary">
              Public Registry · Protocol v1.0
            </span>
          </div>

          <h1 className="mb-3 text-3xl font-bold tracking-tight text-bz-text sm:text-4xl">
            BANZA Operator Registry
          </h1>

          <p className="mb-6 max-w-2xl text-base text-bz-muted">
            Public registry of operators implementing the BANZA protocol.
            Validated manifests, declared capabilities, conformance levels,
            and federation readiness — infrastructure visibility, not financial data exposure.
          </p>

          {/* Stats */}
          <div className="flex flex-wrap gap-6">
            {[
              { value: operators.length, label: 'Registered operators' },
              { value: totalActive,      label: 'Active' },
              { value: totalLevel2Plus,  label: 'Level 2+ (Settlement Operator)' },
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
              <strong className="text-bz-text">Infrastructure transparency, not financial surveillance.</strong>
              {' '}This registry exposes operators, manifests, and protocol capabilities.
              It never exposes wallets, balances, user transactions, merchant activity, or private financial data.
            </p>
          </div>
        </div>
      </div>

      {/* Protocol diagram */}
      <div className="border-b border-bz-border bg-bz-surface px-5 py-10 md:px-8 lg:px-12">
        <div className="mx-auto max-w-4xl">
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
            Inter-operator payment
          </div>
          <h2 className="mb-4 text-xl font-bold tracking-tight text-bz-text">
            How certified operators exchange payments
          </h2>
          <DiagramPanel
            src="/diagrams/protocol/inter-operator-payment-flow-v1.svg"
            alt="BANZA Inter-Operator Payment Flow — cross-operator payment between Operator A and Operator B"
            caption="SVG-P-010 · BANZA_REFERENCE.md §5"
          />
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
                title: 'Curated registry',
                body: 'Currently a manually approved static registry. Dynamic discovery via federation is planned in future protocol versions (RFC-0008).',
              },
              {
                title: 'Validated manifests',
                body: 'Each operator exposes /.well-known/banza/operator.json. The registry validates the schema, security invariants, and capability declarations.',
              },
              {
                title: 'Public conformance',
                body: 'Conformance levels (0–4) are determined by the official BANZA conformance suite runner. No operator may self-declare certification without passing the suite.',
              },
            ].map(({ title, body }) => (
              <div key={title} className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bz-primary-light">
                  <svg className="h-4 w-4 text-bz-primary" viewBox="0 0 16 16" fill="none">
                    <path d="M4 8l2.5 2.5L12 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
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
