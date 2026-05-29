// BanzamIA API client
// Mode detection:
//   Demo Mode         — NEXT_PUBLIC_BANZAMIA_API_URL is not set
//   Live API No Model — API set, models not configured
//   Live AI Mode      — API set + RunPod/vLLM configured

export const BANZAMIA_API_URL = (
  process.env.NEXT_PUBLIC_BANZAMIA_API_URL ?? ''
).replace(/\/$/, '')

export const isLiveMode = !!process.env.NEXT_PUBLIC_BANZAMIA_API_URL

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface Citation {
  type: 'rfc' | 'adr' | 'api' | 'invariant' | 'file' | 'vector'
  label: string
  ref: string
}

export interface SystemStatus {
  mode: string
  api: 'ok' | 'unavailable'
  models: { qwen: string; qwen_coder: string; deepseek: string }
  provider: { name: string; available: boolean }
  tools: Record<string, string>
  rag: { index: string; backend: string }
}

// ─── Live API helpers ─────────────────────────────────────────────────────────

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BANZAMIA_API_URL}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(`BanzamIA API ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

// ─── Chat / SSE ───────────────────────────────────────────────────────────────

export async function chatStream(
  messages: ChatMessage[],
  onChunk: (text: string, meta?: { model: string; taskType: string; actual_provider?: string }) => void,
  onCitations: (citations: Citation[]) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!isLiveMode) {
    return _demoStream(messages, onChunk, onCitations, signal)
  }

  let res: Response
  try {
    res = await fetch(`${BANZAMIA_API_URL}/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages }),
      signal,
    })
  } catch {
    // API unreachable — fall back to demo
    return _demoStream(messages, onChunk, onCitations, signal)
  }

  if (!res.ok || !res.body) {
    return _demoStream(messages, onChunk, onCitations, signal)
  }

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer    = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') return
      try {
        const parsed = JSON.parse(data) as {
          type?: string
          text?: string
          intended_model?: string
          actual_provider?: string
          taskType?: string
          // legacy format
          model?: string
        }
        if (parsed.type === 'routing' || (parsed.intended_model ?? parsed.model)) {
          // Routing metadata — emit with first empty chunk to propagate meta
          const model    = parsed.intended_model ?? parsed.model ?? ''
          const taskType = parsed.taskType ?? ''
          const provider = parsed.actual_provider
          if (model) onChunk('', { model, taskType, actual_provider: provider })
        } else if (parsed.type === 'text' && parsed.text) {
          onChunk(parsed.text)
        } else if (!parsed.type && parsed.text) {
          // legacy text chunk
          onChunk(parsed.text)
        }
      } catch { /* ignore malformed */ }
    }
  }
}

// ─── Manifest validation ──────────────────────────────────────────────────────

export interface ManifestValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  sandbox_safety: { pass: boolean; issues: string[] }
  capability_check: { pass: boolean; issues: string[] }
  missing_required_fields: string[]
  federation_readiness: string
  certification_level_declared: number | null
}

export async function validateManifest(manifest: unknown): Promise<ManifestValidationResult> {
  if (!isLiveMode) return _demoManifestValidation(manifest)
  try {
    return await post<ManifestValidationResult>('/validate/manifest', { manifest })
  } catch {
    return _demoManifestValidation(manifest)
  }
}

// ─── Conformance ──────────────────────────────────────────────────────────────

export interface ConformanceResult {
  status: string
  target_url?: string
  level?: number
  message: string
  suites?: Array<{ id: string; name: string; status?: string; invariant?: string }>
  summary?: { total: number; passed: number; failed: number; skipped: number; certification_level_achieved: number | null }
}

export async function runConformance(targetUrl: string, level: number): Promise<ConformanceResult> {
  if (!isLiveMode) {
    return { status: 'not_configured', message: 'Conformance runner requires Live API mode.', target_url: targetUrl, level }
  }
  try {
    return await post<ConformanceResult>('/conformance/run', { target_url: targetUrl, level })
  } catch {
    return { status: 'error', message: 'API unreachable.', target_url: targetUrl, level }
  }
}

// ─── Trace explain ────────────────────────────────────────────────────────────

export interface TraceExplainResult {
  trace_id: string | null
  flow_type: string
  event_count: number
  timeline: Array<{ step: number; entity_type: string; entity_id: string; timestamp?: string; detail: string }>
  invariant_checks: Array<{ id: string; name: string; status: 'PASS' | 'FAIL' | 'UNKNOWN'; reason: string }>
  causal_summary: string
  issues: string[]
}

export async function explainTrace(input: { trace_id?: string; trace?: unknown }): Promise<TraceExplainResult> {
  if (!isLiveMode) {
    return { trace_id: null, flow_type: 'unknown', event_count: 0, timeline: [], invariant_checks: [],
      causal_summary: 'Trace Explainer requires Live API mode.', issues: ['Live API not configured'] }
  }
  try {
    return await post<TraceExplainResult>('/trace/explain', input)
  } catch {
    return { trace_id: null, flow_type: 'unknown', event_count: 0, timeline: [], invariant_checks: [],
      causal_summary: 'API unreachable.', issues: ['API unreachable'] }
  }
}

// ─── SDK generation ───────────────────────────────────────────────────────────

export interface SdkGenerateResult {
  language: string
  feature: string
  code: string
  explanation: string
  api_paths: string[]
  docs_references: string[]
}

export async function generateSdk(language: string, feature: string): Promise<SdkGenerateResult> {
  if (!isLiveMode) {
    return { language, feature, code: '// SDK generation requires Live API mode.', explanation: '', api_paths: [], docs_references: [] }
  }
  try {
    return await post<SdkGenerateResult>('/sdk/generate', { language, feature })
  } catch {
    return { language, feature, code: '// API unreachable.', explanation: '', api_paths: [], docs_references: [] }
  }
}

// ─── Knowledge search ─────────────────────────────────────────────────────────

export interface KnowledgeResult {
  id: string
  title: string
  path: string
  snippet: string
  type: string
  score: number
}

export interface KnowledgeSearchResponse {
  results: KnowledgeResult[]
  total: number
  query: string
  backend: string
}

export async function searchKnowledge(query: string): Promise<KnowledgeSearchResponse> {
  if (!isLiveMode) {
    return { results: _demoKnowledgeSearch(query), total: 3, query, backend: 'demo' }
  }
  try {
    return await post<KnowledgeSearchResponse>('/knowledge/search', { query })
  } catch {
    return { results: _demoKnowledgeSearch(query), total: 3, query, backend: 'demo-fallback' }
  }
}

// ─── Status ───────────────────────────────────────────────────────────────────

