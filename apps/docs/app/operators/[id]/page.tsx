import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAllOperators, getOperatorById, CAPABILITY_LABELS, OPERATOR_TYPE_LABELS, type CapabilityMeta } from '@/lib/operators'
import { CertificationLevelBadge, ConformanceBadgeChip } from '@/components/operators/ConformanceBadge'
import { CapabilityBadge } from '@/components/operators/CapabilityBadge'
import { ManifestStatus } from '@/components/operators/ManifestStatus'
import { KeyFingerprint } from '@/components/operators/KeyFingerprint'
import { OperatorTimeline } from '@/components/operators/OperatorTimeline'

export function generateStaticParams() {
  return getAllOperators().map(op => ({ id: op.id }))
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const op = getOperatorById(id)
  if (!op) return { title: 'Operador não encontrado' }
  return {
    title: op.display_name,
    description: op.description,
  }
}

const ENV_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  sandbox:      { label: 'Sandbox',      color: 'text-blue-700',  bg: 'bg-blue-50 border-blue-200' },
  production:   { label: 'Produção',     color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
  experimental: { label: 'Experimental', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
}

const SUITE_LABEL: Record<string, string> = {
  health: 'Health', environment: 'Isolamento de Ambiente', wallets: 'Wallets',
  'transfers-basic': 'Transferências', qr: 'QR', 'payment-requests': 'Pedidos de Pagamento',
  events: 'Eventos', ledger: 'Ledger', settlement: 'Liquidação', traces: 'Rastreabilidade',
  manifest: 'Manifest', capabilities: 'Capacidades',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-bz-muted">{title}</h2>
      {children}
    </section>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-bz-border last:border-0">
      <dt className="w-44 shrink-0 text-[12px] font-medium text-bz-muted">{label}</dt>
      <dd className="flex-1 text-sm text-bz-text">{children}</dd>
    </div>
  )
}

