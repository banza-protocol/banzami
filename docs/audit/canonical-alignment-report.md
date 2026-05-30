# Canonical Alignment Report

**Version:** 1.0
**Date:** 2026-05-29
**Audit:** BANZAMI-CANONICAL-ALIGNMENT-AUDIT-013
**Canonical Source:** `docs/BANZA_REFERENCE.md`
**Status:** Complete

---

## Executive Scores

| Dimension | Score | Grade |
|-----------|-------|-------|
| Terminology Consistency | 88/100 | B+ |
| Architectural Consistency | 74/100 | C+ |
| BanzAI Positioning | 70/100 | C |
| Feature Coverage (Documentation) | 62/100 | D |
| Certification Model | 97/100 | A |
| Product vs Protocol Distinction | 82/100 | B |
| Truthfulness | 79/100 | C+ |
| Landing Page Clarity | 73/100 | C |
| Diagram Accuracy | 65/100 | D |
| **OVERALL ECOSYSTEM CONSISTENCY** | **77/100** | **C+** |

---

## Section 1 — Terminology Consistency

### Status: GOOD (post-AUDIT-011)

The certification level rename (AUDIT-011) eliminated the most widespread terminology drift. All three repos now consistently use:
- Sandbox Operator (L0), Payment Operator (L1), Settlement Operator (L2), Federation Operator (L3), Infrastructure Operator (L4)
- "Protocol Operating System" in UI labels where audited

### Remaining Issues

**F-001** — `Banzami/README.md` line 54  
> "Integration plugins — WooCommerce, Shopify, Laravel, Node.js, PHP"  
Type: MISLEADING (D)  
Shopify and WooCommerce are listed as Banza-provided integrations. The strategic direction is Africa-first, payment-link-native, generic plugins — not western e-commerce platform adapters. These directories exist but are empty. Listing them as capabilities is misleading.

**F-002** — `Banzami/README.md` (ecosystem ASCII diagram)  
> Diagram shows: Banza → Banzami. BanzAI is not in the ecosystem diagram.  
Type: ARCHITECTURAL_DRIFT (C)  
BanzAI is a first-class product of the ecosystem. The main ecosystem visualization in the kernel README omits it.

**F-003** — `BanzamIA/README.md` — "The intelligence layer"  
> "BanzAI is not a generic AI assistant. It is a: Financial infrastructure reasoning engine / Operator certification intelligence system / Protocol integration copilot / Conformance and governance advisor / Architecture review system"  
Type: INCOMPLETE (B)  
These descriptions are all valid but use no canonical framing. "Protocol Operating System", "Cognitive Layer", "Protocol Intelligence Layer" — none appear. The standalone README predates the Protocol OS positioning.

---

## Section 2 — Architectural Consistency

### Critical Findings

**F-004** — `BANZA_REFERENCE.md` line 782 — **CRITICAL**  
> "O BanzAI disponível publicamente em `banzami.org/banzamia` é composto por **oito módulos especializados**"  
Type: FALSE (E)  
BanzAI currently has **16 active modules**. The product architecture table lists only the original 8 (Chat, Operator Builder, Conformance, Manifest Validator, Trace Explainer, SDK Assistant, RFC/ADR Explorer, Knowledge Search). The 8 new modules added in the Protocol OS buildout (System Status, Protocol Graph, Protocol Research, Cert. Copilot, Quality Dashboard, Protocol Simulator, Federation Intelligence, Protocol Memory, Digital Twin) are documented individually later in section 9 but the opening product table is factually wrong.

**F-005** — `apps/docs/app/roadmap/page.tsx` line 49 — **CRITICAL**  
> `{ id: 'r26', status: 'vision', title: 'Protocol Operating System', description: 'BanzamIA becomes the OS of the Banzami ecosystem...' }`  
Type: FALSE (E)  
The Protocol Operating System is BUILT. The 8 capabilities (Compreender, Explicar, Validar, Simular, Prever, Guiar, Certificar, Federar) are implemented. The SVG diagram `protocol-operating-system.svg` exists. Listing a delivered feature as a future "vision" is false.

**F-006** — `banzamia-product-architecture.svg`  
The SVG illustrating the BanzAI product architecture shows 8 modules in a 4×2 grid. This visual is now factually wrong — it omits 8 delivered modules. Every page that renders this SVG shows an outdated architecture.

**F-007** — `Banzami/README.md` — Ecosystem ASCII diagram  
The central ecosystem diagram in the kernel README shows only `Banzami → [Rust Core, Contracts, SDKs] → Banza`. BanzAI is mentioned in a later section but is absent from the main architecture diagram. A first reader of the kernel repo would not know BanzAI exists from the visual.

---

## Section 3 — BanzAI Positioning

### Summary