export async function getSystemStatus(): Promise<SystemStatus> {
  const unavailable: SystemStatus = {
    mode: 'live-api-no-model',
    api: 'unavailable',
    models: { qwen: 'not_configured', qwen_coder: 'not_configured', deepseek: 'not_configured' },
    provider: { name: 'unknown', available: false },
    tools: {},
    rag: { index: 'not_indexed', backend: 'keyword' },
  }

  if (!isLiveMode) {
    return { ...unavailable, mode: 'demo', api: 'unavailable', provider: { name: 'demo', available: true } }
  }

  try {
    const res = await fetch(`${BANZAMIA_API_URL}/status`, { cache: 'no-store' })
    if (res.ok) return res.json() as Promise<SystemStatus>
  } catch { /* fall through */ }

  return unavailable
}

// ─── Protocol Graph ───────────────────────────────────────────────────────────

export interface GraphNodeClient {
  id: string
  type: string
  title: string
  path: string
  status: string
  summary: string
  authority: number
}

export interface GraphEdgeClient {
  from: string
  to: string
  relationship: string
  reason?: string
}

export interface GraphNeighbourClient {
  node: GraphNodeClient
  relationship: string
  direction: 'outbound' | 'inbound'
}

export interface GraphStatsResponse {
  node_count: number
  edge_count: number
  indexed_at: string
  nodes_by_type: Record<string, number>
  edges_by_relationship: Record<string, number>
}

export interface GraphNodeResponse {
  node: GraphNodeClient
  neighbours: GraphNeighbourClient[]
}

export interface GraphSearchResponse {
  query: string
  count: number
  nodes: GraphNodeClient[]
}

export interface GraphRelatedResponse {
  node: GraphNodeClient
  depth: number
  related_count: number
  related: GraphNodeClient[]
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BANZAMIA_API_URL}${path}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`BanzamIA API ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

export async function getGraphStats(): Promise<GraphStatsResponse | null> {
  if (!isLiveMode) return _demoGraphStats()
  try { return await get<GraphStatsResponse>('/graph/stats') }
  catch { return _demoGraphStats() }
}

export async function getGraphNode(id: string): Promise<GraphNodeResponse | null> {
  if (!isLiveMode) return _demoGraphNode(id)
  try { return await get<GraphNodeResponse>(`/graph/node/${encodeURIComponent(id)}`) }
  catch { return _demoGraphNode(id) }
}

export async function searchGraph(q: string): Promise<GraphSearchResponse> {
  if (!isLiveMode) return _demoGraphSearch(q)
  try { return await get<GraphSearchResponse>(`/graph/search?q=${encodeURIComponent(q)}`) }
  catch { return _demoGraphSearch(q) }
}

export async function getGraphRelated(id: string, depth = 2): Promise<GraphRelatedResponse | null> {
  if (!isLiveMode) return null
  try { return await get<GraphRelatedResponse>(`/graph/related/${encodeURIComponent(id)}?depth=${depth}`) }
  catch { return null }
}

// ─── Protocol Research ────────────────────────────────────────────────────────

export interface ResearchStep {
  step: number
  type: 'plan' | 'retrieval' | 'graph' | 'tool' | 'synthesis'
  description: string
  sources_found?: number
  nodes_found?: number
  duration_ms?: number
}

export interface ResearchEvidence {
  source_path: string
  source_type: string
  title: string
  excerpt: string
  authority: number
  score: number
}

export interface ResearchReport {
  question: string
  answer: string
  steps: ResearchStep[]
  evidence: ResearchEvidence[]
  graph_nodes: Array<{ id: string; title: string; type: string }>
  relationship_chains: string[]
  contradictions: Array<{ sources: string[]; topic: string; description: string }>
  authority_summary: { highest: number; avg: number; sources_used: number }
  research_quality: 'high' | 'medium' | 'low'
  model: string
  duration_ms: number
}

export async function researchQuestion(question: string): Promise<ResearchReport> {
  if (!isLiveMode) return _demoResearch(question)
  try { return await post<ResearchReport>('/research', { question }) }
  catch { return _demoResearch(question) }
}

// ─── Certification Copilot ────────────────────────────────────────────────────

export interface LevelRequirement {
  id: string
  description: string
  rfc?: string
  adr?: string
  capability?: string
}

export interface LevelStatus {
  level: number
  name: string
  status: 'achieved' | 'partial' | 'blocked'
  missing: LevelRequirement[]
  achieved_count: number
  total_count: number
}

export interface CopilotResult {
  current_level: number
  target_level: number
  readiness_score: number
  level_statuses: LevelStatus[]
  missing_for_target: LevelRequirement[]
  next_actions: string[]
  roadmap: Array<{ from_level: number; to_level: number; steps: string[]; estimated_effort: string }>
  certification_ready: boolean
  blocking_issues: string[]
}

export async function certificationCopilot(input: {
  manifest?: Record<string, unknown>
  capabilities?: string[]
  conformance_results?: Array<{ id: string; status: 'PASS' | 'FAIL' | 'SKIP'; level: number }>
  target_level?: number
}): Promise<CopilotResult> {
  if (!isLiveMode) return _demoCopilot(input)
  try { return await post<CopilotResult>('/certification/copilot', input) }
  catch { return _demoCopilot(input) }
}

// ─── RAG Stats ────────────────────────────────────────────────────────────────

export interface RagStatsResponse {
  generated_at: string
  knowledge_base: { documents_indexed: number; chunks_indexed: number; last_indexed_at: string | null; embedding_provider: string; embedding_dims: number }
  query_analytics: {
    total_queries: number
    avg_latency_ms: number
    weak_retrieval_rate: number
    avg_citations: number
    avg_top_authority: number
    task_type_distribution: Record<string, number>
    top_sources: Array<{ source_type: string; count: number }>
  } | null
  protocol_graph: GraphStatsResponse | null
}

export async function getRagStats(): Promise<RagStatsResponse> {
  if (!isLiveMode) return _demoRagStats()
  try { return await get<RagStatsResponse>('/rag/stats') }
  catch { return _demoRagStats() }
}

// ─── Protocol Simulator ───────────────────────────────────────────────────────

export interface SimulationChange {
  type: 'add_capability' | 'remove_capability' | 'update_manifest'
  capability?: string
  manifest_patch?: Record<string, unknown>
}

export interface SimulatorResult {
  before: CopilotResult
  after: CopilotResult
  readiness_delta: number
  applied_changes: string[]
  new_capabilities: string[]
  removed_capabilities: string[]
  certification_impact: {
    level_unlocked: boolean
    new_level: number
    requirements_satisfied: string[]
    requirements_still_missing: string[]
  }
  federation_impact: {
    eligible_before: boolean
    eligible_after: boolean
    newly_eligible: boolean
  }
  estimated_effort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'extensive'
  summary: string
}

export async function runSimulation(input: {
  manifest: Record<string, unknown>
  capabilities: string[]
  target_level: number
  proposed_changes: SimulationChange[]
}): Promise<SimulatorResult> {
  if (!isLiveMode) return _demoSimulation(input)
  try { return await post<SimulatorResult>('/simulate', input) }
  catch { return _demoSimulation(input) }
}

// ─── Federation Intelligence ──────────────────────────────────────────────────

export interface CompatibilityConflict {
  field: string
  operator_a_value: unknown
  operator_b_value: unknown
  description: string
}

export interface FederationResult {
  operator_a_id: string
  operator_b_id: string
  compatibility_score: number
  federation_ready: boolean
  operator_a_level: number
  operator_b_level: number
  shared_capabilities: string[]
  missing_in_a: string[]
  missing_in_b: string[]
  conflicts: CompatibilityConflict[]
  blocking_issues: string[]
  suggested_next_actions: string[]
  analysis_notes: string[]
  estimated_effort_a: string
  estimated_effort_b: string
}

export async function analyzeFederation(input: {
  operator_a: { operator_id: string; manifest: Record<string, unknown>; capabilities: string[] }
  operator_b: { operator_id: string; manifest: Record<string, unknown>; capabilities: string[] }
}): Promise<FederationResult> {
  if (!isLiveMode) return _demoFederation(input)
  try { return await post<FederationResult>('/federation/analyze', input) }
  catch { return _demoFederation(input) }
}

// ─── Protocol Memory ──────────────────────────────────────────────────────────

export interface TimelineEvent {
  date: string
  type: 'assessment' | 'certification' | 'federation' | 'conformance' | 'research' | 'manifest_change'
  title: string
  detail?: string
  level?: number
  score?: number
}

export interface OperatorMemory {
  operator_id: string
  created_at: string
  updated_at: string
  current_manifest: Record<string, unknown>
  current_capabilities: string[]
  current_level: number
  assessments: Array<{
    timestamp: string
    target_level: number
    readiness_score: number
    current_level: number
    missing_count: number
    capabilities: string[]
  }>
  timeline: TimelineEvent[]
  research_history: Array<{ question: string; timestamp: string }>
  notes: string[]
}

export async function getOperatorMemory(operatorId: string): Promise<OperatorMemory | null> {
  if (!isLiveMode) return _demoMemory(operatorId)
  try { return await get<OperatorMemory>(`/memory/${encodeURIComponent(operatorId)}`) }
  catch { return _demoMemory(operatorId) }
}

export async function saveOperatorMemory(
  operatorId: string,
  payload: { note?: string }
): Promise<OperatorMemory> {
  if (!isLiveMode) return _demoMemory(operatorId)!
  try { return await post<OperatorMemory>(`/memory/${encodeURIComponent(operatorId)}`, payload) }
  catch { return _demoMemory(operatorId)! }
}

// ─── Digital Twin ─────────────────────────────────────────────────────────────

export interface DigitalTwinResult {
  operator_id: string
  snapshot_at: string
  manifest: Record<string, unknown>
  capabilities: string[]
  certification: CopilotResult
  federation_profiles: FederationResult[]
  memory: OperatorMemory
  relevant_invariants: Array<{ invariant_id: string; description: string; relevant: boolean; reason: string }>
  relevant_rfcs: Array<{ rfc_id: string; title: string; relevance: string }>
  recommendations: string[]
  capability_gap_summary: string
  readiness_trajectory: string
}

export async function buildDigitalTwin(input: {
  operator_id: string
  manifest: Record<string, unknown>
  capabilities: string[]
  target_level?: number
  partner_manifests?: Array<{ operator_id: string; manifest: Record<string, unknown>; capabilities: string[] }>
}): Promise<DigitalTwinResult> {
  if (!isLiveMode) return _demoDigitalTwin(input)
  try { return await post<DigitalTwinResult>('/digital-twin', input) }
  catch { return _demoDigitalTwin(input) }
}

// ─── Demo mode ────────────────────────────────────────────────────────────────

const DEMO_RESPONSES: Array<{ pattern: RegExp; model: string; taskType: string; text: string; citations: Citation[] }> = [
  {
    pattern: /o que.*banzami|banzami.*o que|banzami.*é|what is banzami|o que é.*banzami/i,
    model: 'qwen-14b', taskType: 'DOCS',
    text: `**Banzami — A organização por detrás da rede Banza**

