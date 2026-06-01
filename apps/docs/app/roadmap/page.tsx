import type { Metadata } from 'next'
import Link from 'next/link'
import { RoadmapMilestones } from '@/components/protocol/RoadmapMilestones'

export const metadata: Metadata = {
  title: 'Roadmap — BANZA Protocol',
  description:
    'BANZA protocol roadmap — M1 complete (protocol kernel, federation, certification, trust), M2 active (production deployment), M3 next (open ecosystem).',
}

interface BanzAIItem {
  id: string
  title: string
  status: 'completed' | 'in-progress' | 'planned' | 'research' | 'vision'
  description: string
  tags?: string[]
}

const BANZAI_ITEMS: BanzAIItem[] = [
  { id: 'r1',  status: 'completed',   title: 'Protocol Knowledge Base',       description: 'RAG pipeline over protocol documents — RFCs, ADRs, OpenAPI specs, invariants, SDK docs.', tags: ['RAG', 'Qdrant'] },
  { id: 'r2',  status: 'completed',   title: 'Authority Ranking',              description: 'Source-type authority weights applied to retrieval. Canonical sources rank above commentary.', tags: ['Retrieval'] },
  { id: 'r3',  status: 'completed',   title: 'Hybrid Retrieval',               description: 'Primary vector search with keyword fallback when max similarity < 0.45.', tags: ['Retrieval'] },
  { id: 'r4',  status: 'completed',   title: 'Protocol Graph',                 description: '10 node types, 8 relationship types. Indexed from markdown cross-references.', tags: ['Graph'] },
  { id: 'r5',  status: 'completed',   title: 'Graph Explorer',                 description: 'Interactive protocol graph navigation with search, type filters, and node detail.', tags: ['UI', 'Graph'] },
  { id: 'r6',  status: 'completed',   title: 'Agentic Protocol Research',      description: 'Multi-step research: plan → primary retrieval → graph traversal → secondary retrieval → contradiction detection → synthesis.', tags: ['Agent'] },
  { id: 'r7',  status: 'completed',   title: 'Certification Copilot',          description: 'L0–L4 readiness analysis, readiness score, missing requirements, roadmap with effort estimates.', tags: ['Certification'] },
  { id: 'r8',  status: 'completed',   title: 'Quality Dashboard',              description: 'Public metrics — retrieval quality, KB coverage, graph stats. Trust through measurement.', tags: ['Quality'] },
  { id: 'r9',  status: 'completed',   title: 'Protocol Simulator',             description: 'Simulate capability additions before implementation. See readiness delta and certification impact.', tags: ['Simulation'] },
  { id: 'r10', status: 'completed',   title: 'Federation Intelligence',        description: 'Operator-to-operator compatibility analysis. Compatibility score, conflicts, next actions.', tags: ['Federation'] },
  { id: 'r11', status: 'completed',   title: 'Protocol Memory',                description: 'Operator journey history — assessments, certification milestones, research history.', tags: ['Memory'] },
  { id: 'r12', status: 'completed',   title: 'Operator Digital Twin',          description: 'Protocol-aware virtual representation: certification, federation, invariants, trajectory.', tags: ['Digital Twin'] },
  { id: 'r13', status: 'completed',   title: 'Grounded Citations',             description: 'Every answer cites exact sources with authority scores. Deterministic tools verify protocol truth.', tags: ['Trust'] },
  { id: 'r14', status: 'completed',   title: 'Conformance Validation',         description: 'Manifest validation, conformance checks, trace analysis — tool-verified, not AI-inferred.', tags: ['Tooling'] },
  { id: 'r15', status: 'in-progress', title: 'Live AI Deployment',             description: 'vLLM model backend integration for production model routing. Mock mode → live mode migration.', tags: ['Infrastructure'] },
  { id: 'r16', status: 'in-progress', title: 'Federation Protocol (RFC-0008)', description: 'Full RFC-0008 implementation — federation discovery, cross-operator event exchange, manifest handshake.', tags: ['Federation', 'RFC'] },
  { id: 'r17', status: 'planned',     title: 'Persistent Memory Store',        description: 'Replace in-memory operator memory with durable storage.', tags: ['Memory', 'Infrastructure'] },
  { id: 'r18', status: 'planned',     title: 'Real-time Conformance Monitoring', description: 'Continuous conformance checks against live operator endpoints.', tags: ['Conformance', 'Monitoring'] },
  { id: 'r19', status: 'planned',     title: 'Multi-Operator Federation Graph', description: 'Visualise the live federation network. Which operators can federate with whom?', tags: ['Federation', 'Graph'] },
  { id: 'r20', status: 'planned',     title: 'SDK Intelligence Assistant',     description: 'TypeScript and Flutter SDK-specific guidance. Code generation, integration patterns.', tags: ['SDK', 'Agent'] },
  { id: 'r21', status: 'research',    title: 'Autonomous Certification',       description: 'BanzAI submits, monitors, and completes certification on behalf of an operator with human-in-the-loop approval.', tags: ['Agent', 'Certification'] },
  { id: 'r22', status: 'research',    title: 'Predictive Readiness',           description: 'Given current velocity of operator changes, predict when they will reach each certification level.', tags: ['Analytics'] },
  { id: 'r23', status: 'vision',      title: 'Ecosystem-level Intelligence',   description: 'Aggregate insights across all operators — identify ecosystem-wide certification patterns.', tags: ['Vision'] },
]

