# Documentation Priority Roadmap

**Version:** 1.0
**Date:** 2026-05-29
**Audit:** BANZAMI-CANONICAL-ALIGNMENT-AUDIT-013
**Status:** Complete

---

## Prioritization Framework

| Priority | Criterion |
|----------|-----------|
| P0 — Fix Now | Live page shows false information |
| P1 — This Week | External developer or operator would be misled |
| P2 — This Sprint | Capability is undocumented but implemented |
| P3 — Next Sprint | Documentation is incomplete but not misleading |
| P4 — Backlog | Polish and enrichment |

---

## P0 — Fix Now (already applied in this audit)

| # | Fix | File | Status |
|---|-----|------|--------|
| 1 | Roadmap: Protocol OS `vision` → `completed` | `apps/docs/app/roadmap/page.tsx:49` | ✓ APPLIED |
| 2 | BANZAMI_REFERENCE.md: 8 modules → 16 modules (3-layer table) | `docs/BANZAMI_REFERENCE.md:782` | ✓ APPLIED |
| 3 | sobre-banzamia metadata: Incomplete capability description | `apps/docs/app/sobre-banzamia/page.tsx:10–13` | ✓ APPLIED |

---

## P1 — This Week

### DOC-001: Replace `banzamia-product-architecture.svg`

The SVG used in BANZAMI_REFERENCE.md §9 shows 8 modules. With the reference now corrected to 16 modules but still referencing `banzamia-product-architecture.svg`, that SVG must be replaced with a 3-layer 16-module diagram.

- **New SVG:** `docs/images/architecture/banzamia-product-architecture.svg`  
- **Layout:** 3 horizontal layers (Protocolo / Operador / Inteligência), each with 4–6 module pills  
- **Style:** Match `protocol-operating-system.svg` (red gradient header, card pills)  
- **Also copy to:** `apps/docs/public/images/architecture/banzamia-product-architecture.svg`

---

### DOC-002: Update BanzAI standalone README

The standalone repo (`github.com/banzami/banzamia`) README predates the Protocol OS buildout. A developer discovering this repo would not know about 8 key modules.

**Changes needed:**
1. Change opening description to use "Protocol Operating System" canonical framing
2. Add the 8-capability table (Compreender → Federar)
3. Add new modules to architecture section: Simulator, Federation Intelligence, Memory, Digital Twin
4. Update folder structure to show `src/memory/`, new routes
5. Remove or clarify the outdated `core/orchestrator/` folder path (belongs to old standalone structure)

**Estimated effort:** 45 minutes

---

### DOC-003: Kernel README — Add BanzAI to ecosystem diagram

The main ecosystem ASCII diagram in `Banzami/README.md` ends at Banzami. BanzAI should appear as a separate branch or layer.

**Change:** Add BanzAI as a third axis of the ecosystem diagram (alongside Rust Core, Contracts, SDKs → Banzami, and separately → BanzAI as Protocol OS).

**Estimated effort:** 15 minutes

---

### DOC-004: Kernel README — Fix Shopify/WooCommerce listing

`Banzami/README.md` line 54 lists Shopify and WooCommerce as Banza-provided integrations. These conflict with the Africa-first SDK-first strategy. Replace with generic plugin framing.

**Estimated effort:** 5 minutes

---

## P2 — This Sprint

### DOC-005: Webhook schema contracts

`contracts/webhooks/` is empty. This blocks Level 2 (Settlement Operator) certification because webhook correctness cannot be verified. Write the canonical webhook payload schemas as OpenAPI/YAML or JSON Schema.

**Scope:** webhook envelope (event_type, trace_id, correlation_id, timestamp, payload), transfer.completed, settlement.completed, qr.paid, payment_request.completed

**Estimated effort:** 4 hours

---

### DOC-006: Runnable examples (at least 2 of 4)

All `examples/` directories are empty. At minimum, create:
1. `examples/qr-payment/` — TypeScript + BanzamiClient QR flow
2. `examples/webhook-handler/` — Express.js webhook receiver with signature verification

**Estimated effort:** 3 hours

---

### DOC-007: Federation documentation

RFC-0008 is referenced in code but not in the RFC list. Write or publish:
1. RFC-0008 text (federation discovery handshake protocol)
2. A practical "How to establish federation" guide

**Estimated effort:** 3 hours

---

### DOC-008: sobre-banzamia — add Protocol OS context before CTA

Currently the page jumps straight to a "Abrir BanzAI →" button without explaining what a Protocol Operating System is. Add 2–3 sentences above the CTA card.

