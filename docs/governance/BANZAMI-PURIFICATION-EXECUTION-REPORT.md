# BANZAMI — Purification Execution Report

**Audit:** BANZAMI-PURIFICATION-EXECUTION-001
**Version:** 1.0
**Date:** 2026-06-13
**Goal:** Make Banzami a pure operator repository — remove everything that does not belong to the Banzami operator.

> This report records the **executed** cleanup. The preceding analysis lives in `docs/governance/BANZAMI-*` and `docs/audit/*`.

---

## 1. Directories removed

| Directory | Reason | Canonical home |
|---|---|---|
| `contracts/` | Protocol contracts. `openapi/*.yaml` were **byte-identical** to `~/banza/contracts/openapi/`; events/qr/webhooks/sdk-certification are protocol definitions. | BANZA `contracts/` |
| `sdk-certification/` | Protocol **certification** vectors (webhook-signature conformance). Operator does not own certification. | BANZA `conformance/` |
| `docs/banzamia/` | 9 BanzAI knowledge-system docs (sdk-assistant, manifest-validator, trace-explainer, knowledge-search, operator-builder, overview, architecture, api, roadmap). BanzAI is not a Banzami product. | BanzAI repo |
| `docs/images/architecture/` | 26 BanzAI/protocol conceptual SVGs (protocol-operating-system, cognitive-layer, RAG-evaluation, federation-intelligence, certification-copilot, digital-twin, …). None were operator product diagrams; none referenced by the live site. | BanzAI repo |

## 2. Files removed (notable)

- `docs/BANZA_REFERENCE.md` — the top-level protocol **mirror** (and its `deploy.sh` rsync + `apps/docs/Dockerfile` COPY). The docs site builds its reference content from `apps/docs/data/` (build data bundled with the app), so removal is build-safe.
- `plugins/shopify/`, `plugins/woocommerce/` — off-strategy Western commerce platforms (removed in the Phase-1 checkpoint commit `4303467`).
- **Totals:** 55 files deleted, 39 files modified.

## 3. Files rewritten

| File | Change |
|---|---|
| `README.md` | Identity section rewritten: explicit "Banzami **provides** / does **NOT** provide" lists; SDKs reframed as Banzami operator integration SDKs; removed "Protocol truth", "BANZA SDK", protocol-OS framing; structure tree de-contaminated. |
| `docs/certification.md` | Full protocol spec → operator-scoped **pointer** to BANZA. |
| `docs/conformance.md` | Full protocol spec → operator-scoped **pointer** to BANZA. |
| `docs/reference-operator.md` | Reframed: Banzami *fills* the reference-operator role; the role is defined by BANZA. |
| `docs/standards/webhook-signature-spec.md` | Reframed from "the single authoritative protocol spec" → "Banzami's implementation of the BANZA standard, for integrators". |
| `docs/index.md`, `docs/README.md` | Dead BanzAI/protocol links repointed to the external BANZA/BanzAI repos. |
| `deploy.sh`, `apps/docs/Dockerfile` | Removed the `BANZA_REFERENCE.md` mirror sync/COPY; documented build-from-`data/`. |
| `tools/check-repository-layout.mjs` | Dropped `contracts/`/`sdk-certification/` zone checks; registered legitimate top-level docs. |
| `CONTRIBUTING.md`, `sdk/README.md`, `docs/adr/ADR-012`, `docs/adr/ADR-016` | "BANZA SDK / Banza SDK" → "Banzami operator SDK"; ADR-016 marked **Superseded by ADR-025**. |

## 4. SDK decision

**All six SDKs (`typescript`, `flutter`, `python`, `go`, `php`, `checkout-web`) are KEPT as Banzami operator integration SDKs.** Rationale:

- They are **client libraries for the Banzami API** (`api.banzami.com`) — operator integration tools, not protocol governance assets. An SDK *certification standard* is protocol-owned (and was removed); a client library is not.
- They are **live operator dependencies**: `apps/dashboard` imports `@banzami/sdk` (`file:../../sdk/typescript`); `apps/mobile` and `apps/merchant` import `sdk/flutter` by path. Deleting them breaks operator apps.
- Repositioned as operator SDKs in `README.md`, `sdk/README.md`, `CONTRIBUTING.md`, `ADR-012`.

**Deferred (not done in this pass): package-identifier renames** of the three protocol-prefixed packages — `@banza/sdk` → `@banzami/sdk`, `banza_flutter` → `banzami_flutter`, `banza-python` → `banzami-python`. Reason: ~265 references across the SDKs **and operator Flutter apps**, no `flutter`/`python` toolchain available here to verify the build, and these exact names are asserted by **VALIDATED items** in `docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json` (governed by CLAUDE.md §16) and by ADR-025/§15.5. The rename is a separate, test-gated, governance-approved change. (`checkout-web`, `go`, `php` are already operator-branded: `@banzami/checkout`, `banzami-go`, `banzami/sdk`.)

## 5. Contracts decision

