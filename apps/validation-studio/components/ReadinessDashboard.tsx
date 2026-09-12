import type { Readiness, PillarStatus, BanzaLevelStatus } from '@/lib/readiness'

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

// BANZA level strip: validated = green, planned = amber, future = neutral.
const LEVEL_RING: Record<BanzaLevelStatus, string> = {
  validated: 'border-emerald-200 bg-emerald-50',
  planned:   'border-amber-200 bg-amber-50',
  future:    'border-gray-200 bg-gray-50',
}
const LEVEL_BADGE: Record<BanzaLevelStatus, string> = {
  validated: 'bg-emerald-100 text-emerald-700',
  planned:   'bg-amber-100 text-amber-700',
  future:    'bg-gray-200 text-gray-600',
}

export function ReadinessDashboard({ readiness }: { readiness: Readiness }) {
  const {
    canLaunch, blockers, pillars, banzaLevels,
    launchReady, codeComplete, launchScope, roadmap, externallyBlocked, internallyBlocked,
    criticalLaunchReady, criticalCodeComplete, criticalTotal,
    active, retiredItems,
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
          {/* What the eleven non-validated items ARE. The single ratio above hid
              that, and its denominator moved every time something was retired —
              so deleting a product changed the score and nobody could say why. */}
          <p className="mt-2 text-[12.5px] text-gray-600">
            <span className="font-semibold text-gray-700">Active surface {active.required}</span>
            {' — '}
            <span className="tabular-nums">{active.validated} validated</span>
            {active.implemented > 0 && <> · <span className="tabular-nums">{active.implemented} implemented</span></>}
            {active.inProgress > 0 && <> · <span className="tabular-nums">{active.inProgress} in progress</span></>}
            {active.blocked > 0 && <> · <span className="tabular-nums">{active.blocked} blocked</span></>}
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

      {/* Retired — named, never counted. A withdrawn product is not work owed,
          and folding it into a ratio made deleting one look like acquiring debt. */}
      {retiredItems.length > 0 && (
        <p className="mt-2 text-[12.5px] text-gray-500">
          <span className="font-semibold">Retired ({retiredItems.length})</span>
          {' — outside the active surface, not a blocker and not missing implementation: '}
          {retiredItems.map((r) => `${r.id} ${r.title}`).join(' · ')}
        </p>
      )}

      {/* Pillars */}
      <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {pillars.map((p) => {
          const scope = p.total - p.roadmap - p.baseline

          // Protocol Conformance is the strategic BANZA card — render it full-width
          // with a detailed, data-driven summary. Display-only; no count changes.
          if (p.domain === 'DOM-CONFORMANCE') {
            return (
              <div
                key={p.domain}
                className={`rounded-lg border px-4 py-3.5 sm:col-span-2 lg:col-span-3 ${RING[p.status]}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="flex items-center gap-2 text-sm font-bold text-gray-800">
                      <span className={`h-2 w-2 rounded-full ${DOT[p.status]}`} />
                      {p.label}
                    </span>
                    <p className="mt-1 text-xs text-gray-600">{p.question}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-gray-500">
                      {p.baseline} baseline · {p.roadmap} roadmap ·{' '}
                      <span className="text-gray-400">evidence, not certification · Banzami is not certified</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-extrabold tabular-nums text-emerald-700">
                      {p.launchReady}/{scope}
                    </div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      L0 validated
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <MiniStat label="L0 Evidence" value="VALIDATED" note="PyPI + GHCR 5/5" tone="emerald" />
                  <MiniStat label="Evidence custody" value="ARCHIVED" note="evidence/banza-conformance/l0/" tone="emerald" />
                  <MiniStat label="Certificate" value="NONE" note="no production certificate · certificate.json absent" tone="gray" />
                  <MiniStat label="Roadmap" value="L1–L4 TRACKED" note="not validated" tone="gray" />
                </div>
              </div>
            )
          }

          const parts: { text: string; tone?: string }[] = []
          if (p.codeComplete > p.launchReady) parts.push({ text: `${p.codeComplete}/${scope} code-complete` })
          if (p.externallyBlocked > 0) parts.push({ text: `${p.externallyBlocked} externally blocked`, tone: 'text-amber-700' })
          if (p.baseline > 0) parts.push({ text: `${p.baseline} baseline`, tone: 'text-emerald-700' })
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

      {/* BANZA conformance level path (L0 → L4) — display-only, derived from the
          matrix. L0 is validated evidence; L1–L4 are roadmap/future, never a
          launch blocker and never a certification claim. */}
      {banzaLevels.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            BANZA conformance levels
            <span className="ml-1.5 font-medium normal-case tracking-normal text-gray-400">
              — L0 validated evidence · L1–L4 roadmap (evidence, not certification)
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {banzaLevels.map((lv) => (
              <div key={lv.level} className={`rounded-lg border px-3 py-2.5 ${LEVEL_RING[lv.status]}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-gray-800">{lv.label}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${LEVEL_BADGE[lv.status]}`}>
                    {lv.state}
                  </span>
                </div>
                <p className="mt-1 text-[11px] font-medium text-gray-600">{lv.subtitle}</p>
                <p className="mt-0.5 text-[10px] text-gray-400">{lv.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

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

// A mini status block inside the full-width Protocol Conformance card.
function MiniStat({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note: string
  tone: 'emerald' | 'gray'
}) {
  const valueColor = tone === 'emerald' ? 'text-emerald-700' : 'text-gray-700'
  return (
    <div className="rounded-md border border-gray-200 bg-white/70 px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-0.5 text-xs font-bold ${valueColor}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-gray-400">{note}</div>
    </div>
  )
}
