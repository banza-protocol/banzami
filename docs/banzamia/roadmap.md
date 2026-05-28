# BanzamIA — Roadmap

**Version:** 1.0  
**Date:** 2026-05-28  
**Status:** Active

---

## Current State (May 2026)

BanzamIA is deployed at `banzami.org/banzamia` with 8 fully functional modules. All modules operate in **demo mode** (static responses) by default. Live mode requires the BanzamIA API to be running and connected.

### What is live

| Component | Status |
|-----------|--------|
| Frontend (8 modules) | Deployed at `/banzamia` |
| Demo mode responses | Fully functional |
| Homepage entry card | Deployed |
| Deep-link routing (`?question=&auto=1`) | Fully functional |
| Theme (ivory institutional) | Deployed |

### What requires live API

| Feature | Status |
|---------|--------|
| Real streaming responses | Needs `NEXT_PUBLIC_BANZAMIA_API_URL` |
| Multi-model routing | Needs BanzamIA API running |
| Semantic knowledge search | Needs Qdrant vector DB |
| Citation sourcing | Needs indexed protocol docs |
| Tool calls (invariant checker, etc.) | Needs BanzamIA API + tools |

---

## Near Term (Q3 2026)

### BanzamIA Live API (H2 2026)

Deploy the BanzamIA API in production:

- Node.js API server at port 4001
- Multi-model routing orchestration
- Streaming SSE responses
- Citation generation from indexed docs
- Connect `NEXT_PUBLIC_BANZAMIA_API_URL` in docs-frontend build

**Unlocks:** Real AI responses, citations, model routing.

### Qdrant Knowledge Base (H2 2026)

- Deploy Qdrant vector database
- Index all protocol documentation (RFCs, ADRs, invariants, conformance specs)
- Connect to BanzamIA API embedding pipeline
- Enable live Knowledge Search

**Unlocks:** Semantic search, grounded citations, context-aware responses.

### Manifest Validator Tool Integration (H2 2026)

- Connect Manifest Validator UI to validation API endpoint
- Real-time structural and semantic validation
- Issue explanations in natural language
- "Fix with BanzamIA" quick actions

**Unlocks:** Real manifest validation, operator onboarding acceleration.

---

## Mid Term (H1 2027)

### Conformance Runner Integration

- Connect Conformance module to conformance suite runner
- Display real test execution results
- Per-invariant pass/fail with trace IDs
- Automatic certification level assessment

**Unlocks:** Operators can run conformance from the BanzamIA UI.

### Trace Explainer Live Mode

- Connect to production trace store
- Real trace retrieval by `trace_id`
- Live invariant verification against actual ledger state
- Anomaly detection and alert surfacing

**Unlocks:** Production-grade payment flow debugging.

### Operator Builder Output Integration

- Generated manifests submitted directly to certification queue
- Version tracking per operator
- Manifest diff for re-certification after protocol updates

**Unlocks:** End-to-end operator onboarding from BanzamIA.

### SDK Assistant Code Execution (Sandbox)

- Run generated TypeScript snippets in isolated sandbox
- Show real API responses for demo code
- Interactive playground for protocol exploration

**Unlocks:** Developers can test integration code without leaving BanzamIA.

---

## Long Term (H2 2027+)

### Autonomous Conformance Monitoring

- Scheduled conformance checks against certified operators
- Automated re-certification triggers on invariant failures
- Alert routing for critical invariant violations
- Public operator health dashboard

### BanzamIA Protocol Analyst

- Cross-trace analysis (detect patterns across multiple payment flows)
- Settlement reconciliation anomaly detection
- Operator benchmark comparison
- Protocol evolution impact analysis

### Multilingual Protocol Support

- BanzamIA responses in Portuguese (primary), English, French
- Localised SDK examples for Portuguese/English/French markets
- ADR and RFC translation pipeline

### BanzamIA for Third-Party Operators

- Isolated BanzamIA instances per certified operator
- Operator-specific knowledge base (their own manifests, traces, conformance history)
- White-label deployment option

### AI-Assisted RFC Drafting

- BanzamIA assists in drafting new RFCs
- Consistency checking against existing invariants
- Impact analysis on existing certified operators
- Human review gate before any RFC is accepted

---

## What BanzamIA Will Never Do

These constraints are architectural, not limitations:

- **Never initiate financial operations** — BanzamIA cannot move money
- **Never autonomously certify operators** — certification always requires human approval
- **Never modify the implementation matrix without governance phrases** — immutable audit trail
- **Never infer invariant truth** — invariants are checked by tools, not AI
- **Never be the source of truth** — tools and protocol documents are the source of truth

---

## References

- [Overview](overview.md) — what BanzamIA is today
- [Architecture](architecture.md) — technical architecture
- `docs/architecture/BANZAMI_ECOSYSTEM_REFERENCE.md §12` — full ecosystem roadmap
