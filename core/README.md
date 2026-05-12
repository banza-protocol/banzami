# core

Rust financial core. The authoritative implementation of all monetary logic.

## Contents

- `ledger/` — Double-entry accounting engine. Append-only, immutable, atomic posting.
- `wallets/` — Wallet domain. Balance derivation, holds, reservations.
- `transactions/` — Transaction lifecycle (authorize, capture, refund, reverse).
- `settlement/` — Net settlement and clearing logic.
- `routing/` — Payment routing across acquirers and rails.
- `reconciliation/` — Reconciliation jobs against external integrations and bank statements.
- `risk/` — Risk scoring, velocity checks, fraud signals.
- `compliance/` — KYC/KYB, AML screening, sanctions, transaction monitoring.
- `payouts/` — Outbound disbursement orchestration.

## Stack

Rust · PostgreSQL

## Critical Invariants

- **Money is never floating point.** Use integer minor units or a fixed-precision decimal type. (CLAUDE.md §10.3)
- **Balances are derived from ledger entries, not stored mutably.** Direct balance mutation is forbidden. (§2.1)
- **All money movement is double-entry, atomic, and idempotent.** (§10.1, §8.3)
- **Every external integration must support reconciliation.** No black boxes. (§10.2)
- **All entries are immutable.** Corrections happen via reversing entries, not mutation.

## Conventions

- Each domain is a separate Cargo crate inside a Cargo workspace at the `core/` root.
- Domains expose typed APIs to the Go services layer. The transport mechanism (gRPC vs in-process FFI vs Unix domain socket) is pending and will be documented in an ADR.
- Every domain requires a corresponding doc in [`docs/domains/<name>/`](../docs/domains/) covering business purpose, architecture, flows, invariants, failure scenarios, reconciliation logic, and security assumptions (CLAUDE.md §5.2).
- Concurrency, idempotency, and reconciliation tests are mandatory for every monetary flow (§8.2).