A **Banzami** é a organização de infraestrutura financeira que cria e mantém:

- **Banza** — o produto de pagamentos instantâneos em Kwanza por QR Code
- **Banza SDKs** — bibliotecas oficiais TypeScript, Python e Dart para programadores
- **BanzamIA** — interface inteligente para integrar, validar e certificar o ecossistema
- **Core financeiro** — motor em Rust com invariantes de ledger de grau bancário

O Banzami não é um banco. É a camada de infraestrutura protocolar que permite a qualquer app angolana aceitar pagamentos em Kwanza — do táxi à escola, da cantina ao ecommerce.

**Modelo de acesso:**
Operadores certificados integram via SDK oficial. Cada pagamento é uma transferência wallet-to-wallet liquidada instantaneamente e registada no ledger de forma atómica e imutável.`,
    citations: [
      { type: 'file', label: 'BANZAMI_REFERENCE.md', ref: 'docs/BANZAMI_REFERENCE.md' },
      { type: 'adr',  label: 'ADR-016 — Brand architecture', ref: 'docs/adrs/ADR-016.md' },
    ],
  },
  {
    pattern: /diferença|difference|banzami.*banza|banza.*banzami|brand.*archit/i,
    model: 'qwen-14b', taskType: 'DOCS',
    text: `**Banzami vs Banza — Arquitectura de marca (ADR-016)**

