import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Roadmap — BanzamIA Protocol Operating System',
  description:
    'Public roadmap for BanzamIA — the AI-native Protocol Agent and Protocol Operating System for the Banzami ecosystem. Transparent evolution of ecosystem intelligence.',
}

interface RoadmapItem {
  id: string
  title: string
  status: 'completed' | 'in-progress' | 'planned' | 'research' | 'vision'
  description: string
  tags?: string[]
}

const ITEMS: RoadmapItem[] = [
  // Completed
  { id: 'r1',  status: 'completed', title: 'Protocol Knowledge Base',       description: 'RAG pipeline over protocol documents — RFCs, ADRs, OpenAPI specs, invariants, SDK docs.', tags: ['RAG', 'Qdrant'] },
  { id: 'r2',  status: 'completed', title: 'Authority Ranking',              description: 'Source-type authority weights (0.50–1.00) applied to retrieval. Canonical sources rank above commentary.', tags: ['Retrieval'] },
  { id: 'r3',  status: 'completed', title: 'Hybrid Retrieval',               description: 'Primary vector search with keyword fallback when max similarity < 0.45.', tags: ['Retrieval'] },
  { id: 'r4',  status: 'completed', title: 'Protocol Graph',                 description: '10 node types, 8 relationship types. Indexed from markdown cross-references.', tags: ['Graph'] },
  { id: 'r5',  status: 'completed', title: 'Graph Explorer',                 description: 'Interactive protocol graph navigation with search, type filters, and node detail.', tags: ['UI', 'Graph'] },
  { id: 'r6',  status: 'completed', title: 'Agentic Protocol Research',      description: 'Multi-step research: plan → primary retrieval → graph traversal → secondary retrieval → contradiction detection → synthesis.', tags: ['Agent', 'Multi-hop'] },
  { id: 'r7',  status: 'completed', title: 'Certification Copilot',          description: 'L0–L4 readiness analysis, readiness score, missing requirements, roadmap with effort estimates.', tags: ['Certification'] },
  { id: 'r8',  status: 'completed', title: 'Quality Dashboard',              description: 'Public metrics — retrieval quality, KB coverage, graph stats, analytics. Trust through measurement.', tags: ['Quality'] },
  { id: 'r9',  status: 'completed', title: 'Protocol Simulator',             description: 'Simulate capability additions before implementation. See readiness delta and certification impact.', tags: ['Simulation'] },
  { id: 'r10', status: 'completed', title: 'Federation Intelligence',        description: 'Operator-to-operator compatibility analysis. Compatibility score, conflicts, blocking issues, next actions.', tags: ['Federation'] },
  { id: 'r11', status: 'completed', title: 'Protocol Memory',                description: 'Operator journey history — assessments, certification milestones, research history, timeline.', tags: ['Memory'] },
  { id: 'r12', status: 'completed', title: 'Operator Digital Twin',          description: 'Protocol-aware virtual representation: certification, federation, invariants, RFCs, trajectory, recommendations.', tags: ['Digital Twin'] },
  { id: 'r13', status: 'completed', title: 'Grounded Citations',             description: 'Every answer cites exact sources with authority scores. Deterministic tools verify protocol truth.', tags: ['Trust'] },
  { id: 'r14', status: 'completed', title: 'Conformance Validation',         description: 'Manifest validation, conformance checks, trace analysis — tool-verified, not AI-inferred.', tags: ['Tooling'] },
  // In progress
  { id: 'r15', status: 'in-progress', title: 'Live AI Deployment',           description: 'vLLM model backend integration for production model routing. Mock mode → live mode migration.', tags: ['Infrastructure'] },
  { id: 'r16', status: 'in-progress', title: 'Federation Protocol (RFC-0008)', description: 'Full RFC-0008 implementation — federation discovery, cross-operator event exchange, manifest handshake.', tags: ['Federation', 'RFC'] },
  // Planned
  { id: 'r17', status: 'planned', title: 'Persistent Memory Store',          description: 'Replace in-memory operator memory with durable storage — Postgres or Qdrant metadata.', tags: ['Memory', 'Infrastructure'] },
  { id: 'r18', status: 'planned', title: 'Real-time Conformance Monitoring', description: 'Continuous conformance checks against live operator endpoints. Alert on invariant violations.', tags: ['Conformance', 'Monitoring'] },
  { id: 'r19', status: 'planned', title: 'Multi-Operator Federation Graph',  description: 'Visualise the live federation network. Which operators can federate with whom?', tags: ['Federation', 'Graph', 'UI'] },
  { id: 'r20', status: 'planned', title: 'SDK Intelligence Assistant',       description: 'TypeScript and Flutter SDK-specific guidance. Code generation, integration patterns, error diagnosis.', tags: ['SDK', 'Agent'] },
  { id: 'r21', status: 'planned', title: 'Webhook Intelligence',             description: 'Parse and explain webhook payloads. Detect missing correlation_id, trace propagation gaps.', tags: ['Tooling'] },
  // Research
  { id: 'r22', status: 'research', title: 'Autonomous Certification',        description: 'BanzamIA submits, monitors, and completes certification on behalf of an operator with human-in-the-loop approval.', tags: ['Agent', 'Certification'] },
  { id: 'r23', status: 'research', title: 'Multi-Agent Protocol Reasoning',  description: 'Parallel agent swarm — one for retrieval, one for graph traversal, one for invariant checking. Consensus synthesis.', tags: ['Agent', 'Research'] },
  { id: 'r24', status: 'research', title: 'Predictive Readiness',            description: 'Given current velocity of operator changes, predict when they will reach each certification level.', tags: ['Memory', 'Analytics'] },
  { id: 'r25', status: 'research', title: 'Protocol Change Impact Analysis', description: 'When a new RFC is published, automatically identify all affected operators and certification levels.', tags: ['Protocol', 'Graph'] },
  // Vision
  { id: 'r26', status: 'completed', title: 'Protocol Operating System',       description: 'BanzamIA is the Protocol Operating System — Compreender, Explicar, Validar, Simular, Prever, Guiar, Certificar, Federar. 16 modules. Tools determine truth. AI explains truth.', tags: ['Protocol OS'] },
  { id: 'r27', status: 'vision', title: 'Ecosystem-level Intelligence',      description: 'Aggregate insights across all operators — identify ecosystem-wide certification patterns, bottlenecks, and opportunities.', tags: ['Vision', 'Analytics'] },
  { id: 'r28', status: 'vision', title: 'Self-improving Knowledge Base',     description: 'BanzamIA identifies gaps in its own knowledge base and proposes new documentation to fill them.', tags: ['Vision', 'RAG'] },
]

