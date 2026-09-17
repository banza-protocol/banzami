# Phase 2 — REINTRODUCED into the tracked migration chain

> **Status (COLLECTIONS-PROTOCOL-AND-PRODUCT-001):** the Split Charges / Collections
> schema is no longer frozen. Collections is ratified in the protocol
> (BANZA **ADR-016** — *Collections: a composite obligation, never money*; and
> **ADR-015** — *Payment initiation: one intent, several surfaces*), with canonical
> contracts (`~/banza/contracts/collections/*.schema.json`,
> `~/banza/contracts/payment-intents/payment-intent.schema.json`) and invariants
> `INV-COLLECTION-001..008` in `~/banza/contracts/invariants.json`.

The three previously-frozen prototype migrations have been **folded into the active
`db/migrations/` chain**, renumbered to the current tail, written
`CREATE ... IF NOT EXISTS` so they are a no-op where the prototype tables already
exist (older Sandbox DBs) and a create everywhere else (fresh Sandbox / Live / dev):

| was (frozen)                  | now (tracked)                        |
|-------------------------------|--------------------------------------|
| `0064_collections.sql`        | `db/migrations/0156_collections.sql` |
| `0065_payment_intents.sql`    | `db/migrations/0157_payment_intents.sql` |
| `0066_collection_shares.sql`  | `db/migrations/0158_collection_shares.sql` |

The frozen copies were removed from this directory (single source of truth is now
the tracked chain). `sqlx migrate run` applies them everywhere; the live/sandbox
drift check (`tools/check-migration-drift.sh`) should be run WITHOUT
`PARITY_IGNORE=collections,collection_shares,payment_intents` once both environments
have migrated past `0158`.

**Environment note:** the schema exists in both Sandbox and Live (one canonical
contract — no `SandboxCollection`/`LiveCollection` split). Real-money movement in
Live remains governed independently by the platform-wide Financial Live readiness
gate; enabling the Collections *capability* does not make the platform Financial
Live ready.