BanzAI positioning is strong in the canonical reference (section 9) and in the embedded `apps/banzamia/` documentation. The gap is in the **standalone BanzAI repo** and in **partial descriptions on supporting pages**.

**F-008** — `BanzamIA/README.md` — Missing Protocol OS framing  
The standalone repo README lists BanzAI capabilities as bulleted descriptions ("Financial infrastructure reasoning engine", etc.) without using any canonical positioning: no "Protocol Operating System", no "Cognitive Layer", no 8-capability framework (Compreender/Explicar/Validar/Simular/Prever/Guiar/Certificar/Federar).  
Type: INCOMPLETE (B)

**F-009** — `BanzamIA/README.md` — Missing new modules  
The standalone repo README's architecture section shows a folder structure that doesn't include `memory/`, `digital-twin`, or federation routes. The 8 new Protocol OS modules are absent from this documentation.  
Type: OUTDATED (C)

**F-010** — `apps/docs/app/sobre-banzamia/page.tsx` metadata  
> `description: 'BanzamIA — o Agente de Protocolo nativo de IA para construir, validar e certificar operadores Banzami.'`  
Type: INCOMPLETE (B)  
True but covers only 3 of the 8 capabilities. Missing: simular, federar, prever, guiar. A visitor reading only this page's SEO description gets an incomplete picture of BanzAI.

**F-011** — `Banzami/apps/banzamia/README.md` — "Protocol Operating System" title  
Correctly uses "Protocol Operating System" framing. ✓ PASS

**F-012** — `BanzamIA/apps/web/components/sidebar/Sidebar.tsx:132`  
> `"Protocol Operating System"` — ✓ PASS (was "Protocol Intelligence", fixed in AUDIT-011)

---

## Section 4 — Feature Coverage

| Capability | BANZA_REFERENCE.md | BanzAI standalone README | Banza kernel README | Banzami docs site |
|-----------|---------------------|--------------------------|----------------------|-----------------|
| RAG | ✓ Documented | ✓ Documented | ✗ Not mentioned | ✓ Documented |
| Protocol Graph | ✓ Documented (§9) | ✗ Not mentioned | ✗ Not mentioned | ✓ Documented |
| Research Agent | ✓ Documented (§9) | ✗ Not mentioned | ✗ Not mentioned | ✓ Module exists |
| Certification Copilot | ✓ Documented (§9) | Partial (generic) | ✓ Mentioned | ✓ Module exists |
| Protocol Simulator | ✓ Documented (§9) | ✗ Not mentioned | ✗ Not mentioned | ✓ Module exists |
| Federation Intelligence | ✓ Documented (§9) | ✗ Not mentioned | ✗ Not mentioned | ✓ Module exists |
| Protocol Memory | ✓ Documented (§9) | ✗ Not mentioned | ✗ Not mentioned | ✓ Module exists |
| Digital Twin | ✓ Documented (§9) | ✗ Not mentioned | ✗ Not mentioned | ✓ Module exists |
| Conformance | ✓ | ✓ | ✓ | ✓ |
| Manifest Validator | ✓ | ✓ | ✗ | ✓ |
| Trace Explainer | ✓ | ✓ | ✓ | ✓ |
| SDK Assistant | ✓ | ✓ | ✗ | ✓ |
| Knowledge Search | ✓ | ✓ | ✗ | ✓ |

**Gap Pattern:** The standalone BanzAI repo (`github.com/banzami/banzamia`) is the most outdated documentation surface. 7 of 13 capabilities are either not mentioned or only partially described there.

---

## Section 5 — Certification Model

### Status: EXCELLENT (97/100)

Post-AUDIT-011, the certification model is consistent across all repos. No deviations from the canonical 5-level model found in any searched file.

Minor note: The BanzAI standalone README lists Level 2 as requiring "+ traces" but the canonical reference lists Level 2 as "Full trace propagation, webhooks, event correlation." The standalone README may be slightly simplified but not incorrect.

---

## Section 6 — Product vs Protocol

### Status: GOOD overall, one structural tension

**F-013** — `BANZA_REFERENCE.md` §1  
> "**Banzami** é o produto principal do Banza: a rede angolana de pagamentos instantâneos por QR Code."  
Type: TRUE BUT INCOMPLETE (B)  
Calling Banzami "o produto principal" (the main product) is accurate from a commercial perspective but creates narrative confusion for a new visitor who might infer that Banza = Banzami's parent company rather than an open protocol that any operator can implement. The framing should either clarify "first operator" explicitly alongside "main product" or be restructured.

**F-014** — `apps/docs/app/layout.tsx`  
> `"Banzami constrói a infraestrutura que permitirá Angola pagar digitalmente. Banza é a rede de pagamentos instantâneos..."`  
Type: TRUE (A)  
Correctly positions Banza as infrastructure and Banzami as the payments network. ✓ PASS