export default async function OperatorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const op = getOperatorById(id)
  if (!op) notFound()

  const env = ENV_CONFIG[op.environment] ?? ENV_CONFIG.sandbox
  const allCaps = Object.keys(CAPABILITY_LABELS)

  return (
    <div>
      {/* Back nav */}
      <div className="border-b border-bz-border bg-bz-surface px-5 py-3 md:px-8">
        <Link
          href="/operators"
          className="flex items-center gap-1.5 text-xs text-bz-muted hover:text-bz-primary transition-colors"
        >
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
            <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Registo de Operadores
        </Link>
      </div>

      {/* Hero */}
      <div className="border-b border-bz-border bg-white px-5 py-8 md:px-8 lg:px-12">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="mb-2 flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${env.color} ${env.bg}`}>
                  {env.label}
                </span>
                <span className="text-[11px] text-bz-muted">
                  {OPERATOR_TYPE_LABELS[op.type] ?? op.type}
                </span>
                <span className="text-[11px] text-bz-muted/50">·</span>
                <span className="text-[11px] text-bz-muted">{op.jurisdiction}</span>
                {op.simulated && (
                  <>
                    <span className="text-[11px] text-bz-muted/50">·</span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-bz-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      Simulado
                    </span>
                  </>
                )}
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-bz-text sm:text-3xl">
                {op.display_name}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-bz-muted">{op.description}</p>
            </div>
            <CertificationLevelBadge level={op.certification_level} />
          </div>

          {/* Conformance badges */}
          {op.conformance_badges.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {op.conformance_badges.map(badge => (
                <ConformanceBadgeChip key={badge} badge={badge} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="px-5 py-8 md:px-8 lg:px-12">
        <div className="mx-auto max-w-4xl">

          {/* ─── Overview ─── */}
          <Section title="Visão Geral">
            <div className="rounded-xl border border-bz-border bg-white divide-y divide-bz-border">
              <dl className="px-5 py-1">
                <DetailRow label="ID do Operador">
                  <code className="font-mono text-sm">{op.id}</code>
                </DetailRow>
                <DetailRow label="Endpoint Público">
                  <code className="font-mono text-sm break-all">{op.public_endpoint}</code>
                </DetailRow>
                <DetailRow label="Versão de Protocolo">
                  <span className="font-mono">v{op.protocol_version}</span>
                </DetailRow>
                <DetailRow label="Nível de Certificação">
                  <div className="flex items-center gap-2">
                    <CertificationLevelBadge level={op.certification_level} />
                    <span className="text-xs text-bz-muted">{op.certification_level_name}</span>
                  </div>
                </DetailRow>
                {op.website && (
                  <DetailRow label="Website">
                    <a href={op.website} target="_blank" rel="noopener noreferrer"
                       className="text-bz-primary hover:underline break-all">
                      {op.website}
                    </a>
                  </DetailRow>
                )}
                <DetailRow label="Contacto de Segurança">
                  <a href={`mailto:${op.security_contact}`} className="text-bz-primary hover:underline">
                    {op.security_contact}
                  </a>
                </DetailRow>
                <DetailRow label="Moedas Suportadas">
                  <div className="flex flex-wrap gap-1.5">
                    {op.supported_currencies.map(c => (
                      <span key={c} className="rounded border border-bz-border bg-bz-surface px-2 py-0.5 font-mono text-[11px]">{c}</span>
                    ))}
                  </div>
                </DetailRow>
                {op.settlement_modes.length > 0 && (
                  <DetailRow label="Modos de Liquidação">
                    <div className="flex flex-wrap gap-1.5">
                      {op.settlement_modes.map(m => (
                        <span key={m} className="rounded border border-bz-border bg-bz-surface px-2 py-0.5 font-mono text-[11px]">{m}</span>
                      ))}
                    </div>
                  </DetailRow>
                )}
              </dl>
            </div>
          </Section>

          {/* ─── Manifest ─── */}
          <Section title="Manifest">
            <div className="rounded-xl border border-bz-border bg-white p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="mb-1 text-xs font-medium text-bz-muted">URL do Manifest</div>
                  <code className="break-all font-mono text-[12px] text-bz-text">{op.manifest_url}</code>
                </div>
                <ManifestStatus
                  status={op.manifest_status}
                  schemaValid={op.manifest_schema_valid}
                  stale={op.stale_manifest}
                  lastFetch={op.last_manifest_fetch}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: 'Versão do Manifest', value: `v${op.manifest_version}` },
                  { label: 'Versão de Protocolo', value: `v${op.protocol_version}` },
                  { label: 'Schema Válido', value: op.manifest_schema_valid ? '✓ Válido' : '✗ Inválido' },
                  { label: 'Manifest Desactualizado', value: op.stale_manifest ? '⚠ Sim' : 'Não' },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg bg-bz-surface px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-bz-muted">{label}</div>
                    <div className="mt-0.5 font-mono text-sm text-bz-text">{value}</div>
                  </div>
                ))}
              </div>

              {/* Safety invariant notice */}
              {op.simulated && !op.production_allowed && (
                <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-green-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="7" width="10" height="7" rx="1.5" />
                    <path d="M5.5 7V5a2.5 2.5 0 015 0v2" strokeLinecap="round" />
                  </svg>
                  <p className="text-xs text-green-800">
                    <strong>Invariante de segurança confirmado:</strong> Este operador declara{' '}
                    <code>simulated: true</code> e <code>production_allowed: false</code>.
                    Não pode processar transacções financeiras reais.
                  </p>
                </div>
              )}
            </div>
          </Section>

          {/* ─── Capabilities ─── */}
          <Section title="Capacidades">
            <div className="flex flex-wrap gap-2">
              {allCaps.map(cap => {
                const supported = (op.capabilities as Record<string, boolean>)[cap] ?? false
                const meta = (op.capabilities_metadata as Record<string, CapabilityMeta>)[cap]
                if (!supported && !meta) return null
                return (
                  <CapabilityBadge key={cap} capabilityKey={cap} supported={supported} meta={meta} />
                )
              })}
            </div>
          </Section>

          {/* ─── Conformance ─── */}
          <Section title="Conformidade">
            <div className="rounded-xl border border-bz-border bg-white p-5 space-y-5">

              {/* Summary */}
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className="text-xs font-medium text-bz-muted mb-1">Nível atingido</div>
                  <CertificationLevelBadge level={op.certification_level} />
                </div>
                <div className="text-right">
                  <div className="text-xs text-bz-muted">Última execução</div>
                  <div className="font-mono text-sm text-bz-text">{op.last_conformance_run.slice(0, 10)}</div>
                </div>
              </div>

              {/* Badges */}
              {op.conformance_badges.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-medium text-bz-muted">Badges de Compatibilidade</div>
                  <div className="flex flex-wrap gap-2">
                    {op.conformance_badges.map(badge => (
                      <ConformanceBadgeChip key={badge} badge={badge} />
                    ))}
                  </div>
                </div>
              )}

              {/* Suite results */}
              <div>
                <div className="mb-2 text-xs font-medium text-bz-muted">Suites executadas</div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {op.passed_suites.map(s => (
                    <div key={s} className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2">
                      <svg className="h-3.5 w-3.5 text-green-600" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l2.5 2.5L10 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="text-xs font-medium text-green-800">{SUITE_LABEL[s] ?? s}</span>
                    </div>
                  ))}
                  {op.failed_suites.map(s => (
                    <div key={s} className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2">
                      <svg className="h-3.5 w-3.5 text-red-600" viewBox="0 0 12 12" fill="none">
                        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      <span className="text-xs font-medium text-red-800">{SUITE_LABEL[s] ?? s}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Report hash */}
              <div className="rounded-lg bg-bz-surface px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-bz-muted mb-1">Hash do Relatório</div>
                <code className="font-mono text-[11px] text-bz-text break-all">{op.conformance_report_hash}</code>
              </div>

              {/* Runner info */}
              <div className="flex items-center justify-between text-[11px] text-bz-muted">
                <span>Runner v{op.runner_version}</span>
                <span>Protocolo v{op.protocol_version}</span>
              </div>
            </div>
          </Section>

          {/* ─── Public Keys ─── */}
          <Section title="Chaves Públicas">
            <div className="space-y-2">
              {op.signing_keys.map((key, i) => (
                <KeyFingerprint key={i} signingKey={key} />
              ))}
            </div>
          </Section>

          {/* ─── Federation Readiness ─── */}
          <Section title="Preparação para Federação">
            <div className="rounded-xl border border-bz-border bg-white p-5">
              <div className="flex items-start gap-4 flex-wrap">
                <div>
                  <div className="text-xs font-medium text-bz-muted mb-1">Suporte de Federação</div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    op.federation_support
                      ? 'text-green-700 bg-green-50 border-green-200'
                      : op.federation_status === 'experimental'
                      ? 'text-amber-700 bg-amber-50 border-amber-200'
                      : 'text-bz-muted bg-bz-surface border-bz-border'
                  }`}>
                    {op.federation_support
                      ? 'Suportado'
                      : op.federation_status === 'experimental'
                      ? 'Experimental'
                      : op.federation_status === 'planned'
                      ? 'Planeado'
                      : 'Não suportado'
                    }
                  </span>
                </div>
                <div>
                  <div className="text-xs font-medium text-bz-muted mb-1">Suporte de Rastreabilidade</div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    op.trace_support
                      ? 'text-blue-700 bg-blue-50 border-blue-200'
                      : 'text-bz-muted bg-bz-surface border-bz-border'
                  }`}>
                    {op.trace_support ? `trace_id · v${op.trace_schema_version}` : 'Não suportado'}
                  </span>
                </div>
              </div>

              {!op.federation_support && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-bz-border bg-bz-surface px-3 py-2.5">
                  <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bz-muted" viewBox="0 0 12 12" fill="none">
                    <path d="M6 2v5M6 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <p className="text-xs text-bz-muted">
                    Federação requer Level 3 (Federation Operator) e um manifest válido.
                    A certificação Level 2 (Settlement Operator) é pré-requisito.
                  </p>
                </div>
              )}
            </div>
          </Section>

          {/* ─── Audit Trail ─── */}
          <Section title="Registo de Auditoria">
            <div className="rounded-xl border border-bz-border bg-white p-5">
              <OperatorTimeline entries={op.audit_trail} />
            </div>
          </Section>

        </div>
      </div>
    </div>
  )
}
