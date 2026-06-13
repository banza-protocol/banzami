# BANZAMI — Repository Inventory

**Audit:** BANZAMI-V1.0-PURIFICATION-AUDIT-001
**Version:** 1.0
**Date:** 2026-06-13
**Phase:** 1 — Complete Inventory
**Nature:** Inventory of identity & boundaries, not code quality. Maps every top-level element so ownership can be assigned in Phase 2.

> Ground truth: directly inspected `~/banzami`, cross-checked against `~/banza` and `~/banzai`.

---

## Top-level directories

| Path | Contents (summary) | First-glance owner |
|---|---|---|
| `apps/` | dashboard, admin, pay, checkout, merchant, mobile, docs, validation-studio | Banzami (operator) — except `docs/` site (mixed) |
| `services/` | api-gateway, public-api, admin-api (Go) | Banzami |
| `core/` | 19 Rust crates (ledger, wallets, transfers, qr, acquiring, settlement, …) | Banzami |
| `sdk/` | checkout-web, flutter, go, php, python, typescript | **Disputed — Banza-prefixed protocol SDKs** |
| `plugins/` | generic-node, generic-php, generic-laravel, shopify, woocommerce | Disputed (SDK consumers) |
| `contracts/` | events, openapi, qr, sdk-certification, webhooks | **BANZA — duplicates of `~/banza/contracts/`** |
| `sdk-certification/` | python, typescript, vectors (webhook signature vectors) | **BANZA — protocol conformance** |
| `db/` | 40 SQL migrations | Banzami |
| `docs/` | adr, audit, governance, architecture, runbooks, website, glossary, certification.md, conformance.md, BANZA_REFERENCE.md | Mixed |
| `infra/` | docker, terraform, monitoring, deployment | Banzami |
| `tools/` | internal scripts, check-repository-layout.mjs | Banzami |
| `assets/` | branding, icons, diagrams | Banzami |
| `contexts/`? | (none) | — |

## Top-level documents

| File | Role declared | Owner |
|---|---|---|
| `CLAUDE.md` | Operator engineering constitution | Banzami |
| `README.md` | ~1973 lines — operator + heavy protocol/ecosystem narrative | Mixed |
| `BANZAMI_REFERENCE.md` | Operator reference (source for site) | Banzami |
| `BANZAMI_ARCHITECTURE.md` | Operator architecture | Banzami |
| `BANZAMI_PRODUCTS.md` | Product catalogue | Banzami |
| `BANZAMI_GOVERNANCE.md` | Operator governance (explicitly defers protocol to ~/banza) | Banzami ✓ clean |
| `BANZAMI_SECURITY.md`, `_OPERATIONS.md`, `_DEPLOYMENT.md`, `_ROADMAP.md` | Operator docs | Banzami |
| `docs/BANZA_REFERENCE.md` | **Copy of protocol reference** inside operator | BANZA (reference copy — by design, drives site) |

---

## `apps/` detail

| App | Stack | Role | Owner |
|---|---|---|---|
| `mobile` | Flutter | Consumer + merchant wallet app | Banzami |
| `dashboard` | Next.js | Merchant dashboard | Banzami |
| `merchant` | (assets) | Merchant brand assets | Banzami |
| `admin` | Next.js | Operator backoffice | Banzami |
| `pay` | Next.js | Public pay page | Banzami |
| `checkout` | Next.js | Hosted checkout | Banzami |
| `validation-studio` | Next.js | Internal validation tool | Banzami |
| `docs` | Next.js | **banzami.com — presents BANZA protocol** (components: `protocol/*`, `banzai/modules/*` incl. FederationModule, CertificationCopilotModule, RFCExplorerModule) | **Mixed — operator site rendering protocol content** |

## `core/` detail (all Banzami operator)

ledger · wallets · consumer-wallets · transactions · transfers · qr · payment-links · merchants · identity · payouts · settlement · reconciliation · acquiring · risk · compliance · routing · jobs · api · types

## `sdk/` detail (disputed)

| SDK | Package/identifier | Real code |
|---|---|---|
| `typescript` | `@banza/sdk` | Yes (src, dist, examples, tests) |
| `flutter` | `banza_flutter` | Yes (lib, build, assets) |
| `python` | `banza` (`sdk/python/banza`) | Yes (tests, examples) |
| `go` | module under `sdk/go/banzami` | Yes (examples) |
| `php` | `banza/sdk-php` (+ laravel) | Yes |
| `checkout-web` | browser checkout | Yes |

## `contracts/` detail (BANZA contamination)

| Subdir | Banzami content | In `~/banza`? |
|---|---|---|
| `openapi/` | activity.yaml, transfers.yaml, wallet-onboarding.yaml | **Byte-identical copies present in `~/banza/contracts/openapi/`** |
| `sdk-certification/` | README | Conformance lives in `~/banza/conformance/sdk` |
| `events/`, `qr/`, `webhooks/` | (mostly empty / README) | Canonical versions in `~/banza/contracts/` |

## `sdk-certification/` (top-level — BANZA contamination)

`python/test_webhook_vectors.py` · `typescript/webhook_vectors.test.ts` · `vectors/webhook_signatures.json` — protocol webhook-signature conformance vectors. Canonical signature spec is `~/banza/contracts/webhooks/signature.json`.

## `plugins/` detail (disputed)

generic-node · generic-php · generic-laravel · shopify · woocommerce — all consume the protocol SDK.

---

## Cross-repo reference (what already exists canonically in BANZA)

`~/banza` already owns: `contracts/{events,federation,openapi,qr,webhooks}`, `conformance/{sdk,federation,ledger,settlement,qr,manifests,badges,…}`, `BANZA_CERTIFICATION.md`, `BANZA_CONFORMANCE.md`, `BANZA_GOVERNANCE.md`. **`~/banza` has NO `sdk/` directory** — the operator's `sdk/` has no canonical protocol home yet.

`~/banzai` owns the Protocol Knowledge System (api/cli/web, conformance-runner, manifest-validator, knowledge-search).

---

*Next: `BANZAMI-OWNERSHIP-MATRIX.md` (Phase 2).*
