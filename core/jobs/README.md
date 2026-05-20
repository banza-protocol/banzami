# core/jobs/

Canonical location for background jobs owned by the financial core.

## Purpose

Background jobs in the financial core are Tokio tasks spawned by `core/api` at startup. They run on a fixed schedule and are owned by the same domain crates as the financial logic they operate on.

## Current state

Background jobs are currently embedded inside `core/api/src/` and spawned inline at startup:

| Job | Location | Schedule |
|-----|----------|----------|
| QR code expiry worker | `core/api/src/` | `QR_EXPIRY_INTERVAL_SECS` (default: 60s) |
| Settlement scheduler | `core/api/src/` | `SETTLEMENT_SCHEDULER_INTERVAL_SECS` (default: 86400s) |
| Ledger balance checker | `core/api/src/` | `BALANCE_CHECKER_INTERVAL_SECS` (default: 3600s) |

## Target state

As the number of background jobs grows, extract each job into its own module here:

```
core/jobs/
├── qr_expiry.rs       QR code TTL enforcement
├── settlement.rs      Periodic settlement batch scheduling
├── balance_check.rs   Ledger double-entry invariant verification
└── mod.rs             Job registry and startup wiring
```

Each job module should be independently testable and schedulable.

## Rules

- All financial background jobs belong here, not in Go services.
- Jobs must be idempotent — re-running on overlap must be safe.
- Jobs must emit structured logs and Prometheus metrics.
- Job intervals are always configurable via environment variables.
