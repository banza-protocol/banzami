# BANZAMI — Services Audit

**Audit:** BANZAMI-V1.0-PURIFICATION-AUDIT-001
**Version:** 1.0
**Date:** 2026-06-13
**Phase:** 9 — Services & Core Audit

> Question: is any *protocol responsibility* (certification, governance, federation, standards definition) embedded in `services/` or `core/`?

---

## Scan result

Searched `services/**/*.go` and `core/**/*.rs` for: `certif*`, `federation`, `conformance`, `protocol rule`, `operator-certificate`.

**Result: zero matches.** The Go services and the Rust core contain **no protocol-governance, certification, or federation logic.** They are pure operator execution.

---

## Per-service ruling

| Service | Responsibility | Protocol logic embedded? | Ruling |
|---|---|---|---|
| `api-gateway` (Go :8080) | Merchant API, auth, rate-limit, idempotency, webhook delivery | No | **Banzami ✓** |
| `public-api` (Go :8083) | Consumer API, handle/PIN auth, transfers | No | **Banzami ✓** |
| `admin-api` (Go :8082) | Operator backoffice, compliance ops, reconciliation, settlements | No | **Banzami ✓** |
| `core` (Rust :8081) | Ledger, wallets, transfers, qr, acquiring, settlement, payouts, risk, compliance, routing | No | **Banzami ✓** |

## On `core/compliance` and `core/risk`

These are **operational** compliance and risk (KYC tiers, fraud scoring, AML screening *as the operator runs them*) — not protocol *certification*. Operational compliance is an explicit operator responsibility (`CLAUDE.md`: "compliance operacional", "acquiring", "reconciliação"). **Correctly owned by Banzami.** Do not confuse operator compliance (run-time, operator-specific) with protocol certification (definitional, BANZA).

## On `core/acquiring/providers/emis`

EMIS/Multicaixa integration is an **operator rail integration**, explicitly an operator decision (`BANZAMI_GOVERNANCE.md`: "Integration choices (EMIS, Multicaixa, bank partners)"). **Correctly owned by Banzami.** (Implementation maturity is covered in the separate strategic audit, not here.)

## On the Go→Rust contract

The services call `core-api` over loopback using request/response shapes that mirror the **protocol contracts** (`contracts/openapi/*`). When `contracts/` moves to BANZA, these shapes are *consumed from* BANZA's canonical contracts, not redefined locally. The code itself is operator-owned; the *contract it speaks* is BANZA's. No code move required — only the reference source for the contract changes.

---

## Verdict

`services/` and `core/` are the **purest operator zone in the repository** — 100% execution, 0% protocol governance. No service or crate moves. The only indirect effect: their API contracts are sourced from `~/banza/contracts/` once the contract directory is purified. This audit confirms the operator's heart is exactly where it should be.

---

*Next: `BANZAMI-PURIFICATION-PLAN.md` (Phase 10).*
