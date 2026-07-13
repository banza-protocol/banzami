# Follow-up plan — supersede Split Sessions with Collections

**Decision:** Split Sessions is **superseded by Collections (BANZA ADR-016)**.
`0042_split_sessions` is **not** repaired or applied. This is a **separate**
workstream from the Sandbox schema-repair rollout (0090–0095) and is **not
started yet** — this document is the plan only.

## Problem
`core/api/src/routes/splits.rs` and its routes are still registered in
`core/api/src/main.rs`:
- `POST /internal/v1/splits`
- `GET  /internal/v1/splits/:id`
- `POST /internal/v1/splits/:id/pay`

The backing tables (`split_sessions`, `split_contributions`) are intentionally
absent (0042 not applied), so these endpoints currently **500** on a missing
table — an internal failure, not a deliberate "gone" response.

## Plan (focused, separate change)
1. **Quarantine the routes** — replace the split handlers (or the route
   registrations) with a single deliberate response: **`410 Gone`** (or `404`)
   carrying a stable code, e.g. `SPLIT_SESSIONS_SUPERSEDED`, message
   "Split Sessions is superseded by Collections." No table access, no 500.
2. **Record the supersession** — a short note/ADR reference tying Split Sessions
   to **Collections / ADR-036**; leave the `_sqlx_migrations` 0042 row intact
   (history is never rewritten), documented as retired-superseded.
3. **Do NOT create** `split_sessions` / `split_contributions`.
4. **Route-level tests** — assert each `/internal/v1/splits*` endpoint returns
   the deliberate superseded response (410/404 + code) and **never** an internal
   500 / missing-table error.
5. **Drift manifest** — do not add split tables to the schema manifest (retired);
   optionally record 0042 in a documented "retired/superseded migrations" list so
   the reconciler doesn't re-flag it as unexpected drift.

## Out of scope
No refund/restitution work, no schema repair rollout coupling, no Collections
change. This is purely retiring the dead P2P-split surface safely.
