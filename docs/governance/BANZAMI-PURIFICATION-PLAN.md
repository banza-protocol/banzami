# BANZAMI — Purification Plan

**Audit:** BANZAMI-V1.0-PURIFICATION-AUDIT-001
**Version:** 1.0
**Date:** 2026-06-13
**Phase:** 10 — Executable Purification Plan

> Every action: current path → destination → reason → risk → method. Actions are grouped by destination and sequenced so nothing breaks. **Cross-repo moves and top-level deletions are governed changes (CLAUDE.md §19, BANZAMI_GOVERNANCE.md) and require explicit approval before execution (Phase 11).**

---

## Risk tiers

- 🟢 **SAFE** — in-repo, reversible via git, no build impact. Can execute now.
- 🟡 **GUARDED** — in-repo deletion of duplicates; requires a pre-delete diff vs BANZA + §19 layout-rule update.
- 🔴 **CROSS-REPO / ADR** — spans `~/banzami` + `~/banza`; build/publish/CI impact; requires an ADR in `~/banza`. Not unilateral.

---

## A. MOVE → BANZA (protocol)

| # | Current path | Destination | Reason | Tier |
|---|---|---|---|---|
| A1 | `contracts/openapi/{transfers,activity,wallet-onboarding}.yaml` | already in `~/banza/contracts/openapi/` (identical) | Protocol contract; exact duplicate | 🟡 delete-after-diff |
| A2 | `contracts/{events,qr,webhooks}/` | `~/banza/contracts/` (superset already there) | Protocol contracts; BANZA is richer | 🟡 diff then delete |
| A3 | `contracts/sdk-certification/` | `~/banza/conformance/sdk` | Protocol certification | 🟡 delete |
| A4 | `sdk-certification/` (top-level: python, typescript, vectors) | `~/banza/conformance/` (reconcile vectors) | Protocol conformance vectors | 🟡 reconcile then delete |
| A5 | `sdk/{typescript,flutter,python,go,php,checkout-web}` | **new** `~/banza/sdk/` | Protocol-level SDKs (Banza-prefixed; §19.1) | 🔴 ADR in ~/banza |
| A6 | `plugins/{generic-node,generic-php,generic-laravel}` | `~/banza/` (SDK ecosystem) | Thin wrappers over protocol SDK | 🔴 ADR (move with A5) |

## B. MOVE → BanzAI (knowledge) / make thin-client

| # | Current path | Action | Reason | Tier |
|---|---|---|---|---|
| B1 | `apps/docs/components/banzai/modules/*` | Verify they call BanzAI API via `lib/banzai-client.ts`; extract any local protocol logic | Knowledge/assistance is BanzAI's | 🟢 verify (code review) |

## C. DELETE

| # | Path | Reason | Tier |
|---|---|---|---|
| C1 | `plugins/shopify` | Off-strategy (no Western platforms) | 🟢 |
| C2 | `plugins/woocommerce` | Off-strategy | 🟢 |
| C3 | `contracts/`, `sdk-certification/` (after A1–A4 confirmed in BANZA) | Now-empty protocol dirs | 🟡 |

## D. RENAME

| # | Item | From → To | Reason | Tier |
|---|---|---|---|---|
| D1 | Go SDK module path | `…/sdk/go/banzami` → protocol-prefixed `banza-go` | Naming consistency (finding L1) | 🔴 (with A5) |

## E. REORGANIZE / REFERENCES

| # | Action | Reason | Tier |
|---|---|---|---|
| E1 | Repoint `apps/checkout`, `apps/mobile`, `plugins/*`, docs examples, `deploy.sh` to BANZA-published SDKs | After A5 | 🔴 |
| E2 | `services/*` + `core/api`: source request/response contracts from `~/banza/contracts/` (reference, no code move) | After A1–A2 | 🟡 doc/ref only |
| E3 | Update `tools/check-repository-layout.mjs` to drop removed top-level zones | §19 compliance | 🟡 |

## F. SIMPLIFY (documentation)

| # | Action | Tier |
|---|---|---|
| F1 | `README.md`: rewrite structure section (remove "Protocol truth — contracts/, sdk-certification/"); make line 14 true | 🟢 |
| F2 | `docs/certification.md`, `docs/conformance.md`: replace bodies with pointers to `~/banza` + Banzami's status | 🟢 |
| F3 | `docs/glossary.md`: split protocol vs operator terms | 🟢 |
| F4 | `CLAUDE.md §19.2`: amend "must have artifact in `contracts/`" → "must reference canonical contract in `~/banza/contracts/`"; update §19.1 zone list | 🟡 governance edit |
| F5 | `docs/BANZA_REFERENCE.md`: add "MIRROR — canonical source ~/banza; do not edit" banner | 🟢 |

---

## Execution sequencing (so nothing breaks)

```
STAGE 0 (now, SAFE 🟢):
  C1, C2  delete shopify/woocommerce plugins
  F1, F2, F3, F5  documentation truth-fixes
  B1  verify BanzAI widgets are thin clients

STAGE 1 (GUARDED 🟡, needs diff + §19 update):
  A1–A4  diff each contract/vector vs ~/banza; if equal-or-subset → delete here
  C3     remove emptied contracts/ + sdk-certification/
  E3     update check-repository-layout.mjs
  F4     amend CLAUDE.md §19

STAGE 2 (CROSS-REPO 🔴, needs ADR in ~/banza):
  ADR-0xx in ~/banza: "Adopt protocol SDKs + generic plugins into BANZA"
  A5, A6  create ~/banza/sdk + ~/banza/plugins; port code + history
  D1      standardize Go module prefix
  E1      repoint operator consumers to published SDKs
  Publish: npm @banza/sdk, pub.dev banza_flutter, PyPI banza, Packagist banza/sdk-php, Go module
  Then delete sdk/ + plugins/ from operator; update README/§19/check-layout
```

---

## What is explicitly NOT moved (stays operator)

`core/`, `services/`, `apps/{mobile,dashboard,admin,pay,checkout,merchant,validation-studio}`, `db/`, `infra/`, `tools/`, `assets/branding`, all `BANZAMI_*.md`, operator `docs/{adr,runbooks,architecture}`, `BANZAMI_GOVERNANCE.md`. The operator's execution spine is untouched.

---

## Approval gate (per CLAUDE.md governance)

- **Stage 0** is reversible and in-repo → may execute on a simple go-ahead.
- **Stage 1** deletes top-level dirs → requires confirming BANZA supersets + a layout-rule amendment.
- **Stage 2** is a protocol-repo change → requires an **ADR in `~/banza`** and a coordinated two-repo migration with SDK publishing.

**Open strategy decision (founder):** identity of `banzami.com` (operator-first vs protocol-portal) — Product Audit §M2. Blocks any change to `apps/docs` and partially conflicts with the just-shipped website rebuild.

---

*Next: execution (Phase 11, gated) then `BANZAMI-V1.0-PURIFICATION-REPORT.md` (Phase 12).*