No instances found where Banzami is presented AS the protocol. The distinction is generally maintained.

---

## Section 7 — Truthfulness Audit

| Finding | File | Truthfulness |
|---------|------|-------------|
| F-001 — Shopify/WooCommerce as integrations | `Banzami/README.md` | D — Misleading |
| F-002 — BanzAI missing from ecosystem diagram | `Banzami/README.md` | C — Partially Outdated |
| F-003 — No Protocol OS framing in standalone README | `BanzamIA/README.md` | B — Incomplete |
| F-004 — "8 modules" when 16 exist | `BANZA_REFERENCE.md:782` | E — **False** |
| F-005 — Protocol OS listed as "vision" | `roadmap/page.tsx:49` | E — **False** |
| F-006 — banzamia-product-architecture.svg shows 8 modules | SVG | E — **False** |
| F-007 — Ecosystem diagram omits BanzAI | `Banzami/README.md` ASCII | C — Partially Outdated |
| F-008 — Missing Protocol OS framing | `BanzamIA/README.md` | B — Incomplete |
| F-009 — Missing new modules in standalone README | `BanzamIA/README.md` | C — Partially Outdated |
| F-010 — Incomplete capability description in metadata | `sobre-banzamia/page.tsx` | B — Incomplete |
| F-013 — "produto principal" creates narrative tension | `BANZA_REFERENCE.md §1` | B — Incomplete |

**False (E) findings: 3** — These are the critical fixes.  
**Misleading (D) findings: 1** — Needs correction.  
**Partially Outdated (C): 3** — Should be updated.  
**True but Incomplete (B): 4** — Should be enriched.

---

## Section 8 — Landing Page Audit

### What would a first-time visitor misunderstand?

**banzami.org (homepage)**

1. ✓ The hero and manifesto quote correctly position Banzami as a payments network and Banza as the infrastructure builder.
2. ✓ Use cases (taxi apps, cantinas, ecommerce) are accurate for the Angola market.
3. ⚠ BanzAI appears as an "entrypoint widget" (`HomeBanzamIAEntry`) but the homepage doesn't explain what BanzAI IS before showing it. A new visitor sees the BanzAI chat interface without understanding why a payments infrastructure has an AI layer.
4. ⚠ The homepage metadata says "Banzami SDKs oficiais" — the visitor might not know whether these are published and available.

**banzami.org/sobre-banzamia**

1. ✓ The CTA correctly links to `/banzamia`.
2. ⚠ The content is sourced from `BANZA_REFERENCE.md §9` which has the "8 modules" issue — a visitor will read about 8 modules but find 16 in the actual interface.
3. ⚠ No mention of Protocol Simulator, Federation Intelligence, Protocol Memory, or Digital Twin in the module description table.

**banzami.org/roadmap**

1. ❌ **Critical**: "Protocol Operating System" appears as a future "vision" item. A new visitor reading the roadmap would think this is aspirational — but it's current reality.
2. ✓ Simulator, Federation Intelligence, Memory, Digital Twin all correctly show `status: 'completed'`.

**banzami.org/reference**

1. ✓ Content is sourced from BANZA_REFERENCE.md — comprehensive.
2. ⚠ The 8-module table in §9 will mislead visitors about BanzAI's current scope.

---

## Section 9 — Diagram Audit (Summary)

See `diagram-remediation-plan.md` for full SVG-by-SVG evaluation.

**Critical diagrams requiring update:**
- `banzamia-product-architecture.svg` — shows 8 modules, now 16. Score: 35/100
- `banzami-ecosystem.svg` — may omit Protocol OS framing. Needs verification.

**Diagrams confirmed accurate:**
- `protocol-operating-system.svg` — 8 capabilities, correct orbital layout. Score: 87/100
- `federation-intelligence.svg` — accurate. Score: 82/100
- `protocol-simulator.svg` — accurate. Score: 85/100
- `protocol-memory.svg` — accurate. Score: 83/100
- `operator-digital-twin.svg` — accurate. Score: 84/100

---

## Final Answer: Can a new visitor understand the ecosystem without ambiguity?

**Answer: PARTIALLY.**

| Question | Answer | Obstacle |
|----------|--------|---------|
| What is Banza? | YES | Well explained in landing page and reference |
| What is Banzami? | YES | Clear product/operator distinction maintained |
| What is BanzAI? | PARTIALLY | Correct in canonical reference; outdated in standalone repo; 8 vs 16 module discrepancy |
| Why is the architecture unique? | PARTIALLY | Not explained on homepage before showing BanzAI widget |
| Why does certification exist? | YES | Well documented in conformance/certification docs |
| Why does federation exist? | YES | RFC-0002/0005 and federation docs are present |
| Why does Protocol OS matter? | PARTIALLY | Listed as a "vision" on roadmap — contradicts "it's already here" |
