// BanzamIA API client — auto-detects demo vs live mode
// Demo mode: NEXT_PUBLIC_BANZAMIA_API_URL is not set
// Live mode:  NEXT_PUBLIC_BANZAMIA_API_URL is set (e.g. https://api.banzamia.banzami.org)

export const BANZAMIA_API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_BANZAMIA_API_URL ?? ''
    : ''

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

export interface ChatResponse {
  text: string
  model: string
  taskType: string
  citations: Citation[]
}

export interface SystemStatus {
  mode: 'demo' | 'live'
  api: 'ok' | 'unavailable'
  modelRouter: 'ok' | 'unavailable'
  knowledgeBase: 'indexed' | 'not-indexed' | 'unavailable'
  tools: 'available' | 'demo'
  conformanceRunner: 'available' | 'demo'
}

// ─── Demo mode responses ─────────────────────────────────────────────────────

const DEMO_RESPONSES: Array<{
  pattern: RegExp
  model: string
  taskType: string
  text: string
  citations: Citation[]
}> = [
  {
    pattern: /trace|trace_id|propagat/i,
    model: 'qwen-14b',
    taskType: 'DOCS',
    text: `**INV-TRACE-001 — Trace ID Propagation**

Every entity in a Banzami payment flow must share the same \`trace_id\`. This is a non-negotiable protocol invariant.

When a QR payment is created:

\`\`\`
QR.trace_id ─── must equal ──► Transfer.trace_id
                               └── must equal ──► LedgerEntry.trace_id
                                                   └── must equal ──► SettlementBatch.trace_id
\`\`\`

The \`GET /v1/traces/:trace_id\` endpoint reconstructs the full causal graph of all entities in the flow.

**Why this matters:** Without trace propagation, regulators cannot audit payment flows end-to-end. It is the foundational requirement for Certification Level 2 (Trace-compatible).

**Conformance check:** \`traces.propagation\` sub-suite validates this for every test flow.`,
    citations: [
      { type: 'invariant', label: 'INV-TRACE-001', ref: 'conformance/traces/suite.json' },
      { type: 'api',       label: 'GET /v1/traces/:trace_id', ref: 'contracts/openapi.yaml#/paths/~1v1~1traces~1{trace_id}' },
      { type: 'rfc',       label: 'RFC-007 — Trace Model', ref: 'docs/rfcs/RFC-007-trace-model.md' },
    ],
  },
  {
    pattern: /invariant|ledger|double.entry|balance|negative|zero.sum/i,
    model: 'deepseek-r1',
    taskType: 'REASON',
    text: `**Banzami Financial Invariants**

The Banzami protocol enforces six financial invariants that must never be violated:

| ID | Rule |
|----|------|
| INV-LEDGER-001 | Every transfer → one DEBIT + one CREDIT of equal amount |
| INV-LEDGER-002 | No wallet may reach negative balance |
| INV-LEDGER-003 | Confirmed ledger entries are immutable |
| INV-STL-001 | \`net_minor + fee_minor == gross_minor\` (no money creation) |
| INV-STL-002 | Each transfer belongs to exactly one settlement batch |
| INV-TRACE-001 | All entities in a flow share the same \`trace_id\` |

**INV-STL-001 is the most critical:** if \`net + fee ≠ gross\`, money is either created or destroyed during the transfer. This is a direct financial fraud vector.

BanzamIA treats invariant violations as hard findings — never softened, never suppressed.`,
    citations: [
      { type: 'invariant', label: 'INV-LEDGER-001', ref: 'conformance/ledger/suite.json' },
      { type: 'invariant', label: 'INV-STL-001',    ref: 'conformance/settlement/suite.json' },
      { type: 'file',      label: 'financial-invariants.md', ref: 'contexts/financial-invariants.md' },
    ],
  },
  {
    pattern: /typescript|sdk|code|generate|qr|payment|create/i,
    model: 'qwen-coder-7b',
    taskType: 'CODE',
    text: `**TypeScript SDK — QR Payment Flow**

\`\`\`typescript
import { BanzaClient } from '@banza/sdk'

const client = new BanzaClient({
  baseUrl: process.env.BANZA_API_URL,
  apiKey:  process.env.BANZA_API_KEY,
})

// Create a QR payment (merchant receives)
const qr = await client.qr.create({
  merchant_wallet: 'wal_abc123',
  amount_minor:    5000,          // 50.00 XOF
  currency:        'XOF',
  description:     'Compra na loja',
})

console.log(qr.id)        // qr_xyz
console.log(qr.trace_id)  // tr_abc — propagates to all flow entities

// Poll or use webhook to confirm payment
const status = await client.qr.get(qr.id)
if (status.status === 'paid') {
  // Transfer completed — trace_id propagated to transfer and ledger
  const transfer = await client.transfers.get(status.transfer_id!)
  console.log(transfer.net_minor + transfer.fee_minor === transfer.gross_minor) // true — INV-STL-001
}
\`\`\`

**Financial safety:** The SDK enforces INV-STL-001 at the response validation layer. A transfer where \`net + fee ≠ gross\` will throw \`InvariantViolationError\`.`,
    citations: [
      { type: 'api',  label: 'POST /v1/qr',              ref: 'contracts/openapi.yaml#/paths/~1v1~1qr' },
      { type: 'api',  label: 'GET /v1/qr/:id',           ref: 'contracts/openapi.yaml#/paths/~1v1~1qr~1{id}' },
      { type: 'file', label: '@banza/sdk TypeScript SDK', ref: 'sdk/typescript/README.md' },
    ],
  },
  {
    pattern: /certif|level|conform|operator|suite/i,
    model: 'deepseek-r1',
    taskType: 'VALIDATE',
    text: `**Operator Certification Levels**

| Level | Name | Required suites |
|-------|------|----------------|
| 0 | Reference-compatible | health, wallets, transfers |
| 1 | Protocol-compatible | + QR, payment-requests, events, ledger, settlement |
| 2 | Trace-compatible | + traces |
| 3 | Federation-ready | + manifest, capabilities |
| 4 | Settlement-compatible | + settlement invariants |

**To certify your operator at Level 2:**

\`\`\`bash
# Run the conformance suite
python tools/banzami-conformance/run.py \\
  --url https://your-operator.com \\
  --level 2 \\
  --output report.json
\`\`\`

The runner checks every suite deterministically. BanzamIA never infers certification from LLM output — certification is a tool result, not an AI opinion.

**Minimum evidence for VALIDATED status:**
- All acceptance criteria: PASS
- All financial invariants: PASS
- Confidence score ≥ 80
- All \`requires\` dependencies VALIDATED`,
    citations: [
      { type: 'file',      label: 'conformance/ledger/suite.json',      ref: 'conformance/ledger/suite.json' },
      { type: 'file',      label: 'conformance/settlement/suite.json',  ref: 'conformance/settlement/suite.json' },
      { type: 'invariant', label: 'INV-STL-001 — No money creation',    ref: 'conformance/settlement/suite.json' },
      { type: 'adr',       label: 'ADR-012 — Certification architecture', ref: 'docs/adrs/ADR-012.md' },
    ],
  },
  {
    pattern: /manifest|well-known|sandbox|operator.json/i,
    model: 'qwen-14b',
    taskType: 'DOCS',
    text: `**Operator Manifest — \`/.well-known/banzami/operator.json\`**

Every Banzami operator must expose a manifest at this path:

\`\`\`json
{
  "operator_id":         "op_abc123",
  "display_name":        "Acme Financial",
  "environment":         "production",
  "simulated":           false,
  "production_allowed":  true,
  "certification_level": 2,
  "protocol_version":    "1.0.0",
  "capabilities": {
    "supports_wallets":    true,
    "supports_transfers":  true,
    "supports_qr":         true,
    "supports_traces":     true,
    "supports_settlement": false
  }
}
\`\`\`

**Critical safety invariant for sandbox operators:**

If \`environment == "sandbox"\`, then:
- \`simulated\` **must** be \`true\`
- \`production_allowed\` **must** be \`false\`

A sandbox operator that declares \`production_allowed: true\` is a **safety violation**. BanzamIA rejects this manifest unconditionally.`,
    citations: [
      { type: 'file', label: 'manifests/schema.json',           ref: 'conformance/manifests/schema.json' },
      { type: 'file', label: 'operator-manifest.schema.json',   ref: 'schemas/operator-manifest.schema.json' },
      { type: 'adr',  label: 'ADR-016 — Brand architecture',    ref: 'docs/adrs/ADR-016.md' },
    ],
  },
]