| | Banzami | Banza |
|---|---|---|
| O que é | Organização e infraestrutura | O produto de pagamentos |
| Papel | Protocolo, SDKs, certificação | App, QR, carteiras, UI |
| SDK | \`@banzami/sdk\` (organização) | \`@banza/sdk\` (produto) |
| Domínio | banzami.org | app.banza.ao |
| BanzamIA | Pertence à Banzami | Serve os utilizadores Banza |

**Regra de conteúdo (ADR-016):**
- Use **Banzami** para: protocolo, infraestrutura, certificação, SDKs, BanzamIA, organização
- Use **Banza** para: pagamentos, QR codes, carteiras, app móvel, experiência do utilizador

Esta separação é deliberada — distingue a camada de infraestrutura da camada de produto.`,
    citations: [
      { type: 'adr',  label: 'ADR-016 — Brand architecture', ref: 'docs/adrs/ADR-016.md' },
      { type: 'file', label: 'BANZAMI_REFERENCE.md §1', ref: 'docs/BANZAMI_REFERENCE.md' },
    ],
  },
  {
    pattern: /como integrar|primeiros passos|como começar|getting started|integra[çc]/i,
    model: 'qwen-coder-7b', taskType: 'CODE',
    text: `**Como integrar pagamentos Banza — Guia rápido**

**1. Instalar o SDK oficial**

\`\`\`bash
npm install @banza/sdk
# ou: pip install banza-sdk  |  flutter pub add banza_sdk
\`\`\`

**2. Inicializar o cliente**

\`\`\`typescript
import { BanzaClient } from '@banza/sdk'

const client = new BanzaClient({
  operatorId:  'op_your_id',
  apiKey:      process.env.BANZA_API_KEY!,
  environment: 'sandbox', // começar sempre em sandbox
})
\`\`\`

**3. Criar um pagamento QR**

\`\`\`typescript
const qr = await client.qr.create({
  merchantWallet: 'wal_merchant_abc',
  amountMinor:    5000, // 50.00 AOA — sempre em unidades menores (ADR-001)
  currency:       'AOA',
  idempotencyKey: crypto.randomUUID(),
})
// qr.id · qr.url · qr.trace_id (propaga para todo o fluxo)
\`\`\`

Use o módulo **SDK Assistant** no BanzamIA completo para gerar código para o seu caso de uso específico.`,
    citations: [
      { type: 'file', label: '@banza/sdk', ref: 'sdk/typescript/README.md' },
      { type: 'adr',  label: 'ADR-001 — Minor units', ref: 'docs/adrs/ADR-001.md' },
      { type: 'api',  label: 'POST /v1/qr', ref: 'contracts/openapi.yaml' },
    ],
  },
  {
    pattern: /sandbox.*operat|operat.*sandbox|como funciona.*sandbox|sandbox/i,
    model: 'qwen-14b', taskType: 'DOCS',
    text: `**Sandbox Operator — Ambiente de testes isolado**

O ambiente \`sandbox\` permite testar toda a integração sem mover dinheiro real.

**Invariante de segurança sandbox (RFC-006):**
Se \`environment === "sandbox"\` então:
- \`simulated\` **deve** ser \`true\`
- \`production_allowed\` **deve** ser \`false\`

Violar esta invariante bloqueia a validação do manifesto — é uma protecção contra erros que poderiam expor código de sandbox em produção.

**Manifesto sandbox correcto:**

\`\`\`json
{
  "operator_id": "op_test_abc",
  "environment": "sandbox",
  "simulated": true,
  "production_allowed": false,
  "certification_level": 1,
  "protocol_version": "1.0.0"
}
\`\`\`

Use o módulo **Manifest Validator** para verificar o seu manifesto antes de submeter para certificação.`,
    citations: [
      { type: 'rfc',  label: 'RFC-006 — Operator Manifest', ref: 'docs/rfcs/RFC-006.md' },
      { type: 'file', label: 'operator-manifest.schema.json', ref: 'schemas/operator-manifest.schema.json' },
    ],
  },
  {
    pattern: /trace|trace_id|propagat/i,
    model: 'qwen-14b', taskType: 'DOCS',
    text: `**INV-TRACE-001 — Trace ID Propagation**

Every entity in a Banzami payment flow must share the same \`trace_id\`. This is a non-negotiable protocol invariant.

When a QR payment is created:

\`\`\`
QR.trace_id ─── must equal ──► Transfer.trace_id
                               └── must equal ──► LedgerEntry.trace_id
\`\`\`

The \`GET /v1/traces/:trace_id\` endpoint reconstructs the full causal graph.

**Certification:** Required for Level 2 (Settlement Operator).

**Conformance check:** \`traces.propagation\` sub-suite validates this for every test flow.`,
    citations: [
      { type: 'invariant', label: 'INV-TRACE-001', ref: 'conformance/traces/suite.json' },
      { type: 'api', label: 'GET /v1/traces/:trace_id', ref: 'contracts/openapi.yaml' },
      { type: 'rfc', label: 'RFC-007 — Trace Model', ref: 'docs/rfcs/RFC-007.md' },
    ],
  },
  {
    pattern: /invariant|ledger|double.entry|balance|negative|money creation/i,
    model: 'deepseek-r1', taskType: 'REASON',
    text: `**Banzami Financial Invariants**

| ID | Rule |
|----|------|
| INV-LEDGER-001 | Every transfer → one DEBIT + one CREDIT of equal amount |
| INV-LEDGER-002 | No wallet may reach negative balance |
| INV-LEDGER-003 | Confirmed ledger entries are immutable |
| INV-STL-001 | \`net_minor + fee_minor == gross_minor\` (no money creation) |
| INV-STL-002 | Each transfer belongs to exactly one settlement batch |
| INV-TRACE-001 | All entities in a flow share the same \`trace_id\` |

**INV-STL-001 is the most critical:** if \`net + fee ≠ gross\`, money is either created or destroyed.

BanzamIA treats invariant violations as hard findings — never softened, never suppressed.`,
    citations: [
      { type: 'invariant', label: 'INV-LEDGER-001', ref: 'conformance/ledger/suite.json' },
      { type: 'invariant', label: 'INV-STL-001', ref: 'conformance/settlement/suite.json' },
      { type: 'file', label: 'financial-invariants.md', ref: 'contexts/financial-invariants.md' },
    ],
  },
  {
    pattern: /typescript|sdk|code|generate|qr.*pay|pay.*qr|create.*transfer/i,
    model: 'qwen-coder-7b', taskType: 'CODE',
    text: `**TypeScript SDK — QR Payment Flow**

\`\`\`typescript
import { BanzaClient } from '@banza/sdk'

const client = new BanzaClient({
  operatorId:  'op_your_id',
  apiKey:      process.env.BANZA_API_KEY!,
  environment: 'sandbox',
})

// Create QR payment — amount always in minor units (ADR-001)
const qr = await client.qr.create({
  merchantWallet: 'wal_merchant_abc',
  amountMinor:    5000, // 50.00 AOA
  currency:       'AOA',
  idempotencyKey: crypto.randomUUID(),
})

console.log(qr.id)       // qr_xxx
console.log(qr.trace_id) // tr_xxx — propagates to all flow entities
\`\`\`

Use the **SDK Assistant** module for full templates including Python and Dart.`,
    citations: [
      { type: 'api', label: 'POST /v1/qr', ref: 'contracts/openapi.yaml' },
      { type: 'file', label: '@banza/sdk', ref: 'sdk/typescript/README.md' },
    ],
  },
  {
    pattern: /certif|level|conform|operator|suite/i,
    model: 'deepseek-r1', taskType: 'VALIDATE',
    text: `**Operator Certification Levels**

| Level | Name | Requirements |
|-------|------|-------------|
| 0 | Sandbox Operator | health, wallets, transfers |
| 1 | Payment Operator | + QR, payment requests, ledger, settlement |
| 2 | Settlement Operator | + traces, INV-TRACE-001 |
| 3 | Federation Operator | + operator.json manifest |
| 4 | Infrastructure Operator | + all settlement invariants PASS |

**ADR-012:** Certification is always a tool result. Never AI inference.

Use the **Conformance** module to run the suite against your operator.`,
    citations: [
      { type: 'adr', label: 'ADR-012 — Certification architecture', ref: 'docs/adrs/ADR-012.md' },
      { type: 'file', label: 'conformance/suite.json', ref: 'conformance/ledger/suite.json' },
    ],
  },
  {
    pattern: /manifest|well-known|sandbox.*safety|operator\.json/i,
    model: 'qwen-14b', taskType: 'DOCS',
    text: `**Operator Manifest — \`/.well-known/banzami/operator.json\`**

\`\`\`json
{
  "operator_id": "op_abc123",
  "environment": "sandbox",
  "simulated": true,
  "production_allowed": false,
  "certification_level": 2,
  "protocol_version": "1.0.0",
  "capabilities": { "supports_wallets": true, "supports_transfers": true, "supports_qr": true, "supports_traces": true }
}
\`\`\`

**Safety invariant (RFC-006):** If \`environment == "sandbox"\` then \`simulated\` must be \`true\` and \`production_allowed\` must be \`false\`.

Use the **Manifest Validator** module to validate your manifest deterministically.`,
    citations: [
      { type: 'rfc', label: 'RFC-006 — Operator Manifest', ref: 'docs/rfcs/RFC-006.md' },
      { type: 'file', label: 'operator-manifest.schema.json', ref: 'schemas/operator-manifest.schema.json' },
    ],
  },
]

