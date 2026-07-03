# Product decision required — migration `0042_split_sessions`

> **STATUS: DECISION PENDING — product-owner approval required.** Do not apply and
> do not silently retire `0042`. It is **excluded** from the Sandbox refund/drift
> repair rollout until this is decided.

## Evidence

- `0042_split_sessions` (P2P-002 "divisão de conta") is **recorded applied** in
  `banzami_staging._sqlx_migrations` but its tables `split_sessions` and
  `split_contributions` are **physically absent** (backfill drift).
- The split **routes are still registered** in `core/api/src/main.rs`
  (`POST /internal/v1/splits`, `GET /internal/v1/splits/:id`,
  `POST /internal/v1/splits/:id/pay`) and `core/api/src/routes/splits.rs` exists.
  → With the tables absent, any call to these routes currently **500s** in Sandbox.
- Project history indicates the pre-protocol P2P split was **superseded by
  Collections (BANZA ADR-036 / "Dividir cobrança" on Collections)**;
  `collections` and `collection_shares` tables are present.

So there is a live contradiction: registered routes with no backing tables, and a
successor feature (Collections) already shipped.

## Options

### Option 1 — Retain Split Sessions
- Add a forward, idempotent repair migration re-creating `split_sessions` +
  `split_contributions` (+ indexes).
- Keep the `/internal/v1/splits*` routes.
- Add route + schema tests so the feature is exercised and drift-detected.
- *Use if* P2P split is still a wanted product surface distinct from Collections.

### Option 2 — Supersede with Collections (recommended, pending confirmation)
- **Do not** create the split tables.
- Quarantine/remove the `/internal/v1/splits*` routes (and `splits.rs`) so they
  return a **deliberate, safe response** (e.g., `410 Gone`/`404` with a
  "superseded by Collections" code) instead of a `500` from a missing table.
- Record the replacement relationship with **ADR-036 (Collections)** — a short
  superseding note; leave the `_sqlx_migrations` row intact (history is not
  rewritten), documented as retired.
- Add a test asserting the split routes return the deliberate response, not `500`.

## Recommendation

**Option 2 (supersede)** — Collections already replaces P2P split, and the current
state (registered routes, no tables, `500`) is the worst of both. But this is a
**product decision**; await the product owner. Until then, `0042` stays out of the
repair rollout and the split routes' `500` risk is flagged.