const STATUS_CONFIG = {
  completed:   { label: 'Completed',    dot: 'bg-bia-green',    badge: 'bg-bia-green/10 text-bia-green border-bia-green/30',      icon: '✓' },
  'in-progress': { label: 'In Progress', dot: 'bg-bia-primary',  badge: 'bg-bia-primary/10 text-bia-primary border-bia-primary/20', icon: '•' },
  planned:     { label: 'Planned',      dot: 'bg-blue-500',     badge: 'bg-blue-50 text-blue-700 border-blue-200',                icon: '○' },
  research:    { label: 'Research',     dot: 'bg-amber-500',    badge: 'bg-amber-50 text-amber-700 border-amber-200',             icon: '◈' },
  vision:      { label: 'Future Vision',dot: 'bg-bia-gold',     badge: 'bg-bia-gold/10 text-bia-gold border-bia-gold/30',         icon: '◇' },
}

function RoadmapCard({ item }: { item: RoadmapItem }) {
  const cfg = STATUS_CONFIG[item.status]
  return (
    <div className="flex items-start gap-3 rounded-xl border border-bz-border bg-white p-4 shadow-sm">
      <span className={`mt-0.5 shrink-0 text-sm font-bold w-4 text-center ${
        item.status === 'completed' ? 'text-green-600' :
        item.status === 'in-progress' ? 'text-bz-primary' :
        item.status === 'research' ? 'text-amber-600' :
        item.status === 'vision' ? 'text-amber-400' : 'text-blue-500'
      }`}>{cfg.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-bz-text">{item.title}</div>
        <div className="text-xs text-bz-muted mt-1 leading-relaxed">{item.description}</div>
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
    completed:    ITEMS.filter(i => i.status === 'completed'),
    'in-progress': ITEMS.filter(i => i.status === 'in-progress'),
    planned:      ITEMS.filter(i => i.status === 'planned'),
    research:     ITEMS.filter(i => i.status === 'research'),
    vision:       ITEMS.filter(i => i.status === 'vision'),
  } as const

  return (
    <div className="px-5 py-10 md:px-10 max-w-3xl">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-2 text-xs text-bz-muted mb-3">
          <Link href="/" className="hover:text-bz-primary">Banzami</Link>
          <span>/</span>
          <Link href="/banzamia" className="hover:text-bz-primary">BanzamIA</Link>
          <span>/</span>
          <span>Roadmap</span>
        </div>
        <h1 className="text-3xl font-bold text-bz-text mb-3">BanzamIA Roadmap</h1>
        <p className="text-bz-muted leading-relaxed max-w-2xl">
          Public roadmap for BanzamIA — the AI-native Protocol Agent and Protocol Operating System
          for the Banzami ecosystem. We publish this transparently because trust begins with visibility.
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-bz-border bg-white px-4 py-3">
          <span className="text-bz-gold font-semibold text-sm">Protocol Operating System</span>
          <span className="text-bz-muted text-xs">—</span>
          <span className="text-bz-muted text-xs">Understand · Explain · Validate · Simulate · Predict · Guide</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-8">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <div key={key} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${cfg.badge}`}>
            <span>{cfg.icon}</span>
            <span>{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* Sections */}
      {(Object.entries(grouped) as Array<[keyof typeof grouped, RoadmapItem[]]>).map(([status, items]) => {
        const cfg = STATUS_CONFIG[status]
        return (
          <section key={status} className="mb-10">
            <div className="flex items-center gap-2.5 mb-4">
              <div className={`h-3 w-3 rounded-full ${cfg.dot}`} />
              <h2 className="text-sm font-bold uppercase tracking-wider text-bz-text">{cfg.label}</h2>
              <span className="text-xs text-bz-muted">({items.length})</span>
            </div>
            <div className="space-y-2.5">
              {items.map(item => <RoadmapCard key={item.id} item={item} />)}
            </div>
          </section>
        )
      })}

      {/* CTA */}
      <div className="mt-10 rounded-2xl border border-bz-border bg-white p-6">
        <h3 className="text-base font-bold text-bz-text mb-2">Experimente o BanzamIA</h3>
        <p className="text-sm text-bz-muted mb-4">
          Todos os módulos marcados como Completed estão disponíveis agora.
          Aceda ao BanzamIA e explore o protocolo.
        </p>
        <Link
          href="/banzamia"
          className="inline-flex items-center gap-2 rounded-lg bg-bz-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
            <path d="M6 1l1.2 3.8H11l-3 2.2 1.1 3.6L6 8.3 2.9 10.6 4 7 1 4.8h3.8z" fill="currentColor"/>
          </svg>
          Abrir BanzamIA
        </Link>
      </div>
    </div>
  )
}
