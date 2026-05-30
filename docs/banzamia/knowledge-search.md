# BanzAI — Knowledge Search

**Version:** 1.0  
**Date:** 2026-05-28  
**Status:** Active

---

## Overview

Knowledge Search provides semantic search over all Banza protocol documentation. Unlike keyword search, it finds conceptually related content — searching for "money creation" returns invariants about double-entry balance and fee decomposition, not just documents that contain those exact words.

---

## Indexed Content

The knowledge base indexes:

| Source | Content |
|--------|---------|
| RFCs | Protocol specifications and governance decisions |
| ADRs | Architecture decision records (ADR-001 to current) |
| `docs/BANZA_REFERENCE.md` | Official public reference |
| `docs/architecture/BANZAMI_ECOSYSTEM_REFERENCE.md` | Architecture reference |
| `docs/validation/INVARIANT_TAXONOMY.md` | Financial invariant registry |
| `docs/validation/VALIDATION_DOMAINS.md` | Validation domain taxonomy |
| `docs/conformance.md` | Conformance suite specification |
| `docs/certification.md` | Certification model |
| `docs/banzamia/` | BanzAI documentation |
| SDK documentation | TypeScript, Flutter, PHP integration guides |

---

## Search Result Types

Results are typed and colour-coded by origin:

| Type | Label | Description |
|------|-------|-------------|
| `context` | CONTEXT | Protocol context documents (reference, architecture) |
| `conformance` | CONF | Conformance suite specifications |
| `protocol` | PROTO | Protocol entity definitions |
| `invariant` | INV | Financial invariant definitions |
| `adr` | ADR | Architecture decision records |
| `rfc` | RFC | Protocol RFCs |
| `vector` | VEC | Generic vector DB retrieval |

---

## Result Fields

Each result returns:

| Field | Description |
|-------|-------------|
| `id` | Unique result identifier (`vec_*`) |
| `source` | File path where the content was found |
| `type` | Result type (see above) |
| `title` | Document or section title |
| `excerpt` | Relevant excerpt from the source |
| `score` | Semantic similarity score (0.0–1.0) |

---

## Quick Searches

The Knowledge Search module ships with pre-defined quick searches for common protocol queries:

| Query | What it finds |
|-------|--------------|
| `settlement invariants` | INV-STL-001, INV-STL-002, gross/net/fee decomposition |
| `trace_id propagation` | Traceability invariants, trace event structure |
| `QR payment flow` | QR lifecycle, invariants, conformance suite |
| `ledger double-entry` | INV-LEDGER-001..004, double-entry model |
| `sandbox safety` | Environment isolation rules, SANDBOX-SAFETY-001 |

---

## Relevance Scoring

Results are ranked by semantic similarity. A score of:

- `0.95+` — Extremely relevant; likely the canonical source for this query
- `0.85–0.94` — Highly relevant; covers the topic from a related angle
- `0.70–0.84` — Related; may contain useful context
- `<0.70` — Tangentially related; review carefully

---

## Live vs Demo Mode

**Live mode:** Qdrant vector database is queried with embedded model. Returns real semantic search results from indexed protocol content.

**Demo mode:** Three static demo results are returned for any query, showing the result format and typical content. Results do not vary by query in demo mode.

The demo results demonstrate searches for:
- `contexts/financial-invariants.md` — INV-STL-001 (score: 0.97)
- `conformance/ledger/suite.json` — Ledger double-entry sub-suite (score: 0.92)
- `contexts/banzami-protocol.md` — Transfer entity decomposition (score: 0.88)

---

## Using Knowledge Search

### Via BanzAI UI

Navigate to **BanzAI → Knowledge Search**. Type your query and press Enter or click Search. Use the quick search chips for common queries.

### Via BanzAI Chat

```
> O que diz a documentação sobre liquidação de settlements?
```

BanzAI Chat automatically queries the knowledge base for every response, surfacing the most relevant citations.

---

## Connecting Live Vector Search

To enable real semantic search:

1. Deploy a Qdrant instance
2. Index protocol documentation into Qdrant collections
3. Configure BanzAI API with Qdrant connection string
4. Set `NEXT_PUBLIC_BANZAMIA_API_URL` to point to live BanzAI API

The BanzAI API handles embedding generation and Qdrant querying internally.

---

## References

- `apps/docs/components/banzamia/modules/KnowledgeModule.tsx` — UI implementation
- [Architecture](architecture.md) — BanzAI architecture including Qdrant integration
- [Roadmap](roadmap.md) — live knowledge API timeline
