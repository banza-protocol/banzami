# Banzami Sandbox — Operator Lifecycle

**Status:** Increment 1.1 (hardened source foundation). **Version:** 1.0

> **Source-only.** No Sandbox infrastructure exists yet; no migration-runner has been
> deployed; no migration role model has been validated against a real disposable
> PostgreSQL database; no autonomous migration execution is enabled; no Live
> environment exists or is implied. The steps below describe the *intended* lifecycle
> the Blueprint supports; later increments wire each step to the shipped RT04E runner
> and the migration-runner image. Increment 2 performs runtime validation
> (disposable runner build + migration-test DB + ownership/privilege/secret-mount/
> SBOM proofs) **before** any VM reset or active Sandbox deployment.

The end-to-end lifecycle the Blueprint supports. This document contains no secret
values, hosts, domains, ports, credentials or private locations.

## 1. Fresh Sandbox bootstrap
1. Create only new Banzami-exclusive Docker network, named volume and runtime roots
   (per the Sandbox profile isolation identifiers).
2. Start the environment-dedicated PostgreSQL 16 instance — **no host-published port**,
   private data network only, password auth (no network `trust`).
3. Generate fresh protected secrets into the host secret root (root-owned `0700`,
   files `0600`), never in Git/Compose/env.
4. Create the three roles (ADR-BLUEPRINT-002): stable schema owner (`NOLOGIN`), runtime
   application role (`LOGIN`, minimum), and — per operation — a short-lived migration
   role.

## 2. Disposable migration-test database
Inside the same dedicated PostgreSQL instance, create a throwaway database, apply the
full canonical migration set via the migration-runner image, verify migration level,
checksums, drift, object ownership and role privilege boundaries, then destroy it.
Never an application target; never non-synthetic data.

## 3. Authorised Sandbox migration
Issue a single-use authorisation record (ADR-BLUEPRINT-004) bound to the pinned
revision, target `banzami_staging` and the migration-directory digest. Run the
migration via the ephemeral migration-runner image (read-only secret file). Verify
level, checksums and drift. The migration role is disabled/removed after completion.

## 4. Receipt generation
On success a `pending` migration receipt is written (shipped RT04E lifecycle):
release-bound, 30-minute freshness, sanitised, no secret.

## 5. Application deployment
Within 30 minutes, the shipped RT04E `service-replacement-only` mode atomically
consumes the pending receipt, captures rollback anchors, builds immutable images and
replaces only the four approved services.

## 6. Provenance and health
Verify each running container's image revision label **before** the Docker health
gate; success requires both.

## 7. Controlled application rollback
On a replacement failure, the shipped RT04E rollback restores the captured pre-state
image set from retained prune-proof tags. Migrations are forward-only and never
reversed.

## 8. Future Live policy differences
Same Blueprint and migration-controller implementation; Live differs only in policy:
explicit separate approval, dual-control capability, maintenance windows, verified
backup/restore readiness, immutable release attestation, and **no** autonomous
migration without explicit Live approval — in a **separate** infrastructure boundary
that shares nothing with Sandbox.
