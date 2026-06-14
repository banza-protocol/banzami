# Banzami Validation Studio — Purification Report

**Audit:** BANZAMI-VALIDATION-STUDIO-PURIFICATION-001
**Date:** 2026-06-14
**Outcome:** The Validation Studio is now an **operator-readiness tracker** — it
answers one question only: *Can Banzami operate real-world payments?*
**Phase 1 audit:** [BANZAMI-VALIDATION-AUDIT.md](BANZAMI-VALIDATION-AUDIT.md)

---

## What changed

The matrix already carried earlier operator purifications (website, protocol
mirror, contracts, BanzAI removed). This pass removed the **remaining non-operator
items** — documentation, architecture-decision records, and roadmap/future entries
— and purged the domain model accordingly.

### Removed validations — 13 items

| Item | Reason |
|------|--------|
| `DOC-004` Validation studio platform | Internal tooling, not a payment capability |
| `IDT-001` Official reference document | Documentation, not a capability |
| `ARC-001`–`ARC-005` Rust core / Go API / Frontend / PostgreSQL / Modular Monolith | Architecture decisions; capabilities are tracked by LED/WAL/API/BW items |
| `ARCH-REPO-001` Repository layout freeze | Architecture-freeze / governance theory |
| `RD-001`–`RD-005` Consumer app / recurring / WooCommerce / card funding / geo expansion | Roadmap, future, off-strategy, or wrong model (wallet-native, no cards) |

### Removed domains — 2 (operator model)

- **`DOM-DOCS`** (Documentation & Governance) — not an operator concern.
- **`DOM-INFRA`** (Infrastructure) — architecture concern; `EMS-*` (settlement
  rails) reassigned to **`DOM-FIN`**.

Removed from `apps/validation-studio/lib/types.ts` and
`docs/validation/VALIDATION_DOMAINS.md`.

### Removed categories — 3

`cat-docs` (Site & Documentação) · `cat-arch` (Arquitectura) · `cat-roadmap`
(Roadmap).

### Rewritten / repaired

- 7 dangling informational `dependencies` cleaned from `IDT-002`, `IDT-003`,
  `SEC-001`, `OBS-001`, `OBS-003` (they pointed at deleted items).
- `EMS-001`, `EMS-002` reassigned to `DOM-FIN`.

> No title rewrites were needed: earlier passes already renamed products
> (Banza → Banzami) and repointed every kept item's evidence to existing operator
> assets. Zero items reference deleted protocol/website/documentation files.

---

## New structure

### Operator domains (engineering concern) — 8 in use
`DOM-FIN` · `DOM-IDENTITY` · `DOM-CONSUMER` · `DOM-MERCHANT` · `DOM-DEV` ·
`DOM-SEC` · `DOM-COMPLIANCE` · `DOM-OBS`
(`DOM-OPS` retained in the model for future operations items.)

### Operator categories (feature area) — 21
Identidade & Posicionamento · Banzami Wallet · @banza · Pagamentos QR ·
Transferências P2P · Pay Links · Pedidos de Pagamento · Banzami Business (Móvel) ·
Banzami Business (Web) · SDKs · API REST · Webhooks · Sandbox · Ledger &
Contabilidade · KYC/KYB · Motor de Risco · Segurança · Levantamentos · Reembolsos
& Disputas · Observabilidade · EMIS & Bancos.

---

## Final statistics

| | Before | After |
|---|---:|---:|
| Items | 76 | **63** |
| Categories | 24 | **21** |
| Domains in use | 10 | **8** (operator only) |
| Non-operator items | 13 | **0** |
| Dangling references | 7 | **0** |
| Empty categories | 0 | **0** |

Every remaining item maps to a real Banzami capability: wallet creation/funding,
`@banza` handle resolution, QR and pay-link payments, P2P transfers, merchant
onboarding and tooling, SDKs, REST API, webhook signing, double-entry ledger,
settlement, payouts, KYC/KYB, risk controls, security, observability, EMIS
integration, and the sandbox.

---

## Remaining gaps (recommended, not blockers)

The operator-readiness model also calls for **Operations** (runbooks) and
**Support** (workflows). No validation items exist for these yet — they are
genuine readiness gaps to fill, not items to invent retroactively.

---

## Verdict

> If the CEO asks **"Can Banzami launch tomorrow?"**, the Validation Studio now
> answers with operator readiness alone — no protocol theory, no documentation
> tracking, no architecture essays, no governance records.

**The Validation Studio is operator-only.**