const FALLBACK_RESPONSE = {
  model: 'qwen-14b',
  taskType: 'DOCS',
  text: `BanzamIA is the AI-native interface for building, validating and certifying Banzami operators.

**What I can help with:**

- **Protocol questions** — wallet model, transfers, QR payments, ledger, settlement, traces
- **Invariant analysis** — INV-LEDGER-001 through INV-TRACE-001 enforcement and debugging
- **SDK code generation** — TypeScript, Go, Rust, Python, PHP, Flutter
- **Operator certification** — conformance levels 0–4, suite interpretation
- **Manifest validation** — \`/.well-known/banzami/operator.json\` schema and safety invariants
- **Trace forensics** — causal flow reconstruction from \`trace_id\`
- **RFC/ADR exploration** — protocol decisions and their rationale

**Core principle:** Tools determine truth. AI explains truth.

Ask me anything about the Banzami protocol.`,
  citations: [
    { type: 'file', label: 'BanzamIA README', ref: 'https://github.com/banzami/banzamia' },
  ] as Citation[],
}

function matchDemo(userMessage: string) {
  for (const r of DEMO_RESPONSES) {
    if (r.pattern.test(userMessage)) return r
  }
  return FALLBACK_RESPONSE
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function chatStream(
  messages: ChatMessage[],
  onChunk: (text: string, meta?: { model: string; taskType: string }) => void,
  onCitations: (citations: Citation[]) => void,
  signal?: AbortSignal,
): Promise<void> {
  const lastMessage = messages[messages.length - 1]?.content ?? ''

  if (!isLiveMode) {
    // Demo mode — simulate streaming with canned response
    const demo = matchDemo(lastMessage)
    onCitations(demo.citations as Citation[])

    const words = demo.text.split(' ')
    for (let i = 0; i < words.length; i++) {
      if (signal?.aborted) return
      const chunk = (i === 0 ? '' : ' ') + words[i]
      onChunk(chunk, i === 0 ? { model: demo.model, taskType: demo.taskType } : undefined)
      await new Promise(r => setTimeout(r, 18 + Math.random() * 12))
    }
    return
  }

  // Live mode — SSE streaming
  const res = await fetch(`${BANZAMIA_API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  })

  if (!res.ok || !res.body) {
    throw new Error(`BanzamIA API error: ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

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
        const parsed = JSON.parse(data) as { text?: string; model?: string; taskType?: string }
        if (parsed.text) onChunk(parsed.text, parsed.model ? { model: parsed.model, taskType: parsed.taskType ?? '' } : undefined)
      } catch { /* ignore malformed */ }
    }
  }
}

export async function getSystemStatus(): Promise<SystemStatus> {
  if (!isLiveMode) {
    return {
      mode: 'demo',
      api: 'unavailable',
      modelRouter: 'unavailable',
      knowledgeBase: 'not-indexed',
      tools: 'demo',
      conformanceRunner: 'demo',
    }
  }

  try {
    const res = await fetch(`${BANZAMIA_API_URL}/health`, { cache: 'no-store' })
    if (res.ok) {
      return {
        mode: 'live',
        api: 'ok',
        modelRouter: 'ok',
        knowledgeBase: 'indexed',
        tools: 'available',
        conformanceRunner: 'available',
      }
    }
  } catch { /* fall through */ }

  return {
    mode: 'live',
    api: 'unavailable',
    modelRouter: 'unavailable',
    knowledgeBase: 'unavailable',
    tools: 'demo',
    conformanceRunner: 'demo',
  }
}
