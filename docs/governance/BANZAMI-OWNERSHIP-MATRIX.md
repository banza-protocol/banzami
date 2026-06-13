# BANZAMI — Ownership Matrix

**Audit:** BANZAMI-V1.0-PURIFICATION-AUDIT-001
**Version:** 1.0
**Date:** 2026-06-13
**Phase:** 2 — Ownership Classification

> For each element: who is the *correct* owner — **BANZA** (protocol), **BanzAI** (knowledge system), or **Banzami** (operator) — and why. "Correct owner" ≠ "current location"; divergence is the contamination measured in Phase 3.

**Ownership test applied to every row:**
- Is it a *rule, contract, certification, federation, or standard*? → **BANZA**
- Is it *protocol knowledge, search, explanation, assistance*? → **BanzAI**
- Is it *execution: wallets, payments, QR, checkout, merchants, users, APIs, settlement, acquiring, ops*? → **Banzami**

---

## Core matrix

| Element | Correct owner | Justification |
|---|---|---|
| `core/` (ledger, wallets, transfers, qr, acquiring, settlement, reconciliation, payouts, risk, compliance, routing, …) | **Banzami** | Execution of payments. The operator *runs* the protocol's invariants; it doesn't define them. |
| `services/` (api-gateway, public-api, admin-api) | **Banzami** | Operator API surface and orchestration. |
| `apps/mobile, dashboard, admin, pay, checkout, merchant, validation-studio` | **Banzami** | Operator products and tooling. |
| `apps/docs` (banzami.com) | **Banzami (operator site)** *but content-governed by BANZA* | The *site* is an operator property; the *protocol content it renders* is BANZA's. The operator may present "built on BANZA", but must not author protocol rules here. |
| `db/migrations` | **Banzami** | Operator's database schema. |
| `infra/`, `tools/`, `assets/branding` | **Banzami** | Operator infrastructure and brand. |
| `BANZAMI_*.md` (reference, architecture, products, governance, security, operations, deployment, roadmap) | **Banzami** | Operator documentation. `BANZAMI_GOVERNANCE.md` correctly defers protocol governance to ~/banza. |
| `docs/adr/` (operator ADRs: auth strategy, deployment, UX) | **Banzami** | Operator implementation decisions. (Protocol ADRs belong to ~/banza.) |
| **`sdk/` (TS, Flutter, Python, Go, PHP, checkout-web)** | **BANZA** | Named protocol-level (`@banza/sdk`, `BanzaClient`, `banza_flutter`); `CLAUDE.md §19.1` defines `sdk/` as "Official BANZA protocol SDKs". A protocol SDK is a *contract surface* consumed by *all* operators — it is not an operator artifact. |
| **`contracts/openapi/*.yaml`** | **BANZA** | Byte-identical to `~/banza/contracts/openapi/`. Protocol contract surface. |
| **`contracts/{events,qr,webhooks,sdk-certification}`** | **BANZA** | Protocol event envelopes, QR payload format, webhook signature spec, certification — all definitional. Canonical in `~/banza`. |
| **`sdk-certification/` (top-level)** | **BANZA** | Webhook-signature conformance vectors = *certification*. The operator explicitly "does NOT control the certification framework" (`CLAUDE.md`). |
| `plugins/` (generic-node/php/laravel, shopify, woocommerce) | **BANZA** (SDK ecosystem) — *or delete off-strategy ones* | Platform plugins are thin wrappers over the **protocol SDK**, reusable by any operator. They belong with the SDKs in BANZA. Shopify/WooCommerce are also off-strategy (see Product Audit). |
| `docs/certification.md`, `docs/conformance.md` | **BANZA** (content) | Explain protocol certification/conformance — protocol knowledge, not operator ops. Should reference ~/banza, not restate it. |
| `docs/glossary.md` (protocol terms) | **BANZA** (content) / Banzami may keep an operator subset | Protocol vocabulary is BANZA's; operator-specific terms are Banzami's. |
| `apps/docs/components/banzai/modules/*` (RFCExplorer, CertificationCopilot, Federation) | **BanzAI** (function) | These render *protocol knowledge / assistance* — BanzAI's domain. If they call BanzAI's API, that is correct; if they reimplement protocol logic, that is contamination. |
| `docs/BANZA_REFERENCE.md` | **BANZA** (canonical) — *reference copy permitted* | Source of truth is `~/banza/BANZA_REFERENCE.md`. A read-only build-time copy to drive the site is acceptable *if* never edited here. |

---

## Summary by owner

**Stays in Banzami (operator):** `core/`, `services/`, `apps/*` (products), `db/`, `infra/`, `tools/`, `assets/`, all `BANZAMI_*.md`, operator `docs/adr/`.

**Belongs to BANZA (protocol):** `sdk/`, `contracts/`, `sdk-certification/`, `plugins/` (SDK wrappers), protocol explainer docs (`certification.md`, `conformance.md`, protocol glossary).

**Belongs to BanzAI (knowledge):** protocol-knowledge rendering in `apps/docs/components/banzai/*` should be *thin clients of BanzAI*, not local reimplementations.

**Decision principle:** if removing the BANZA protocol would make the element meaningless, the element belongs to BANZA. If removing Banzami would orphan it, it belongs to Banzami. Applied in Phase 5 (Structure Audit).

---

*Next: `BANZAMI-CONTAMINATION-REPORT.md` (Phase 3).*