const DEMO_FALLBACK = {
  model: 'qwen-14b', taskType: 'DOCS',
  text: `BanzamIA is the AI-native interface for building, validating and certifying Banzami operators.

**What I can help with:**

- **Protocol questions** — wallet model, transfers, QR payments, ledger, settlement, traces
- **Invariant analysis** — INV-LEDGER-001 through INV-TRACE-001 enforcement and debugging
- **SDK code generation** — TypeScript, Python, Dart
- **Operator certification** — conformance levels 0–4
- **Manifest validation** — \`/.well-known/banzami/operator.json\` schema and safety invariants
- **Trace forensics** — causal flow reconstruction from \`trace_id\`

**Core principle:** Tools determine truth. AI explains truth.

Ask me anything about the Banzami protocol.`,
  citations: [{ type: 'file' as const, label: 'BanzamIA README', ref: 'https://github.com/banzami/banzamia' }],
}

async function _demoStream(
  messages: ChatMessage[],
  onChunk: (text: string, meta?: { model: string; taskType: string; actual_provider?: string }) => void,
  onCitations: (citations: Citation[]) => void,
  signal?: AbortSignal,
): Promise<void> {
  const lastMessage = messages[messages.length - 1]?.content ?? ''
  const demo = DEMO_RESPONSES.find(r => r.pattern.test(lastMessage)) ?? DEMO_FALLBACK

  onCitations(demo.citations as Citation[])
  const words = demo.text.split(/(?<=\s)/)
  for (let i = 0; i < words.length; i++) {
    if (signal?.aborted) return
    onChunk(words[i] ?? '', i === 0 ? { model: demo.model, taskType: demo.taskType, actual_provider: 'demo' } : undefined)
    await new Promise(r => setTimeout(r, 16 + Math.random() * 10))
  }
}

function _demoManifestValidation(manifest: unknown): ManifestValidationResult {
  const m = typeof manifest === 'object' && manifest !== null ? manifest as Record<string, unknown> : {}
  const errors: string[] = []
  if (!m.operator_id) errors.push('Missing operator_id')
  if (!m.environment) errors.push('Missing environment')
  if (m.environment === 'sandbox' && m.production_allowed === true) {
    errors.push('SANDBOX SAFETY VIOLATION: production_allowed must be false for sandbox')
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings: ['Demo mode — connect Live API for full deterministic validation'],
    sandbox_safety: { pass: !(m.environment === 'sandbox' && m.production_allowed === true), issues: [] },
    capability_check: { pass: true, issues: [] },
    missing_required_fields: [],
    federation_readiness: 'unknown',
    certification_level_declared: typeof m.certification_level === 'number' ? m.certification_level : null,
  }
}

function _demoKnowledgeSearch(query: string): KnowledgeResult[] {
  return [
    { id: 'inv-stl-001', title: 'INV-STL-001 — No Money Creation', path: 'contexts/financial-invariants.md',
      type: 'invariant', snippet: 'net_minor + fee_minor == gross_minor for every transfer.', score: 0.97 },
    { id: 'inv-ledger-001', title: 'INV-LEDGER-001 — Double-Entry', path: 'contexts/financial-invariants.md',
      type: 'invariant', snippet: 'Every transfer produces exactly one DEBIT and one CREDIT ledger entry.', score: 0.92 },
    { id: 'protocol-transfer', title: 'Transfer Protocol', path: 'contexts/banzami-protocol.md',
      type: 'protocol', snippet: `A transfer moves value between wallets matching query: "${query}".`, score: 0.85 },
  ]
}

// ─── Demo: Graph ──────────────────────────────────────────────────────────────

const DEMO_NODES: GraphNodeClient[] = [
  { id: 'rfc:RFC-0001', type: 'rfc', title: 'RFC-0001 — Wallet Model', path: 'docs/rfc/RFC-0001.md', status: 'accepted', summary: 'Defines the wallet entity, balance model, ownership rules and currency constraints.', authority: 0.95 },
  { id: 'rfc:RFC-0002', type: 'rfc', title: 'RFC-0002 — Transfer Protocol', path: 'docs/rfc/RFC-0002.md', status: 'accepted', summary: 'Defines the transfer entity, gross/net/fee decomposition, idempotency, and state machine.', authority: 0.95 },
  { id: 'rfc:RFC-0003', type: 'rfc', title: 'RFC-0003 — Ledger Invariants', path: 'docs/rfc/RFC-0003.md', status: 'accepted', summary: 'Formalises INV-LEDGER-001 through INV-LEDGER-003: double-entry, non-negative balances, immutability.', authority: 0.95 },
  { id: 'rfc:RFC-0004', type: 'rfc', title: 'RFC-0004 — QR Payment Protocol', path: 'docs/rfc/RFC-0004.md', status: 'accepted', summary: 'Defines QR payment lifecycle: creation, scan, payment, expiry.', authority: 0.95 },
  { id: 'rfc:RFC-0005', type: 'rfc', title: 'RFC-0005 — Settlement Model', path: 'docs/rfc/RFC-0005.md', status: 'accepted', summary: 'Defines settlement batches, batch assignment rules, and INV-STL-001/INV-STL-002.', authority: 0.95 },
  { id: 'rfc:RFC-0006', type: 'rfc', title: 'RFC-0006 — Operator Manifest', path: 'docs/rfc/RFC-0006.md', status: 'accepted', summary: 'Defines /.well-known/banzami/operator.json schema and sandbox safety invariants.', authority: 0.95 },
  { id: 'rfc:RFC-0007', type: 'rfc', title: 'RFC-0007 — Trace Model', path: 'docs/rfc/RFC-0007.md', status: 'accepted', summary: 'Defines trace_id propagation rules and INV-TRACE-001. Required for Level 2.', authority: 0.95 },
  { id: 'rfc:RFC-0008', type: 'rfc', title: 'RFC-0008 — Federation Protocol', path: 'docs/rfc/RFC-0008.md', status: 'draft', summary: 'Defines inter-operator communication, trust anchors, and capability negotiation for Level 3.', authority: 0.50 },
  { id: 'adr:ADR-001', type: 'adr', title: 'ADR-001 — Minor Units Only', path: 'docs/adr/ADR-001.md', status: 'accepted', summary: 'All monetary amounts stored as integers in minor units. No floating-point in financial calculations.', authority: 0.90 },
  { id: 'adr:ADR-002', type: 'adr', title: 'ADR-002 — Double-Entry Ledger', path: 'docs/adr/ADR-002.md', status: 'accepted', summary: 'Every transfer produces exactly one DEBIT and one CREDIT of equal amount.', authority: 0.90 },
  { id: 'adr:ADR-006', type: 'adr', title: 'ADR-006 — QR Code Format', path: 'docs/adr/ADR-006.md', status: 'accepted', summary: 'BANZAMI: prefix for production QR codes. BANZAMI-SBX: for sandbox. Never mix.', authority: 0.90 },
  { id: 'adr:ADR-012', type: 'adr', title: 'ADR-012 — Certification Architecture', path: 'docs/adr/ADR-012.md', status: 'accepted', summary: 'Certification is always a tool result, never LLM inference. Deterministic-first principle.', authority: 0.90 },
  { id: 'openapi:transfers', type: 'openapi', title: 'Transfers API Contract', path: 'contracts/openapi/transfers.yaml', status: 'active', summary: 'OpenAPI specification for transfer creation, retrieval, and state management.', authority: 0.90 },
  { id: 'openapi:wallets', type: 'openapi', title: 'Wallets API Contract', path: 'contracts/openapi/wallets.yaml', status: 'active', summary: 'OpenAPI specification for wallet creation, balance queries, and ownership.', authority: 0.90 },
  { id: 'vector:transfers', type: 'conformance_vector', title: 'Transfer Conformance Vectors', path: 'conformance/vectors/transfers.yaml', status: 'active', summary: 'Test vectors for transfer protocol conformance including invariant checks.', authority: 0.85 },
  { id: 'vector:ledger-postings', type: 'conformance_vector', title: 'Ledger Posting Vectors', path: 'conformance/vectors/ledger-postings.yaml', status: 'active', summary: 'Test vectors for double-entry ledger invariant verification.', authority: 0.85 },
  { id: 'certification:conformance', type: 'certification_rule', title: 'Conformance Certification Rules', path: 'docs/conformance.md', status: 'active', summary: 'Defines the conformance test suite structure and level progression rules.', authority: 0.85 },
  { id: 'glossary:main', type: 'glossary_term', title: 'Protocol Glossary', path: 'docs/glossary.md', status: 'active', summary: 'Canonical definitions for all Banzami protocol terms.', authority: 0.80 },
]

