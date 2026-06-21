import type { Readiness, PillarStatus } from '@/lib/readiness'

const DOT: Record<PillarStatus, string> = {
  ready:   'bg-emerald-500',
  partial: 'bg-amber-500',
  blocked: 'bg-red-600',
}
const RING: Record<PillarStatus, string> = {
  ready:   'border-emerald-200 bg-emerald-50',
  partial: 'border-amber-200 bg-amber-50',
  blocked: 'border-red-200 bg-red-50',
}

export function ReadinessDashboard({ readiness }: { readiness: Readiness }) {
  const {
    canLaunch, blockers, pillars,
    launchReady, codeComplete, launchScope, roadmap, externallyBlocked, internallyBlocked,
    criticalLaunchReady, criticalCodeComplete, criticalTotal,
  } = readiness

  return (
    <section className="border-b border-gray-200 bg-white px-6 py-5">
      {/* Verdict */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            Operator Readiness
          </div>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-extrabold text-gray-900">
            Can Banzami launch?
            <span
              className={`rounded-md px-2.5 py-1 text-sm font-bold ${
                canLaunch ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}
            >
              {canLaunch ? 'YES' : 'NOT YET'}
            </span>
          </h1>
          {/* Honest subtitle: code-complete internally, launch awaits external providers. */}
          <p className="mt-1.5 text-sm text-gray-600">
            Code-complete internally — launch awaits external providers
            <span className="text-gray-400"> (KYC vendor · funding &amp; withdrawal rails · BNA).</span>
          </p>
          <p className="mt-0.5 text-[13px] font-semibold text-emerald-700">
            {internallyBlocked} {internallyBlocked === 1 ? 'item' : 'items'} blocked on internal engineering
          </p>
        </div>
        <div className="flex gap-5 text-right">
          <Metric value={`${launchReady}/${launchScope}`} label="Launch-ready" tone="emerald" />
          <Metric value={`${codeComplete}/${launchScope}`} label="Code-complete" tone="gray" />
          <Metric value={`${externallyBlocked}`} label="Externally blocked" tone="amber" />
          {roadmap > 0 && <Metric value={`${roadmap}`} label="Roadmap (L1–L4)" tone="gray" />}
        </div>
      </div>

      {/* Critical: strict primary + code-complete helper */}
      <div className="mt-3 flex items-baseline gap-2 text-sm">
        <span className="font-bold tabular-nums text-gray-900">{criticalLaunchReady}/{criticalTotal}</span>
        <span className="font-semibold text-gray-600">launch-critical</span>
        <span className="text-gray-300">·</span>
        <span className="tabular-nums text-gray-400">{criticalCodeComplete}/{criticalTotal} implemented</span>
      </div>

      {/* Pillars */}
      <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {pillars.map((p) => {
          const scope = p.total - p.roadmap
          const parts: { text: string; tone?: string }[] = []
          if (p.codeComplete > p.launchReady) parts.push({ text: `${p.codeComplete}/${scope} code-complete` })
          if (p.externallyBlocked > 0) parts.push({ text: `${p.externallyBlocked} externally blocked`, tone: 'text-amber-700' })
          if (p.roadmap > 0) parts.push({ text: `${p.roadmap} roadmap`, tone: 'text-gray-500' })
          return (
            <div key={p.domain} className={`rounded-lg border px-3.5 py-3 ${RING[p.status]}`}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-bold text-gray-800">
                  <span className={`h-2 w-2 rounded-full ${DOT[p.status]}`} />
                  {p.label}
                </span>
                <span className="text-xs font-semibold text-gray-500">
                  {p.launchReady}/{scope}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-gray-600">{p.question}</p>
              {parts.length > 0 && (
                <p className="mt-1 text-[11px] font-medium text-gray-500">
                  {parts.map((seg, i) => (
                    <span key={seg.text} className={seg.tone ? `font-semibold ${seg.tone}` : undefined}>
                      {i > 0 ? ' · ' : ''}{seg.text}
                    </span>
                  ))}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Launch-critical gaps — all externally blocked */}
      {blockers.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-amber-600">
            Launch-critical gaps — not yet validated{' '}
            {blockers.every((b) => b.externallyBlocked) && '(all externally blocked)'}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {blockers.map((b) => (
              <span
                key={b.id}
                className="inline-flex items-center gap-1.5 rounded border border-amber-200 bg-white px-2 py-1 text-xs text-gray-700"
                title={b.title}
              >
                <span className="font-mono font-semibold text-amber-700">{b.id}</span>
                <span className="max-w-[200px] truncate">{b.title}</span>
                <span className="rounded bg-gray-100 px-1 text-[10px] font-semibold text-gray-600">
                  {b.status}
                </span>
                {b.externallyBlocked && (
                  <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700">
                    externally blocked
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function Metric({ value, label, tone }: { value: string; label: string; tone: 'emerald' | 'gray' | 'amber' }) {
  const color =
    tone === 'emerald' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : 'text-gray-900'
  return (
    <div>
      <div className={`text-2xl font-extrabold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  )
}
