# Phase 2 — frozen migrations (Split Charges / BANZA ADR-036)

These migrations are **intentionally frozen** and are deliberately kept OUT of the
active sqlx migration source (`db/migrations/`), so `sqlx migrate run` never applies
them. They back the **Collections / Split Charges** prototype, whose financial
contract is not yet ratified (BANZA ADR-036). Per the protocol-first rule
(CLAUDE.md / Banzami ADR-019), the concept must be frozen in the protocol before the
operator ships its definitive schema.

Frozen until Phase 2:

- `0064_collections.sql`
- `0065_payment_intents.sql`
- `0066_collection_shares.sql`

Status by environment (2026-06-30):

- **LIVE `banzami`** — NOT applied (correct; frozen).
- **SANDBOX `banzami_staging`** — tables exist from earlier prototyping; they are
  untracked extras (not recorded in `_sqlx_migrations`) and harmless.
- **DEV** — not applied.

## Reintroduction (Phase 2)

When Split Charges is finalized with BANZA ADR-036 and the Business App:

1. Reconcile the schema with the ratified contract (one definitive migration — no
   churn).
2. Move the file(s) back into `db/migrations/` renumbered to the then-current tail
   of the sequence, using `CREATE TABLE IF NOT EXISTS` so they are a no-op on the
   sandbox DB that already has the prototype tables and a create on LIVE/DEV.
3. `sqlx migrate run` applies them everywhere; drift check then expects them with no
   `PARITY_IGNORE`.