const STATUS_CONFIG = {
  completed:    { label: 'Completed',    dot: 'bg-green-500',  badge: 'bg-green-50 text-green-700 border-green-200',          icon: '✓' },
  'in-progress':{ label: 'In Progress',  dot: 'bg-bz-primary', badge: 'bg-bz-primary-light text-bz-primary border-bz-primary/20', icon: '•' },
  planned:      { label: 'Planned',      dot: 'bg-blue-500',   badge: 'bg-blue-50 text-blue-700 border-blue-200',             icon: '○' },
  research:     { label: 'Research',     dot: 'bg-amber-500',  badge: 'bg-amber-50 text-amber-700 border-amber-200',          icon: '◈' },
  vision:       { label: 'Future Vision',dot: 'bg-bz-gold',    badge: 'bg-bz-gold-light text-amber-800 border-bz-gold/30',    icon: '◇' },
}

function BanzAICard({ item }: { item: BanzAIItem }) {
  const cfg = STATUS_CONFIG[item.status]
  return (
    <div className="flex items-start gap-3 rounded-xl border border-bz-border bg-white p-4 shadow-sm">
      <span className={`mt-0.5 shrink-0 w-4 text-sm font-bold text-center ${
        item.status === 'completed'   ? 'text-green-600' :
        item.status === 'in-progress' ? 'text-bz-primary' :
        item.status === 'research'    ? 'text-amber-600' :
        item.status === 'vision'      ? 'text-amber-400' : 'text-blue-500'
      }`}>{cfg.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-bz-text">{item.title}</div>
        <div className="mt-1 text-xs text-bz-muted leading-relaxed">{item.description}</div>
        {item.tags && (
          <div className="flex flex-wrap gap-1 mt-2">
            {item.tags.map(t => (
              <span key={t} className="rounded px-1.5 py-0.5 text-[10px] font-mono bg-bz-surface border border-bz-border text-bz-muted">{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function RoadmapPage() {
  const grouped = {
    completed:    BANZAI_ITEMS.filter(i => i.status === 'completed'),
    'in-progress':BANZAI_ITEMS.filter(i => i.status === 'in-progress'),
    planned:      BANZAI_ITEMS.filter(i => i.status === 'planned'),
    research:     BANZAI_ITEMS.filter(i => i.status === 'research'),
    vision:       BANZAI_ITEMS.filter(i => i.status === 'vision'),
  } as const

  return (
    <div className="px-5 py-10 md:px-10">
      {/* Breadcrumb */}
      <div className="mb-8 flex items-center gap-2 text-xs text-bz-muted">
        <Link href="/" className="hover:text-bz-primary">BANZA</Link>
        <span>/</span>
        <span>Roadmap</span>
      </div>

      {/* Protocol milestones */}
      <div className="mb-14 max-w-3xl">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
          Protocol roadmap
        </div>
        <h1 className="mb-3 text-3xl font-bold tracking-tight text-bz-text">
          BANZA Protocol Roadmap
        </h1>
        <p className="mb-8 max-w-2xl text-bz-muted leading-relaxed">
          The protocol kernel, certification framework, federation protocol, and trust architecture (M1)
          are complete. Production deployment (M2) is active.
        </p>
        <RoadmapMilestones />
      </div>

      {/* BanzAI roadmap */}
      <div className="max-w-3xl">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-gold">
          BanzAI roadmap
        </div>
        <h2 className="mb-3 text-2xl font-bold tracking-tight text-bz-text">
          Protocol Operating System
        </h2>
        <p className="mb-6 max-w-2xl text-bz-muted leading-relaxed">
          BanzAI is the Protocol OS — Understand · Explain · Validate · Simulate · Evaluate · Federate.
          We publish this transparently because trust begins with visibility.
        </p>

        {/* Legend */}
        <div className="mb-6 flex flex-wrap gap-2">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <div key={key} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${cfg.badge}`}>
              <span>{cfg.icon}</span>
              <span>{cfg.label}</span>
            </div>
          ))}
        </div>

        {/* BanzAI sections */}
        {(Object.entries(grouped) as Array<[keyof typeof grouped, BanzAIItem[]]>).map(([status, items]) => {
          if (items.length === 0) return null
          const cfg = STATUS_CONFIG[status]
          return (
            <section key={status} className="mb-10">
              <div className="flex items-center gap-2.5 mb-4">
                <div className={`h-3 w-3 rounded-full ${cfg.dot}`} />
                <h3 className="text-sm font-bold uppercase tracking-wider text-bz-text">{cfg.label}</h3>
                <span className="text-xs text-bz-muted">({items.length})</span>
              </div>
              <div className="space-y-2.5">
                {items.map(item => <BanzAICard key={item.id} item={item} />)}
              </div>
            </section>
          )
        })}

        {/* CTA */}
        <div className="rounded-2xl border border-bz-border bg-white p-6 mt-8">
          <h3 className="text-base font-bold text-bz-text mb-2">Try BanzAI</h3>
          <p className="text-sm text-bz-muted mb-4">
            All modules marked Completed are available now. Open BanzAI and explore the protocol.
          </p>
          <Link
            href="/banzai"
            className="inline-flex items-center gap-2 rounded-lg bg-bz-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M6 1l1.2 3.8H11l-3 2.2 1.1 3.6L6 8.3 2.9 10.6 4 7 1 4.8h3.8z" fill="currentColor"/>
            </svg>
            Open BanzAI
          </Link>
        </div>
      </div>
    </div>
  )
}
