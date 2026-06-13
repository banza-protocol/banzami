# BANZAMI — Structure Audit

**Audit:** BANZAMI-V1.0-PURIFICATION-AUDIT-001
**Version:** 1.0
**Date:** 2026-06-13
**Phase:** 5 — Structure Audit

> Two thought experiments resolve every ownership dispute.

---

## Thought experiment 1 — If BANZA disappeared tomorrow, what does Banzami still need to operate?

Banzami still needs: `core/` (ledger, wallets, transfers, qr, acquiring, settlement, reconciliation, payouts, risk, compliance, routing), `services/` (api-gateway, public-api, admin-api), `apps/` (mobile, dashboard, admin, pay, checkout), `db/`, `infra/`, `tools/`, operator docs.

Banzami would **not** need (because they only have meaning relative to the protocol): `contracts/` (protocol contract surface), `sdk-certification/` (protocol conformance), the *certification/federation* concepts, the protocol SDKs *as protocol artifacts* (it would still need *a* client library, but not a Banza-branded protocol SDK).

➡️ **Everything in `core/services/apps/db/infra/tools` is genuinely the operator's.** Everything at the protocol boundary is borrowed.

## Thought experiment 2 — If Banzami disappeared tomorrow, what must survive in BANZA?

Must survive (the protocol outlives any operator — `BANZA_GOVERNANCE.md`): the contracts, the certification framework, the conformance suite, the federation specs, and the protocol SDKs that *other* operators depend on.

➡️ **The SDKs, contracts, and certification must survive Banzami's death** — which proves they are not Banzami's. This is the decisive test.

---

## KEEP / MOVE / REMOVE

### KEEP (unambiguously operator)
| Element | Reason |
|---|---|
| `core/` (all 19 crates) | Operator's execution engine |
| `services/` | Operator API layer |
| `apps/mobile, dashboard, admin, pay, checkout, merchant, validation-studio` | Operator products/tools |
| `db/`, `infra/`, `tools/`, `assets/branding` | Operator infrastructure |
| `BANZAMI_*.md`, operator `docs/adr/`, `docs/runbooks/`, `docs/architecture/` | Operator documentation |
| `BANZAMI_GOVERNANCE.md` | Correct operator governance |

### MOVE → BANZA (protocol)
| Element | Destination | Method |
|---|---|---|
| `contracts/openapi/*.yaml` | `~/banza/contracts/openapi/` | **Delete here** (byte-identical copies already exist in BANZA) |
| `contracts/{events,qr,webhooks,sdk-certification}` | `~/banza/contracts/` | Delete here if duplicate; else port missing pieces to BANZA via ADR |
| `sdk-certification/` (top-level) | `~/banza/conformance/sdk` + `~/banza/contracts/webhooks/signature.json` | Reconcile vectors into BANZA conformance, then delete here |
| `sdk/` (6 SDKs) | **new** `~/banza/sdk/` | **ADR in ~/banza** (no canonical home exists yet) — largest move |
| `plugins/` | `~/banza/` (SDK ecosystem) or delete off-strategy | ADR; delete shopify/woocommerce per strategy |

### MOVE → BanzAI (knowledge) / make thin-client
| Element | Action |
|---|---|
| `apps/docs/components/banzai/modules/*` | Ensure they call BanzAI's API, not reimplement protocol logic |

### REMOVE / SIMPLIFY
| Element | Action |
|---|---|
| `docs/certification.md`, `docs/conformance.md` | Replace with pointers to BANZA |
| `README.md` protocol-truth structure section | Rewrite once artifacts are gone |
| `docs/glossary.md` protocol terms | Split / link |
| `plugins/shopify`, `plugins/woocommerce` | Delete (off-strategy — see Product Audit) |

---

## Structural blocker to honor (not optional)

`CLAUDE.md §19` declares the **repository layout FROZEN**, with a defined change process: any top-level directory removal requires updating (a) `README.md`, (b) §19, and (c) `tools/check-repository-layout.mjs`. And `§19.4` + `BANZAMI_GOVERNANCE.md`: **protocol changes (including relocating protocol SDKs/contracts) require an ADR in `~/banza`.**

➡️ Therefore the MOVE actions are **not** unilateral `rm`/`git mv`. They are governed changes spanning two repos. The Purification Plan (Phase 10) sequences them as: (1) ADR in ~/banza accepting the SDKs/contracts, (2) reconcile/port, (3) delete from operator + update frozen-layout artifacts, (4) repoint references/CI/deploy.

---

## Net structural verdict

The operator's **spine is clean** (core/services/apps/db/infra). The contamination is a **well-defined ring at the protocol boundary** — four directories plus docs. Removing that ring yields a pure operator. The work is real but bounded; the risk is in *execution sequencing across two repos*, not in identifying what moves.

---

*Next: `BANZAMI-SDK-OWNERSHIP.md` (Phase 6).*
