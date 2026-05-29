# BanzamIA — Architecture

**Version:** 1.0  
**Date:** 2026-05-28  
**Status:** Active

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    BanzamIA Frontend                            │
│              (Next.js — banzami.org/banzamia)                   │
│                                                                 │
│  Sidebar  │  Module Panel (Chat/Builder/Conformance/...)  │ Sources│
└───────────────────────────┬─────────────────────────────────────┘
                            │ SSE streaming
                            │ POST /ask
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BanzamIA API                               │
│                    (Node.js / port 4001)                        │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                  Orchestration Layer                    │    │
│  │                                                        │    │
│  │  Task classifier → DOCS | CODE | REASON | VALIDATE     │    │
│  │                          │                             │    │
│  │  ┌──────────┬────────────┼────────────┬─────────────┐  │    │
│  │  │   DOCS   │    CODE    │   REASON   │  VALIDATE   │  │    │
│  │  │ Qwen 14B │Qwen Coder  │DeepSeek R1 │ Qwen 14B+  │  │    │
│  │  │          │    7B      │            │  tool calls │  │    │
│  │  └──────────┴────────────┴────────────┴─────────────┘  │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                   Knowledge Base                        │    │
│  │                                                        │    │
│  │  Qdrant Vector DB                                      │    │
│  │  ├── Protocol docs (RFC, ADR)                          │    │
│  │  ├── Financial invariants                              │    │
│  │  ├── Conformance specifications                        │    │
│  │  ├── SDK documentation                                 │    │
│  │  └── Implementation matrix entries                     │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                   Tool Integration                      │    │
│  │                                                        │    │
│  │  invariant_checker   manifest_validator                │    │
│  │  conformance_runner  trace_reconstructor               │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Frontend Components

### `BanzamIAApp` (client component)

Root orchestrator. Reads `?question` and `?auto` URL params via `useSearchParams()`. Renders the active module. Manages global state: active module, citations, streaming status, model routing info.

### `BanzamIASidebar`

Navigation panel listing all 8 modules. Mode badge (live/demo). Wine-red active item styling.

### `BanzamIAChat`

Main chat interface. Handles:
- Message history management
- SSE streaming via `chatStream()`
- Deep-link auto-submit (`initialQuestion` + `autoSubmit` props)
- Markdown rendering with `MarkdownContent` / `renderInline`
- Code blocks, tables, bold, inline code

### `BanzamIASourcesPanel`

Right-side panel showing:
- Active model route and task type
- Citations from last response (type-coloured chips)
- Grounding principles
- Live/demo mode indicator

### Module components (in `components/banzamia/modules/`)

| Component | Module |
|-----------|--------|
| `OperatorBuilderModule.tsx` | Operator Builder |
| `ConformanceModule.tsx` | Conformance |
| `ManifestModule.tsx` | Manifest Validator |
| `TraceModule.tsx` | Trace Explainer |
| `SDKModule.tsx` | SDK Assistant |
| `RFCExplorerModule.tsx` | RFC/ADR Explorer |
| `KnowledgeModule.tsx` | Knowledge Search |

### `HomeBanzamIAEntry` (homepage)

Lightweight entry card on the homepage. Streaming inline answers. Quick-prompt chips. Deep-link to full interface.

---

## API Layer

### Endpoint

```
POST /ask
Content-Type: application/json

{
  "messages": [
    { "role": "user",      "content": "..." },
    { "role": "assistant", "content": "..." },
    { "role": "user",      "content": "..." }
  ]
}
```

### Response (Server-Sent Events)

```
data: {"type":"meta","model":"qwen-14b","taskType":"DOCS"}

data: {"type":"chunk","content":"The Banzami protocol..."}
data: {"type":"chunk","content":" enforces..."}

data: {"type":"citations","citations":[
  {"type":"rfc","label":"RFC-0004 Capability System","ref":"rfc/RFC-0004.md"},
  {"type":"invariant","label":"INV-LEDGER-001","ref":"docs/validation/INVARIANT_TAXONOMY.md"}
]}

data: {"type":"done"}
```

### Client library (`lib/banzamia-client.ts`)

```typescript
export async function chatStream(
  messages: ChatMessage[],
  onChunk: (chunk: string, meta?: StreamMeta) => void,
  onCitations: (citations: Citation[]) => void,
  signal?: AbortSignal,
): Promise<void>
```

`isLiveMode` flag (boolean) — `true` when `NEXT_PUBLIC_BANZAMIA_API_URL` is set.

---

## Model Routing

The orchestration layer classifies each request into a task type and routes to the appropriate model:

| Task Type | Trigger | Model |
|-----------|---------|-------|
| `DOCS` | Protocol questions, RFC/ADR queries | Qwen 14B |
| `CODE` | SDK integration, code generation | Qwen Coder 7B |
| `REASON` | Invariant analysis, complex protocol questions | DeepSeek R1 |
| `VALIDATE` | Manifest validation, conformance checking | Qwen 14B + tool calls |
| `CERTIFY` | Certification workflow | Qwen 14B + tool calls + human gate |

---

## Citation System

Every BanzamIA response includes structured citations. Citation types:

| Type | Label | Color |
|------|-------|-------|
| `rfc` | RFC documents | Gold |
| `adr` | ADR documents | Blue |
| `api` | API specifications | Violet |
| `invariant` | Financial invariants | Wine red |
| `file` | Source files | Muted |
| `vector` | Vector DB results | Green |

Citations are rendered as coloured chips in the Sources panel and as inline references in responses.

---

## Grounding Principles

BanzamIA enforces these grounding principles in all responses:

1. **Protocol claims cite RFC or ADR** — any statement about how the protocol works must reference the governing document
2. **Invariant violations are hard findings** — if an invariant fails, this is reported as a definitive finding, not a concern
3. **Certification requires tool result, not AI inference** — BanzamIA cannot certify an operator; it can only present tool output that supports a human certification decision

---

## Deployment

BanzamIA API runs as a Docker container:

```
banzamia-api → port 4001
```

The Banza docs frontend connects to it via `NEXT_PUBLIC_BANZAMIA_API_URL`:

```bash
NEXT_PUBLIC_BANZAMIA_API_URL=http://217.160.9.248:4001 ./deploy.sh docs-frontend
```

Health check: `GET /health` — returns 200 when the API is ready.

See `deploy.sh` → `deploy_banzamia_api()` for the full deployment procedure.

---

## References

- `apps/docs/components/banzamia/` — frontend components
- `apps/docs/lib/banzamia-client.ts` — client library
- `github.com/banzami/banzamia/apps/api/` — BanzamIA API server
- [Overview](overview.md) — what BanzamIA is and isn't
- [API Reference](api.md) — full API contract