const DEMO_EDGES: Array<{ from: string; to: string; relationship: string }> = [
  { from: 'adr:ADR-002', to: 'rfc:RFC-0002', relationship: 'IMPLEMENTS' },
  { from: 'adr:ADR-002', to: 'rfc:RFC-0003', relationship: 'IMPLEMENTS' },
  { from: 'adr:ADR-001', to: 'rfc:RFC-0001', relationship: 'IMPLEMENTS' },
  { from: 'adr:ADR-006', to: 'rfc:RFC-0004', relationship: 'IMPLEMENTS' },
  { from: 'adr:ADR-012', to: 'rfc:RFC-0006', relationship: 'IMPLEMENTS' },
  { from: 'vector:transfers', to: 'rfc:RFC-0002', relationship: 'VALIDATES' },
  { from: 'vector:ledger-postings', to: 'adr:ADR-002', relationship: 'VALIDATES' },
  { from: 'rfc:RFC-0004', to: 'rfc:RFC-0001', relationship: 'REQUIRES' },
  { from: 'rfc:RFC-0004', to: 'rfc:RFC-0002', relationship: 'REQUIRES' },
  { from: 'rfc:RFC-0005', to: 'rfc:RFC-0002', relationship: 'REQUIRES' },
  { from: 'rfc:RFC-0007', to: 'rfc:RFC-0002', relationship: 'REQUIRES' },
  { from: 'rfc:RFC-0008', to: 'rfc:RFC-0006', relationship: 'REQUIRES' },
  { from: 'openapi:transfers', to: 'rfc:RFC-0002', relationship: 'REFERENCES' },
  { from: 'openapi:wallets', to: 'rfc:RFC-0001', relationship: 'REFERENCES' },
  { from: 'glossary:main', to: 'rfc:RFC-0001', relationship: 'EXPLAINS' },
  { from: 'certification:conformance', to: 'adr:ADR-012', relationship: 'REQUIRES' },
]

function _demoGraphStats(): GraphStatsResponse {
  const nodesByType: Record<string, number> = {}
  const edgesByRel: Record<string, number> = {}
  for (const n of DEMO_NODES) nodesByType[n.type] = (nodesByType[n.type] ?? 0) + 1
  for (const e of DEMO_EDGES) edgesByRel[e.relationship] = (edgesByRel[e.relationship] ?? 0) + 1
  return { node_count: DEMO_NODES.length, edge_count: DEMO_EDGES.length, indexed_at: '2026-05-29T00:00:00Z', nodes_by_type: nodesByType, edges_by_relationship: edgesByRel }
}

function _demoGraphNode(id: string): GraphNodeResponse | null {
  const node = DEMO_NODES.find(n => n.id === id || n.path.includes(id))
  if (!node) return null
  const neighbours: GraphNeighbourClient[] = DEMO_EDGES
    .filter(e => e.from === node.id || e.to === node.id)
    .map(e => {
      const isOut = e.from === node.id
      const otherId = isOut ? e.to : e.from
      const other = DEMO_NODES.find(n => n.id === otherId)
      if (!other) return null
      return { node: other, relationship: e.relationship, direction: isOut ? 'outbound' : 'inbound' } as GraphNeighbourClient
    })
    .filter((n): n is GraphNeighbourClient => n !== null)
  return { node, neighbours }
}

function _demoGraphSearch(q: string): GraphSearchResponse {
  const lower = q.toLowerCase()
  const nodes = DEMO_NODES.filter(n =>
    n.id.toLowerCase().includes(lower) ||
    n.title.toLowerCase().includes(lower) ||
    n.summary.toLowerCase().includes(lower)
  )
  return { query: q, count: nodes.length, nodes: nodes.slice(0, 10) }
}

// ─── Demo: Research ───────────────────────────────────────────────────────────