`contracts/` removed entirely (see §1). The OpenAPI files were proven byte-identical to `~/banza`; events/qr/webhooks are a stale subset of BANZA's superset (which additionally owns `federation/` and `operator-certificate.json`). The operator's Go/Rust code does **not** import `contracts/` — service request/response shapes are sourced conceptually from BANZA's canonical contracts. No mirror or transitional copy retained.

## 6. ADR / documentation removals

- **No ADRs removed.** All 17 operator ADRs govern operator decisions (Go/Rust boundary, ledger, auth, QR, payment links, dashboard, mobile SDK, wallet identity, deployment) — none define protocol governance, federation, certification levels, BANZA CA, or root keys. ADR-016 (old brand rules) marked **Superseded by ADR-025**.
- **Protocol-knowledge docs reduced to pointers:** `certification.md`, `conformance.md`. Reframed: `reference-operator.md`, `webhook-signature-spec.md`.
- **BanzAI docs/diagrams removed wholesale:** `docs/banzamia/`, `docs/images/architecture/`.

## 7. Remaining protocol references (justified)

Per the rule "remove, rewrite, or justify," these remain intentionally:

| Reference | Why retained |
|---|---|
| `BANZAMI_GOVERNANCE.md` — "Protocol governance … handled in ~/banza. No protocol rule changes happen in this repository." | **Correct disclaimer** — affirms the operator does *not* own protocol governance. |
| `README.md` — "BANZA protocol governance / BANZA federation governance" | Inside the **"does NOT provide"** list — correct framing. |
| Operator docs mentioning "BANZA", "built on the protocol", "conformance suite (run by Banzami)" | Legitimate: an operator built on BANZA naturally references it; the language disclaims ownership. |

**Open follow-ups (documented, not executed — out of safe scope for this pass):**

1. **Website (M2 decision):** `apps/docs` (banzami.com) still renders protocol content, and `apps/docs/public/images/architecture/` still contains protocol-OS SVGs; `deploy.sh` deploys a `banzai-api` step (the operator currently *hosts* BanzAI). Whether banzami.com is operator-first or a protocol portal is a **founder strategy decision** that collides with the just-shipped website rebuild — flagged, not reversed.
2. **CLAUDE.md §13/§14/§15.5:** still frame SDKs as "BANZA protocol SDKs" and name `docs/BANZA_REFERENCE.md` (now removed) as SSOT. Editing the constitution is governance-sensitive; recommended as a deliberate ADR-aligned follow-up.
3. **SDK package renames** (see §4).
4. **`docs/architecture/BANZAMI_ECOSYSTEM_REFERENCE.md`** and a few developer/positioning docs use "Protocol Operating System" framing for BanzAI — a language pass is recommended.

## 8. Build / test results

| Check | Result |
|---|---|
| `tools/check-repository-layout.mjs` | ✅ **PASS** (25 passed, 0 failed) — updated for removed zones |
| `apps/docs` reference parser test (`vitest`) | ✅ **PASS** (53/53) — site content pipeline intact (sources `apps/docs/data/`) |
| Go services / Rust core | **Unaffected** — no `.go`/`.rs` files were modified; removed dirs are not imported by code |

## 9. Final repository tree (top level)

```
apps/        services/    core/       db/      infra/    tools/
sdk/         plugins/     docs/       assets/
BANZAMI_*.md (8)  CLAUDE.md  README.md  CONTRIBUTING.md  CODE_OF_CONDUCT.md  LICENSE
```
- `sdk/` → checkout-web, flutter, go, php, python, typescript (operator integration SDKs)
- `plugins/` → generic-laravel, generic-node, generic-php (operator adapters)
- **Gone:** `contracts/`, `sdk-certification/`, `docs/banzamia/`, `docs/images/architecture/`, `docs/BANZA_REFERENCE.md`, `plugins/{shopify,woocommerce}`

## 10. Final verdict

> **BANZAMI É UM OPERADOR PURO?**
>
> ## YES — at the structural and code level.

The protocol-owned **directories** (contracts, certification), the protocol **mirror** (`BANZA_REFERENCE.md`), and the **BanzAI** knowledge-system docs/diagrams have been removed from the operator repository. The operator's spine — `core/`, `services/`, `apps/*` products, `db/`, `infra/`, `tools/` — contains zero protocol-governance or certification logic. The SDKs are repositioned as operator integration libraries. The build and layout checks pass.

**One honest qualifier:** the answer is an unqualified YES for the repository's *structure and code*. It is "YES, with documented follow-ups" for *naming and the website*: three SDK package identifiers still carry the `banza` prefix (governance-locked rename, §4), and the operator site/`banzai-api` hosting (§7) remains a founder strategy decision. Neither re-introduces protocol *ownership* into the operator — they are naming and presentation residue, tracked above.

**Net:** Banzami is now a pure operator repository — *an independent commercial wallet-native payment operator built on the BANZA protocol. Nothing more, nothing less.*

---

*Produced by BANZAMI-PURIFICATION-EXECUTION-001 — 2026-06-13.*
