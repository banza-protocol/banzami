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
  const { canLaunch, criticalReady, criticalTotal, blockers, pillars, readyPct } = readiness

  return (
    <section className="border-b border-gray-200 bg-white px-6 py-5">
      {/* Verdict */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
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
          <p className="mt-1 text-sm text-gray-500">
            {canLaunch
              ? 'All launch-critical capabilities are operational.'
              : `${blockers.length} launch-critical ${blockers.length === 1 ? 'capability' : 'capabilities'} not yet operational.`}
          </p>
        </div>
        <div className="flex gap-6 text-right">
          <Metric value={`${criticalReady}/${criticalTotal}`} label="Critical ready" />
          <Metric value={`${readyPct}%`} label="Overall ready" />
        </div>
      </div>

      {/* Pillars */}
      <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {pillars.map((p) => (
          <div key={p.domain} className={`rounded-lg border px-3.5 py-3 ${RING[p.status]}`}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-bold text-gray-800">
                <span className={`h-2 w-2 rounded-full ${DOT[p.status]}`} />
                {p.label}
              </span>
              <span className="text-xs font-semibold text-gray-500">
                {p.ready}/{p.total}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-gray-600">{p.question}</p>
            {p.criticalGaps > 0 && (
              <p className="mt-1 text-[11px] font-semibold text-red-600">
                {p.criticalGaps} critical gap{p.criticalGaps === 1 ? '' : 's'}
                {p.blocked > 0 ? ` · ${p.blocked} blocked` : ''}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Blockers */}
      {blockers.length > 0 && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-red-500">
            Launch blockers — critical, not yet operational
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {blockers.map((b) => (
              <span
                key={b.id}
                className="inline-flex items-center gap-1.5 rounded border border-red-200 bg-white px-2 py-1 text-xs text-gray-700"
                title={b.title}
              >
                <span className="font-mono font-semibold text-red-600">{b.id}</span>
                <span className="max-w-[220px] truncate">{b.title}</span>
                <span className="rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">
                  {b.status}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-extrabold tabular-nums text-gray-900">{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  )
}
