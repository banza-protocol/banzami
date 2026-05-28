# BanzamIA — API Reference

**Version:** 1.0  
**Date:** 2026-05-28  
**Status:** Active

---

## Base URL

```
http://217.160.9.248:4001
```

Configure in docs frontend via `NEXT_PUBLIC_BANZAMIA_API_URL`.

---

## Endpoints

### `GET /health`

Health check. Returns 200 when the API is ready to accept requests.

**Response:**
```json
{ "status": "ok", "version": "1.0.0" }
```

---

### `POST /ask`

Submit a chat message and stream the response.

**Request:**
```json
{
  "messages": [
    { "role": "user",      "content": "Como funciona a propagação de trace_id?" },
    { "role": "assistant", "content": "O trace_id é propagado..." },
    { "role": "user",      "content": "E nos pagamentos QR?" }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `messages` | `ChatMessage[]` | Full conversation history. Last message must be `role: "user"`. |

**Response format:** Server-Sent Events (SSE)

Content-Type: `text/event-stream`

#### SSE event types

**`meta`** — emitted first, before any content chunks:
```
data: {"type":"meta","model":"qwen-14b","taskType":"DOCS","actual_provider":"mock"}
```

| Field | Description |
|-------|-------------|
| `model` | Model identifier used for this response |
| `taskType` | `DOCS` \| `CODE` \| `REASON` \| `VALIDATE` \| `CERTIFY` |
| `actual_provider` | Actual model/provider used (for observability) |

**`chunk`** — content token(s):
```
data: {"type":"chunk","content":"O trace_id é gerado..."}
```

**`citations`** — emitted when the model returns citations (may arrive before or after content):
```
data: {"type":"citations","citations":[
  {
    "type": "rfc",
    "label": "RFC-0003 Traceability System",
    "ref": "rfc/RFC-0003.md"
  },
  {
    "type": "invariant",
    "label": "INV-TRACE-001",
    "ref": "docs/validation/INVARIANT_TAXONOMY.md"
  }
]}
```

**`done`** — stream end signal:
```
data: {"type":"done"}
```

**`error`** — stream error:
```
data: {"type":"error","message":"Model unavailable"}
```

#### Citation types

| `type` | Description | UI colour |
|--------|-------------|-----------|
| `rfc` | RFC governance document | Gold |
| `adr` | ADR architecture decision | Blue |
| `api` | API specification | Violet |
| `invariant` | Financial invariant | Wine red |
| `file` | Source file | Muted |
| `vector` | Vector DB retrieval result | Green |

---

## TypeScript Client

The client library (`apps/docs/lib/banzamia-client.ts`) wraps the API:

```typescript
import { chatStream, isLiveMode, type ChatMessage, type Citation } from '@/lib/banzamia-client'

// Check if live API is configured
if (isLiveMode) {
  console.log('Connected to:', process.env.NEXT_PUBLIC_BANZAMIA_API_URL)
}

// Stream a response
await chatStream(
  [{ role: 'user', content: 'Explain INV-STL-001' }],
  (chunk, meta) => {
    if (meta) {
      console.log('Model:', meta.model, 'Task:', meta.taskType)
    }
    process.stdout.write(chunk)
  },
  (citations) => {
    console.log('Citations:', citations)
  },
  abortController.signal,
)
```

### Types

```typescript
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface StreamMeta {
  model: string
  taskType: string
  actual_provider?: string
}

interface Citation {
  type: 'rfc' | 'adr' | 'api' | 'invariant' | 'file' | 'vector'
  label: string
  ref: string
}
```

---

## Demo Mode

When `NEXT_PUBLIC_BANZAMIA_API_URL` is not set, the client uses static `DEMO_RESPONSES`:

```typescript
export const isLiveMode = !!process.env.NEXT_PUBLIC_BANZAMIA_API_URL
```

Demo responses match query patterns and return pre-written answers with mock citations. Demo mode is clearly indicated in the UI with an amber badge.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| API unreachable | Falls back to demo mode if configured, otherwise shows error message |
| Stream interrupted | AbortController signal triggers clean teardown |
| Non-abort error | Error message shown in chat bubble: "Erro ao conectar com BanzamIA" |
| Invalid request | API returns 400 with error message in SSE stream |

---

## Rate Limiting

The BanzamIA API applies rate limiting per IP:
- 60 requests per minute in normal operation
- Burst allowance of 10 requests

Rate limit headers follow standard `X-RateLimit-*` convention.

---

## References

- `apps/docs/lib/banzamia-client.ts` — client implementation
- `/Users/fm65/BanzamIA/apps/api/` — server implementation
- [Architecture](architecture.md) — system architecture
