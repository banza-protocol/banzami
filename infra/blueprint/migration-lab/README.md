# Banzami Blueprint — Disposable Canonical Migration Database Lab (Increment 2C)

**Status:** Increment 2C — first authorised canonical-migration execution against a local disposable database (reviewable; non-deploying). **Version:** 1.0

> **LOCAL · SYNTHETIC · DISPOSABLE · non-Sandbox · non-LIVE · non-production ·
> non-deploying.** This lab applies the complete canonical SQLx migration set to a
> throwaway PostgreSQL 16 database, only. It never contacts the VM, never uses
> `banzami_staging`/`live`/`prod`, never invokes the production RT04E entrypoint, and
> creates no Sandbox database, migration receipt, advisory lock or short-lived
> migration login (those remain 2D–2F).

## What this increment proves
- The attested Increment 2B runner image is built + verified (SBOM/provenance/inspection),
  then a **narrow derived image** embeds the canonical migration set (no runtime source mount).
- The full canonical migration set applies to a disposable `blueprint_migration_lab`
  database through a **controlled owner-session** (control-plane login → automatic
  `SET ROLE` to the `NOLOGIN` stable schema owner) — **no superuser applies migrations**.
- Migration integrity: metadata table present, applied count == discovered canonical
  count, each version once, latest level == discovered canonical latest level, all
  marked successful, all checksums present.
- A controlled **checksum-drift probe** proves SQLx rejects a modified migration workspace.
- **Ownership**: every application schema/relation/routine/type — and the migration
  metadata table — is owned by the stable schema owner; no runtime, control-plane or
  bootstrap identity owns any application object (narrow system/extension exclusions only).
- Network isolation (internal, no host port), digest-pinned PostgreSQL 16, runner
  revision + embedded-migration-digest agreement with checked-out source, and a
  file-only secret boundary (secret absent from env/config/logs/metadata).
- Deterministic scoped teardown with host-wide zero residue.

## What this increment does NOT do
No `banzami_staging` · no Sandbox/LIVE · no VM contact · no production RT04E entrypoint
· no migration receipt · no advisory lock · no short-lived migration login · no
application deployment · no claim that the production migration-role model is proven.

## Layout
```
infra/blueprint/migration-lab/
  Dockerfile.migrate            derived image: FROM attested 2B runner + embedded migrations + lab entrypoint
  docker-compose.migration-lab.yml   disposable pg16 (internal net, no host port) + owner-session bootstrap
  scripts/
    lab-entrypoint.sh           file-only-secret lab entrypoint (embedded in derived image)
    bootstrap-roles.sh          owner-session role model (stable owner / runtime / control-plane)
    migration-lab.sh            fail-closed orchestrator (capability|run|verify|clean|full)
    verify-db.sh                superuser read-only integrity + ownership verifier
infra/blueprint/validators/check-blueprint-migration-lab.mjs   static gate (no Docker)
```

## Use
```bash
make check-blueprint-migration-lab   # static gate (no Docker)
make blueprint-migration-lab-run     # 2B handoff → derived build → pg16 → bootstrap → apply migrations
make blueprint-migration-lab-verify  # integrity/level/checksum-drift/ownership/boundary
make blueprint-migration-lab-clean   # scoped teardown (this run's resources; guarded secret/artefact removal)
```
`migration-lab.sh full` runs the whole cycle and is the form used for the
reproducibility runs. All authority derives from validated repo state and the
current generated run identity `bzmigrationlab-<ts>-<pid>-<rand>`; ambient overrides
are cleared. Cleanup removes only current-run resources — never a global prune.
