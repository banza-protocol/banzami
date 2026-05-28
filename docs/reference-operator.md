# Banzami Reference Operator

**Version:** 1.0  
**Date:** 2026-05-28  
**Status:** Active

---

## Overview

The Banzami Reference Operator is the canonical implementation of the complete Banzami protocol. It serves two purposes:

1. **Living specification** — it proves every protocol behaviour is implementable and correct
2. **Interoperability baseline** — all other operators are certified by matching Reference Operator behaviour

The Reference Operator is implemented as the **Banza** product. It holds Certification Level 3 and is working toward Level 4 with EMIS acquiring integration.

---

## Capabilities

The Reference Operator implements all standard protocol capabilities:

| Capability | Status | Conformance |
|------------|--------|-------------|
| `wallet.consumer` | Live | INV-WALLET-001, INV-IDENT-001 |
| `wallet.merchant` | Live | INV-WALLET-001 |
| `qr.static` | Live | INV-QR-001, INV-STL-001 |
| `qr.dynamic` | Live | INV-QR-001, INV-QR-002, INV-STL-001 |
| `p2p.transfer` | Live | INV-LEDGER-001, INV-STL-001, INV-STL-002 |
| `payment_links` | Live | INV-STL-001, INV-TRACE-001 |
| `settlement.t0` | Live | INV-STL-001, INV-STL-002 |
| `payout.batch` | Live | INV-LEDGER-001, INV-STL-001 |
| `reconciliation` | Live | INV-LEDGER-001, INV-LEDGER-002 |
| `acquiring.emis` | In progress | Level 4 |
| `federation_ready` | Planned | Level 4 |

---

## Manifest

```json
{
  "operator_id": "op_banza_reference",
  "version": "1.0.0",
  "certification_level": 3,
  "capabilities": [
    "wallet.consumer",
    "wallet.merchant",
    "qr.static",
    "qr.dynamic",
    "p2p.transfer",
    "payment_links",
    "settlement.t0",
    "payout.batch",
    "reconciliation"
  ],
  "invariants_asserted": [
    "INV-LEDGER-001",
    "INV-LEDGER-002",
    "INV-LEDGER-003",
    "INV-LEDGER-004",
    "INV-WALLET-001",
    "INV-STL-001",
    "INV-STL-002",
    "INV-QR-001",
    "INV-QR-002",
    "INV-IDENT-001",
    "INV-TRACE-001"
  ],
  "environment": "LIVE",
  "sandbox_available": true,
  "endpoints": {
    "sandbox": "https://sandbox-api.banzami.org",
    "live":    "https://api.banzami.org"
  }
}
```

---

## Architecture

The Reference Operator is built on the Banzami Kernel (18 Rust crates) with a Go orchestration layer:

```
┌─────────────────────────────────────────────────────────┐
│  api-gateway (:8080)   public-api (:8083)   admin-api   │
│  Merchant/SDK ops      Consumer ops         Admin ops   │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP (loopback)
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Rust Core API (internal — 18 crates)                   │
│  ledger · wallets · consumer-wallets · transactions     │
│  transfers · settlement · reconciliation · payouts      │
│  qr · payment-links · identity · acquiring              │
│  risk · compliance · routing · merchants · jobs · types │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
                       PostgreSQL
```

---

## Financial Model

### Ledger

The Reference Operator uses a pure double-entry ledger. Every financial event produces a balanced posting:

- Entries are append-only (never modified or deleted)
- Amounts are stored as i64 minor units
- Postings are committed atomically
- No floating-point arithmetic anywhere in the financial path

### Wallet types

| Wallet type | Description |
|------------|-------------|
| Consumer wallet | Personal Kwanza balance — one per @banza handle |
| Merchant wallet | Business Kwanza balance — one per merchant account |
| Fee wallet | Operator-controlled fee collection wallet |
| Settlement wallet | Interim wallet for payout staging |

### Payment flow (canonical QR)

1. Consumer scans merchant's static or dynamic QR
2. `qr.created` event already exists; consumer confirms amount
3. System creates transfer: `transfer.initiated` (gross/net/fee decomposition)
4. Ledger posting: DEBIT consumer wallet (gross), CREDIT merchant wallet (net), CREDIT fee wallet (fee)
5. All in one atomic transaction: `transfer.completed`, `qr.paid`, `settlement.assigned`
6. Consumer receives confirmation, merchant receives push notification

All events carry the same `trace_id`. INV-STL-001 and INV-LEDGER-001 are verified before the posting is committed.

---

## Local Ledger

The local ledger crate (`core/ledger/`) is the source of truth for all balances. Key properties:

- No balance is ever computed — it is always the cumulative sum of ledger entries
- `SELECT SUM(amount) WHERE wallet_id = ? AND direction = 'CREDIT' - SUM(amount) WHERE direction = 'DEBIT'` is the balance formula
- The database schema has a `CHECK` constraint preventing direct balance field mutations
- Reconciliation verifies ledger sums against cached balance records daily

---

## Mock Routing

The routing layer (`core/routing/`) determines which payment rail to use for each transaction. In the current Reference Operator implementation:

- Consumer-to-consumer P2P: always routed through internal ledger (no external rail)
- Consumer-to-merchant QR: always routed through internal ledger
- Payouts to bank: routed through EMIS (live) or simulated (sandbox)

The routing layer is designed for multi-rail capability (EMIS, future rails) without changing financial core logic.

---

## Demo Wallet (Sandbox)

In sandbox mode, the Reference Operator supports `POST /v1/sandbox/fund`:
- Creates a ledger credit entry for the requested amount
- The entry is tagged `environment = SANDBOX`
- It flows through the same double-entry ledger as production
- Sandbox entries can never appear in live reports (separate database, environment constraint)

---

## Observability

The Reference Operator emits OpenTelemetry traces for every financial operation:
- `deployment.environment` attribute on every span: `"LIVE"` or `"SANDBOX"`
- trace_id propagated from HTTP request through all internal service calls
- Ledger posting spans include: amount, wallet IDs, invariant check results

---

## Traceability

Every financial event carries a `trace_id` (`tr_<slug>` format). The complete event chain for any payment can be reconstructed using BanzamIA's Trace Explainer by entering the trace_id.

The traceability system is implemented by propagating the trace_id:
1. Assigned at the point of QR creation or transfer initiation
2. Included in all ledger entries for this flow
3. Included in all OpenTelemetry spans
4. Stored in the settlement record

---

## Sandbox Operator

The Sandbox Operator is the same Reference Operator codebase running with `ENVIRONMENT=SANDBOX`:
- Same Kernel, same invariants, same capabilities
- Completely separate PostgreSQL database
- No EMIS integration (sandbox payouts are simulated)
- `bz_test_…` API keys only
- `POST /v1/sandbox/fund` enabled
- Virtual balances — no real AOA moved

The Sandbox Operator demonstrates that a single codebase correctly handles both environments through configuration, not conditional logic.

---

## References

- `core/` — Rust financial core source
- `services/` — Go service layer source
- ADR-001 — Go/Rust service boundary
- ADR-002 — Double-entry ledger design
- ADR-006 — QR payment system
- ADR-013 — Wallet-native identity
- `docs/certification.md` — certification status
- `docs/conformance.md` — conformance suite
- `docs/validation/INVARIANT_TAXONOMY.md` — all invariants
