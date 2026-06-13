# BANZAMI — Contamination Report

**Audit:** BANZAMI-V1.0-PURIFICATION-AUDIT-001
**Version:** 1.0
**Date:** 2026-06-13
**Phase:** 3 — Contamination Detection

> "Contamination" = an element physically in `~/banzami` whose *correct owner* (Phase 2) is BANZA or BanzAI. Severity reflects how strongly it violates the operator boundary and how much confusion it creates.

---

## Severity legend

- **CRITICAL** — directly usurps a protocol responsibility the operator is explicitly forbidden from owning (certification, protocol contracts).
- **HIGH** — protocol-level asset hosted in the operator, creating ownership ambiguity and drift risk.
- **MEDIUM** — operator docs/UX that restate or own protocol knowledge instead of referencing it.
- **LOW** — naming/narrative residue.

---

## CRITICAL

### C1 — `sdk-certification/` (top-level) — protocol certification inside the operator
- **What:** webhook-signature conformance vectors (`python/`, `typescript/`, `vectors/webhook_signatures.json`).
- **Why critical:** certification/conformance is a *defining* BANZA responsibility. `CLAUDE.md` states Banzami "does NOT control the certification framework." Canonical home: `~/banza/conformance/` + `~/banza/contracts/webhooks/signature.json`.
- **Confusion created:** implies the operator certifies itself / owns the conformance standard.

### C2 — `contracts/` — protocol contract surface inside the operator
- **What:** `contracts/openapi/{activity,transfers,wallet-onboarding}.yaml` (**byte-identical** to `~/banza/contracts/openapi/`), plus `contracts/{events,qr,webhooks,sdk-certification}`.
- **Why critical:** protocol contracts define interoperability for *all* operators. Duplicated here, they can drift from BANZA and create two competing "truths." `CLAUDE.md §19.4`: "Protocol rule changes belong in ~/banza, not here."
- **Confusion created:** suggests Banzami authors/owns the protocol contracts.

---

## HIGH

### H1 — `sdk/` — Banza-prefixed protocol SDKs hosted in the operator
- **What:** 6 SDKs (`@banza/sdk`, `banza_flutter`, `banza` Python, Go, `banza/sdk-php`, checkout-web).
- **Why high (not critical):** they are real, working, operator-shipped code — but they are *protocol contract surfaces* (`CLAUDE.md §19.1`: "Official BANZA protocol SDKs"; §15.5 names them protocol-level). A second operator would consume the *same* SDKs.
- **Nuance that lowers urgency:** **`~/banza` has no `sdk/` directory** — there is no canonical home yet. Relocation requires creating + wiring `~/banza/sdk` (build, publish, CI). This is the single largest and riskiest move; it is a protocol-repo change and should go through an **ADR in `~/banza`**, not a unilateral operator edit.

### H2 — `plugins/` — protocol-SDK wrappers hosted in the operator
- **What:** generic-node/php/laravel, shopify, woocommerce.
- **Why high:** thin wrappers over the protocol SDK; reusable by any operator → BANZA ecosystem. Shopify/WooCommerce additionally off-strategy (Product Audit).

---

## MEDIUM

### M1 — `docs/certification.md`, `docs/conformance.md` — operator restating protocol knowledge
- Should *link* to `~/banza` canonical docs, not host explanations that can drift.

### M2 — `apps/docs` rendering protocol/federation/certification content
- **What:** `components/protocol/*` (CertificationLadder, HowItWorks, RoadmapMilestones, BanzAIBoundaryPanel) and `components/banzai/modules/*` (Federation, CertificationCopilot, RFCExplorer).
- **Tension to flag honestly:** the **just-completed website rebuild** (`docs/website/BANZA_WEBSITE_REBUILD_IMPLEMENTATION_REPORT.md`) *deliberately* made banzami.com present BANZA-as-protocol. That decision and this purification pull in opposite directions. This must be **reconciled as a product/strategy decision** (see Documentation Audit & Final Report), not silently deleted. The clean end-state: the operator site may *describe* the protocol it is built on, but protocol knowledge/assistance widgets should be thin clients of BanzAI, and the canonical protocol presentation should live at a BANZA-owned property.

### M3 — `docs/glossary.md` mixing protocol + operator vocabulary
- Split: protocol terms → reference BANZA; operator terms → keep.

---

## LOW

### L1 — Mixed SDK identifier naming
- Go SDK module path uses `banzami`; Python uses `banza`; TS uses `@banza/sdk`. Inconsistent prefix signals unresolved ownership. Standardize on the protocol prefix once ownership is settled.

### L2 — `README.md` (~1973 lines) heavy protocol/ecosystem narrative
- Operator README should be operator-first; protocol narrative belongs to BANZA's README. Trim and link.

---

## Contamination scoreboard

| Severity | Items | Disposition (proposed, Phase 10) |
|---|---|---|
| CRITICAL | C1 `sdk-certification/`, C2 `contracts/` | Remove from operator → BANZA (delete duplicates already canonical in ~/banza) |
| HIGH | H1 `sdk/`, H2 `plugins/` | Relocate to BANZA via ADR (cross-repo; not a unilateral move) |
| MEDIUM | M1 docs, M2 site, M3 glossary | Reference-not-restate; reconcile site strategy |
| LOW | L1 naming, L2 README | Rename/trim |

**Headline:** the operator is *operationally* clean (core/services/apps/db are unambiguously Banzami) but *structurally* carries the protocol's SDKs, contracts, and certification. The contamination is concentrated in four directories — `contracts/`, `sdk-certification/`, `sdk/`, `plugins/` — plus documentation/site narrative. None of it is in the money-path code; all of it is at the protocol boundary.

---

*Next: `BANZAMI-DOCUMENTATION-AUDIT.md` (Phase 4).*
