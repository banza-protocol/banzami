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

// ─── Demo mode ────────────────────────────────────────────────────────────────

const DEMO_RESPONSES: Array<{ pattern: RegExp; model: string; taskType: string; text: string; citations: Citation[] }> = [
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

**Certification:** Required for Level 2 (Trace-compatible).

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
| 0 | Reference-compatible | health, wallets, transfers |
| 1 | Protocol-compatible | + QR, payment requests, ledger, settlement |
| 2 | Trace-compatible | + traces, INV-TRACE-001 |
| 3 | Federation-ready | + operator.json manifest |
| 4 | Settlement-compatible | + all settlement invariants PASS |

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