function _demoResearch(question: string): ResearchReport {
  return {
    question,
    answer: `**Protocol Research Report — Demo Mode**

This is a demonstration of BanzamIA's Agentic Protocol Research capability.

In **Live API mode**, the Research Agent:

1. **Plans** a multi-step research strategy based on your question
2. **Retrieves** relevant protocol documents from the Qdrant knowledge base
3. **Traverses** the Protocol Graph to find related RFCs, ADRs, and invariants
4. **Executes** secondary retrievals on graph-discovered topics
5. **Synthesises** all evidence into a grounded, cited protocol report

**Key capabilities:**

- Multi-hop retrieval across the full protocol knowledge base
- Automatic relationship chain discovery (e.g. RFC-0004 → ADR-006 → INV-STL-001)
- Source authority ranking (reference 1.00 → draft_rfc 0.50)
- Contradiction detection across sources
- Protocol truth enforcement: tools determine truth, AI explains truth

Connect Live API to enable full agentic research.`,
    steps: [
      { step: 1, type: 'plan', description: `Research plan for: "${question.slice(0, 60)}"` },
      { step: 2, type: 'retrieval', description: 'Primary vector search', sources_found: 8 },
      { step: 3, type: 'graph', description: 'Graph traversal — 12 related nodes', nodes_found: 12 },
      { step: 4, type: 'retrieval', description: 'Secondary retrieval on graph-discovered topics', sources_found: 5 },
      { step: 5, type: 'synthesis', description: 'Synthesis of 13 evidence sources' },
    ],
    evidence: [
      { source_path: 'docs/rfc/RFC-0002.md', source_type: 'accepted_rfc', title: 'RFC-0002 — Transfer Protocol', excerpt: 'Defines the transfer entity, gross/net/fee decomposition, idempotency, and state machine.', authority: 0.95, score: 0.91 },
      { source_path: 'docs/adr/ADR-002.md', source_type: 'accepted_adr', title: 'ADR-002 — Double-Entry Ledger', excerpt: 'Every transfer produces exactly one DEBIT and one CREDIT of equal amount.', authority: 0.90, score: 0.87 },
    ],
    graph_nodes: [
      { id: 'rfc:RFC-0002', title: 'RFC-0002 — Transfer Protocol', type: 'rfc' },
      { id: 'adr:ADR-002', title: 'ADR-002 — Double-Entry Ledger', type: 'adr' },
    ],
    relationship_chains: ['rfc:RFC-0002 —[REQUIRES]→ rfc:RFC-0001', 'adr:ADR-002 —[IMPLEMENTS]→ rfc:RFC-0002'],
    contradictions: [],
    authority_summary: { highest: 0.95, avg: 0.88, sources_used: 8 },
    research_quality: 'high',
    model: 'demo',
    duration_ms: 1240,
  }
}

// ─── Demo: Copilot ────────────────────────────────────────────────────────────

function _demoCopilot(input: { target_level?: number }): CopilotResult {
  const target = input.target_level ?? 2
  return {
    current_level: 1,
    target_level: target,
    readiness_score: 62,
    level_statuses: [
      { level: 0, name: 'Sandbox Operator', status: 'achieved', missing: [], achieved_count: 3, total_count: 3 },
      { level: 1, name: 'Payment Operator', status: 'achieved', missing: [], achieved_count: 4, total_count: 4 },
      { level: 2, name: 'Settlement Operator', status: 'partial', missing: [
        { id: 'L2-001', description: 'GET /v1/traces/:trace_id endpoint', rfc: 'RFC-0007' },
        { id: 'L2-002', description: 'INV-TRACE-001: trace_id propagation', rfc: 'RFC-0007' },
      ], achieved_count: 1, total_count: 3 },
      { level: 3, name: 'Federation Operator', status: 'blocked', missing: [
        { id: 'L3-001', description: 'Operator manifest /.well-known/banzami/operator.json', rfc: 'RFC-0006' },
        { id: 'L3-002', description: 'Federation discovery endpoint', rfc: 'RFC-0008' },
        { id: 'L3-003', description: 'Cross-operator event exchange', rfc: 'RFC-0008' },
      ], achieved_count: 0, total_count: 3 },
      { level: 4, name: 'Infrastructure Operator', status: 'blocked', missing: [
        { id: 'L4-001', description: 'Settlement batch lifecycle', rfc: 'RFC-0005' },
        { id: 'L4-002', description: 'INV-STL-001: net + fee = gross', rfc: 'RFC-0005' },
      ], achieved_count: 0, total_count: 2 },
    ],
    missing_for_target: [
      { id: 'L2-001', description: 'GET /v1/traces/:trace_id endpoint', rfc: 'RFC-0007' },
      { id: 'L2-002', description: 'INV-TRACE-001: trace_id propagates to all flow entities', rfc: 'RFC-0007' },
    ],
    next_actions: [
      'Implement GET /v1/traces/:trace_id endpoint (RFC-0007)',
      'Propagate trace_id to all flow entities — QR, Transfer, Ledger entries (INV-TRACE-001)',
      'Add webhook delivery with correlation_id',
      'Run Level 2 conformance suite and verify all checks pass',
    ],
    roadmap: [
      { from_level: 1, to_level: 2, steps: ['Implement traces endpoint', 'Propagate trace_id', 'Add webhooks', 'Run Level 2 suite'], estimated_effort: '1–2 weeks' },
      { from_level: 2, to_level: 3, steps: ['Publish operator.json manifest', 'Implement federation discovery', 'Add cross-operator events', 'Network review'], estimated_effort: '3–6 weeks' },
      { from_level: 3, to_level: 4, steps: ['Settlement batch lifecycle', 'Enforce INV-STL-001', 'CI invariant checks', 'Level 4 suite'], estimated_effort: '2–4 weeks' },
    ],
    certification_ready: false,
    blocking_issues: [],
  }
}

// ─── Demo: RAG Stats ──────────────────────────────────────────────────────────

function _demoRagStats(): RagStatsResponse {
  return {
    generated_at: new Date().toISOString(),
    knowledge_base: { documents_indexed: 0, chunks_indexed: 0, last_indexed_at: null, embedding_provider: 'mock', embedding_dims: 1024 },
    query_analytics: null,
    protocol_graph: null,
  }
}

function _demoCopilotBase(score: number, level: number, target: number): CopilotResult {
  return {
    current_level: level,
    target_level: target,
    readiness_score: score,
    level_statuses: [
      { level: 0, name: 'Sandbox Operator', status: 'achieved', missing: [], achieved_count: 3, total_count: 3 },
      { level: 1, name: 'Payment Operator', status: level >= 1 ? 'achieved' : 'partial', missing: [], achieved_count: level >= 1 ? 4 : 2, total_count: 4 },
      { level: 2, name: 'Settlement Operator', status: level >= 2 ? 'achieved' : 'partial', missing: level < 2 ? [{ id: 'L2-001', description: 'Trace endpoint', rfc: 'RFC-0007' }] : [], achieved_count: level >= 2 ? 3 : 1, total_count: 3 },
      { level: 3, name: 'Federation Operator', status: 'blocked', missing: [{ id: 'L3-001', description: 'Operator manifest', rfc: 'RFC-0006' }, { id: 'L3-002', description: 'Federation discovery', rfc: 'RFC-0008' }], achieved_count: 0, total_count: 3 },
      { level: 4, name: 'Infrastructure Operator', status: 'blocked', missing: [{ id: 'L4-001', description: 'Settlement batch lifecycle', rfc: 'RFC-0005' }], achieved_count: 0, total_count: 2 },
    ],
    missing_for_target: target <= level ? [] : [{ id: `L${target}-001`, description: `Requirement for Level ${target}`, rfc: `RFC-000${target}` }],
    next_actions: ['Implement trace endpoint (RFC-0007)', 'Add webhook support', 'Publish operator manifest'],
    roadmap: [{ from_level: level, to_level: level + 1, steps: ['Implement missing requirements', 'Run conformance suite'], estimated_effort: '2–4 weeks' }],
    certification_ready: false,
    blocking_issues: [],
  }
}

