# Increment 2E & 2F — Controlled Migration Lifecycle and Unified Completion Lab

**Status:** Increment 2E + 2F (local disposable). **Version:** 1.0

> **Scope boundary.** Local, synthetic, disposable labs only. Not a VM deployment, not
> Sandbox, not LIVE, not Production. Never contacts the VM; the authorisation/receipt
> **bind** to the `banzami_staging` target contract, but the disposable lab database is
> `blueprint_migration_lab` — proving the controlled contract without a real target.

## 2E — Controlled migration authorisation, receipt, lock and file-only execution
- **Single-use authorisation record** (`infra/blueprint/migration-control/scripts/authz.sh`):
  a current-run-only, non-symlink, single-hard-link, secret-free KEY=VALUE file bound to
  target `banzami_staging`, full source revision, parent runner digest, derived executor
  digest, embedded migration digest, approved service set, issue/expiry timestamps and a
  single-use state; atomically consumed (`issued → consumed`), never restored to pending.
- **Receipt lifecycle** — a separate record with the same guarantees; `pending → consumed`,
  once only; re-use, expiry, future-issue and mismatch are rejected.
- **Rejection matrix** (fail-closed, unit-proven): wrong revision / parent / executor /
  migration digest / service set, expired, future-issued, already-consumed, symlink,
  non-single-hard-link — all rejected.
- **Real advisory-lock concurrency**: a held PostgreSQL session-level advisory lock; a
  concurrent executor is refused (`MIGRATION_LOCK_HELD`, exit 9) and never mutates the DB.
- **File-only execution**: the derived attested control executor reads the credential only
  from a read-only mounted file (never argv/env/logs/metadata); the credential reaches
  `psql` via `PGPASSFILE` and `sqlx` via an in-process `DATABASE_URL` only; the effective
  mount is proven read-only. Uses the Increment 2D short-lived migration login; the login is
  removed after success or failure and its credential is proven unusable.
- **Controlled failure path**: a non-mutating executor failure (`fail-after-lock`) proves the
  receipt stays `consumed` (never restored) without corrupting canonical migration source.

The legacy manual RT04E path is unchanged and is never invoked.

## 2F — Unified completion lab
`make blueprint-complete-lab` runs, from clean state, the static gates then 2A → 2C → 2D →
2E standalone labs (2B is exercised as the attested runner handoff inside 2D/2E), then proves
host-wide zero residue across every category — `com.banzami.blueprint.lab`, `.runner-lab`,
`.migration-lab`, `.migration-identity`, `.migration-control` — plus builders and temp roots.
It reuses each standalone target (does not weaken earlier validators), is fail-closed, uses
generated per-run identities, and never prunes globally, invokes the VM or deploys services.

## Remaining (later phases)
- **Service-image attestation** — attested immutable images for the four Sandbox services.
- **Same-VM legacy reset** — Banzami/BANZA/BanzAI teardown (authorised).
- **Fresh Sandbox bootstrap + controlled migration (banzami_staging) + service deployment + validation.**

No Sandbox, LIVE, Production, payment, deployment or VM readiness is certified by 2E/2F.
