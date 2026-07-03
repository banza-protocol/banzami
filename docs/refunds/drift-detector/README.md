# Schema-manifest drift detector + deploy gate (design)

**Status:** Proposal. Not wired to CI yet. Prototype validated read-only against `banzami_staging`.

## Why

`_sqlx_migrations` can claim a migration is applied while its DDL never ran (see the
migration-drift forensics — Sandbox was one-time **backfilled** with
`tools/sqlx-backfill.sh`). A generic SQL-migration parser is **not** sufficient:
the parser prototype missed a real missing column (`risk_flags.resolution`). The
authoritative source of truth must be a **reviewable expected-schema manifest**.

## Model

- **`schema-manifest.example.json`** — declarative, reviewed list of expected
  physical objects per feature: tables, columns (+ nullability), indexes,
  constraints, enums, functions where relevant. Grows with each shipped feature.
- **`introspect.sql`** — read-only; emits the live physical schema as one JSON
  object (tables, columns+nullability, indexes).
- **`check-schema-manifest.mjs`** — compares manifest vs live inventory, prints a
  readable diff, **exits 1 on any recorded/expected-but-absent object**.
- The SQL-parser reconciliation stays **supplementary** (a wide net), never the
  sole source of truth.

## Validated (read-only)

Run against live `banzami_staging`, the detector reported exactly the 12 drifted
objects — including `risk_flags.resolution`, which the parser heuristic missed.
Exit 1 (gate fail). No mutation.

```
psql -tA -f introspect.sql "$DATABASE_URL" > inventory.json
node check-schema-manifest.mjs schema-manifest.example.json inventory.json
```

## CI / deploy gate

The single migration path is `sqlx migrate run` (checksum-verified). The pipeline:

1. `sqlx migrate run`
2. introspect the target DB → `inventory.json`
3. `check-schema-manifest` → **fail the build/deploy on any drift**

No feature whose objects are declared in the manifest deploys while those objects
are absent (Refunds, KYC, KYB, team, consumer-devices, restitution-allocations).
The manifest is versioned alongside feature rollout: a feature's objects are added
to the manifest in the same change that ships its migration.

## Sandbox ≠ Production (mandatory)

The drift and every repair here are **`banzami_staging` (Sandbox) only**.
**Idempotency is not permission to touch Production.** Any Production remediation
is a separate workstream requiring its own: schema reconciliation (run this
detector against Production), backup + restore rehearsal, risk review, explicit
approval, and maintenance/deploy plan. Do **not** assume Production has the same
drift; prove it first.

## `tools/sqlx-backfill.sh` retirement

1. Apply the reviewed forward repairs so Sandbox schema == recorded history.
2. Remove `sqlx-backfill.sh` from all runbooks; mark deprecated, then delete.
3. New environments migrate from empty via `sqlx migrate run` only — never backfill.
4. Add this detector to CI + the deploy gate so a recorded-but-absent object can
   never ship silently again.