function _demoSimulation(input: { capabilities: string[]; target_level: number; proposed_changes: SimulationChange[] }): SimulatorResult {
  const addedCaps = input.proposed_changes.filter(c => c.type === 'add_capability').map(c => c.capability!).filter(Boolean)
  const newScore = Math.min(100, 67 + addedCaps.length * 8)
  const delta = newScore - 67
  const before = _demoCopilotBase(67, 1, input.target_level)
  const after = _demoCopilotBase(newScore, addedCaps.includes('supports_traces') ? 2 : 1, input.target_level)
  return {
    before, after,
    readiness_delta: delta,
    applied_changes: addedCaps.map(c => `+ Add capability: ${c}`),
    new_capabilities: addedCaps,
    removed_capabilities: [],
    certification_impact: {
      level_unlocked: addedCaps.includes('supports_traces'),
      new_level: addedCaps.includes('supports_traces') ? 2 : 1,
      requirements_satisfied: addedCaps.includes('supports_traces') ? ['L2-001', 'L2-002'] : [],
      requirements_still_missing: ['L3-001', 'L3-002'],
    },
    federation_impact: { eligible_before: false, eligible_after: false, newly_eligible: false },
    estimated_effort: delta === 0 ? 'none' : delta < 20 ? 'low' : 'medium',
    summary: `Readiness improves ${delta} points (67% → ${newScore}%). ${addedCaps.includes('supports_traces') ? 'Level 2 certification becomes achievable.' : ''}`,
  }
}

function _demoFederation(input: { operator_a: { operator_id: string }; operator_b: { operator_id: string } }): FederationResult {
  return {
    operator_a_id: input.operator_a.operator_id,
    operator_b_id: input.operator_b.operator_id,
    compatibility_score: 52,
    federation_ready: false,
    operator_a_level: 1,
    operator_b_level: 2,
    shared_capabilities: ['supports_wallets', 'supports_transfers', 'supports_qr'],
    missing_in_a: ['supports_manifest', 'supports_federation', 'supports_cross_operator'],
    missing_in_b: ['supports_federation', 'supports_cross_operator'],
    conflicts: [],
    blocking_issues: [
      `${input.operator_a.operator_id} has not reached Level 3 (current: 1).`,
      `${input.operator_b.operator_id} has not reached Level 3 (current: 2).`,
    ],
    suggested_next_actions: [
      `[BLOCKER] ${input.operator_a.operator_id} must reach Level 3 first.`,
      `[BLOCKER] ${input.operator_b.operator_id} must reach Level 3 first.`,
      `${input.operator_a.operator_id}: add supports_manifest, supports_federation, supports_cross_operator.`,
    ],
    analysis_notes: ['Shared capabilities (3): supports_wallets, supports_transfers, supports_qr.', 'No protocol conflicts detected.'],
    estimated_effort_a: '3–6 weeks',
    estimated_effort_b: '1–2 weeks',
  }
}

function _demoMemory(operatorId: string): OperatorMemory {
  const now = new Date().toISOString()
  return {
    operator_id: operatorId,
    created_at: '2026-01-15T10:00:00Z',
    updated_at: now,
    current_manifest: { operator_id: operatorId, environment: 'sandbox', protocol_version: '1.0.0' },
    current_capabilities: ['supports_wallets', 'supports_transfers', 'supports_qr'],
    current_level: 1,
    assessments: [
      { timestamp: '2026-01-15T10:00:00Z', target_level: 2, readiness_score: 45, current_level: 0, missing_count: 5, capabilities: ['supports_wallets'] },
      { timestamp: '2026-03-01T14:30:00Z', target_level: 2, readiness_score: 67, current_level: 1, missing_count: 3, capabilities: ['supports_wallets', 'supports_transfers', 'supports_qr'] },
      { timestamp: now, target_level: 2, readiness_score: 67, current_level: 1, missing_count: 3, capabilities: ['supports_wallets', 'supports_transfers', 'supports_qr'] },
    ],
    timeline: [
      { date: '2026-01-15', type: 'assessment', title: 'Initial certification assessment (target L2)', detail: 'Readiness score: 45%', score: 45 },
      { date: '2026-02-10', type: 'manifest_change', title: 'Manifest updated', detail: 'Added supports_transfers, supports_qr capabilities.' },
      { date: '2026-03-01', type: 'certification', title: 'Reached Level 1', detail: 'Upgraded from Level 0 to Level 1.', level: 1, score: 67 },
      { date: '2026-03-01', type: 'assessment', title: 'Certification assessment (target L2)', detail: 'Readiness score: 67% (+22 pts from last assessment)', score: 67 },
    ],
    research_history: [
      { question: 'What do I need for Level 2?', timestamp: '2026-02-05T09:00:00Z' },
      { question: 'How do trace IDs propagate?', timestamp: '2026-02-20T16:45:00Z' },
    ],
    notes: [],
  }
}

function _demoDigitalTwin(input: { operator_id: string; capabilities: string[]; target_level?: number }): DigitalTwinResult {
  const cert = _demoCopilotBase(67, 1, input.target_level ?? 4)
  const mem = _demoMemory(input.operator_id)
  return {
    operator_id: input.operator_id,
    snapshot_at: new Date().toISOString(),
    manifest: { operator_id: input.operator_id, environment: 'sandbox', protocol_version: '1.0.0' },
    capabilities: input.capabilities,
    certification: cert,
    federation_profiles: [],
    memory: mem,
    relevant_invariants: [
      { invariant_id: 'INV-LEDGER-001', description: 'Conservation: sum of all balances is constant', relevant: true, reason: 'Operator handles transfers and wallets.' },
      { invariant_id: 'INV-LEDGER-002', description: 'Double-entry: every transfer has 1 DEBIT + 1 CREDIT', relevant: true, reason: 'Operator handles transfers and wallets.' },
    ],
    relevant_rfcs: [
      { rfc_id: 'RFC-0001', title: 'Wallet Model', relevance: 'wallet' },
      { rfc_id: 'RFC-0002', title: 'Transfer Model', relevance: 'transfer' },
      { rfc_id: 'RFC-0007', title: 'Trace Model', relevance: 'trace' },
    ],
    recommendations: [
      'Implement trace endpoint (RFC-0007) to satisfy L2-001.',
      'Add webhook support (supports_webhooks) — required for Level 2.',
      'Run conformance suite to verify Level 1 requirements.',
    ],
    capability_gap_summary: '3 requirement(s) remain before reaching Level 4: L2-001, L3-001, L3-002…',
    readiness_trajectory: 'Improving',
  }
}