**Suggested text:**
> O BanzAI é o Sistema Operativo do Protocolo Banza — 16 módulos especializados que tornam o protocolo compreensível, validável, simulável e certificável. Não é um chatbot. É a interface cognitiva do protocolo: onde as ferramentas determinam a verdade e a IA explica a verdade.

**Estimated effort:** 10 minutes

---

## P3 — Next Sprint

### DOC-009: Step-by-step production deployment guide

An external operator reading the kernel docs can run the sandbox but has no guide for production deployment (Go services + PostgreSQL + Rust kernel). Write `docs/deployment-guide.md`.

---

### DOC-010: "Why certification exists" explainer

New visitors understand WHAT the certification levels are but not WHY the 5-level model was designed this way. Write a short `docs/certification-why.md` explaining the trust and interoperability rationale.

---

### DOC-011: BANZAMI_REFERENCE.md §1 — clarify Banzami as first operator

Add "primeiro operador certificado" alongside "produto principal" to reduce narrative confusion between Banza-the-protocol and Banzami-the-product.

---

### DOC-012: Quality Dashboard — publish benchmark results

The Quality Dashboard module produces metrics. Publish a snapshot of current values in `docs/banzamia/quality-benchmarks.md` to build external trust in the RAG system.

---

### DOC-013: Audit and update `ecosystem-intelligence-layer.svg`

This SVG may still use old "intelligence layer" framing. Verify and update to use "Protocol Operating System" positioning.

---

## P4 — Backlog

| # | Task | Estimated Effort |
|---|------|-----------------|
| DOC-014 | `examples/merchant-checkout/` — full checkout integration | 4h |
| DOC-015 | `examples/payment-link/` — payment link via WhatsApp pattern | 2h |
| DOC-016 | Certificate authority process documentation | 3h |
| DOC-017 | Operator manifest publication guide (RFC-0005 + discovery) | 2h |
| DOC-018 | `force-multiplier-model.svg` — consolidate with `banzamia-force-multiplier.svg` | 30min |
| DOC-019 | BanzAI standalone repo: architecture section update (src/ layout) | 30min |
| DOC-020 | Observability guide: confirm `docs/observability/financial-tracing.md` exists | 15min |
| DOC-021 | `banzami-jobs` crate — add to kernel README directory tree | 5min |
| DOC-022 | Autonomous-protocol-vision.svg — mark completed items | 30min |

---

## Documentation Maturity Score

| Area | Current | Target (end of sprint) |
|------|---------|----------------------|
| BanzAI positioning | 70/100 | 90/100 |
| Feature coverage | 62/100 | 80/100 |
| Operator onboarding | 55/100 | 75/100 |
| Federation docs | 45/100 | 65/100 |
| Diagram accuracy | 65/100 | 85/100 |
| Contract completeness | 40/100 | 65/100 |
| **Overall** | **56/100** | **77/100** |

Applying the P0 + P1 + P2 items would bring documentation maturity from 56/100 to approximately 77/100.

---

## Naming Inversion — BANZA-NAMING-INVERSION-STEP-001

**Status:** Planning complete (2026-05-29) — migration not yet started  
**ADR:** `docs/adr/ADR-025-ecosystem-naming-inversion.md` (Banza kernel repo)

The legal company name (Banza) is currently assigned to the protocol layer, not the product. ADR-025 inverts this:

| Role | Before | After |
|------|--------|-------|
| Protocol / ecosystem | Banza | Banzami |
| Product / reference operator | Banzami | Banza |
| Protocol Operating System | BanzAI | BanzAI |

Migration is semantic — a global search-and-replace is explicitly forbidden. Every occurrence must be classified before renaming. See:

- `docs/migration/naming-inversion-map.md` — full legacy → new name table
- `docs/migration/naming-classification-rules.md` — occurrence class definitions
- `docs/migration/DO-NOT-GLOBAL-REPLACE.md` — why batch replace fails

**Protected (do not rename):** `banzami.org`, `contact@banzami.org`, `github.com/banzami`

Migration waves (each a separate commit wave):

| Wave | Scope |
|------|-------|
| 1 | Documentation (ADRs, READMEs, BANZAMI_REFERENCE.md) |
| 2 | Website copy (banzami.org pages, metadata, SVG text) |
| 3 | AI OS rename (BanzAI → BanzAI, components, routes) |
| 4+ | Repository, package, domain renames (each requires separate ADR) |
