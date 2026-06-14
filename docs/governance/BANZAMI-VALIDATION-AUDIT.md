# Banzami Validation Studio — Purification Audit (Phase 1)

**Audit:** BANZAMI-VALIDATION-STUDIO-PURIFICATION-001
**Date:** 2026-06-14
**Question the studio must answer:** *Is Banzami ready to operate real-world payments?*
**Status:** Read-only inventory. No matrix change applied. Changes are gated by CLAUDE.md §16.

> The validation matrix already underwent operator purification in earlier passes
> (website, protocol mirror, contracts, BanzAI removed). This audit removes the
> **remaining non-operator items**: documentation, architecture-decision records,
> and roadmap/future entries — none of which represent an operator failure mode.

---

## Validation philosophy applied

For every item: **"Can a real operator fail to process payments because this is missing?"**
If **NO → DELETE**. If **YES → KEEP** (rewrite/reorganize as needed).

The studio is an **operator readiness tracker** — not a documentation, protocol,
architecture, or governance tracker.

---

## Inventory & classification (76 items)

### DELETE — 13 items (not operator readiness)

| Item | Title | Why delete |
|------|-------|-----------|
| `DOC-004` | Plataforma de validação (validation-studio) | The studio is internal tooling, not a payment capability |
| `IDT-001` | Documento de referência oficial (BANZAMI_REFERENCE.md) | A reference *document* — documentation theory |
| `ARC-001` | Core financeiro em Rust | Architecture decision; the capability is tracked by LED/WAL items |
| `ARC-002` | Camada API em Go | Architecture decision; tracked by API/WH items |
| `ARC-003` | Frontend TypeScript/Next.js | Architecture decision; tracked by BW/BM items |
| `ARC-004` | PostgreSQL como fonte única | Architecture decision; tracked by LED items |
| `ARC-005` | Monólito Modular | Architecture essay |
| `ARCH-REPO-001` | Repository layout freeze | Governance / architecture-freeze theory |
| `RD-001` | App móvel consumidor (Flutter) | Roadmap; duplicates `APP-001` |
| `RD-002` | Pagamentos recorrentes | FUTURE — not a launch gate |
| `RD-003` | Plugin WooCommerce/WordPress | Off-strategy (plugin removed) |
| `RD-004` | Carregamento por cartão de débito | Wrong model — Banzami is wallet-native, no cards |
| `RD-005` | Expansão geográfica além de Angola | Premature — Angola first |

### KEEP — 63 items (real operator capabilities)

All capability items remain: `IDT-002/003` (identity & positioning), `WAL-*`
(wallet), `HDL-*` (@banza handle), `QR-*`, `P2P-*`, `APP-001`, `PL-*` (pay links),
`PR-*` (payment requests), `BM-*` / `BW-*` (business mobile/web), `SDK-*`, `API-*`,
`WH-*` (webhooks), `SBX-001` (sandbox), `LED-*` (ledger), `KYC-*`, `RSK-*` (risk),
`SEC-*` (security), `PAY-*` (payouts), `REF-*` (refunds/disputes), `OBS-*`
(observability), `EMS-*` (EMIS/settlement).

> No REWRITE/MERGE of titles is required: earlier passes already renamed products
> (Banza → Banzami) and repointed evidence to existing operator assets. Every kept
> item references real operator code, tests, migrations, or APIs.

---

## Category restructure

### REMOVE — 3 categories (now empty after deletions)
- `cat-docs` "Site & Documentação"
- `cat-arch` "Arquitectura"
- `cat-roadmap` "Roadmap"

### KEEP — 21 operator categories
Identidade & Posicionamento · Banzami Wallet · @banza · Pagamentos QR ·
Transferências P2P · Pay Links · Pedidos de Pagamento · Banzami Business (Móvel) ·
Banzami Business (Web) · SDKs · API REST · Webhooks · Sandbox · Ledger &
Contabilidade · KYC/KYB · Motor de Risco · Segurança · Levantamentos · Reembolsos
& Disputas · Observabilidade · EMIS & Bancos.

### GAPS (operator areas with no items yet — recommended future)
The target model also calls for **Operations** (runbooks) and **Support**
(workflows). There are no operator-readiness items for these today — flagged as
gaps, not created as empty categories.

---

## Domain model

The studio's domain taxonomy (`apps/validation-studio/lib/types.ts`) groups items
by **engineering concern**, not by feature — features are already the *categories*.
The 24 "domains" requested are feature areas that the **categories** already carry.

**Recommendation:** keep the engineering-concern domain model, purged of the two
non-operator domains:
- **Remove `DOM-DOCS`** (Documentation & Governance) — used only by deleted items.
- **Remove `DOM-INFRA`** (Infrastructure) — used only by deleted `ARC-*`; reassign
  `EMS-*` (settlement rails) to `DOM-FIN`.

**Final operator domains (9):** `DOM-FIN` · `DOM-IDENTITY` · `DOM-CONSUMER` ·
`DOM-MERCHANT` · `DOM-DEV` · `DOM-SEC` · `DOM-COMPLIANCE` · `DOM-OPS` · `DOM-OBS`.

This keeps the studio's typed domain union valid and avoids duplicating the feature
taxonomy across both `categoryId` and `validationDomain`.

---

## Resulting statistics (proposed)

| | Before | After |
|---|---:|---:|
| Items | 76 | **63** |
| Categories | 24 | **21** |
| Domains | 11 (incl. DOM-DOCS, DOM-INFRA) | **9** (operator only) |
| Non-operator items | 13 | **0** |

After purification, every item answers exactly one question: *can Banzami operate
real payments?* — covering wallets, handles, QR, P2P, pay links, merchant tools,
SDKs, API, webhooks, ledger, settlement, payouts, KYC, risk, security,
observability, and EMIS.

---

*Phase 1 audit only. The matrix change requires the §16 approval phrase; the
domain-model edits (`types.ts`, `VALIDATION_DOMAINS.md`) are normal code changes.*
