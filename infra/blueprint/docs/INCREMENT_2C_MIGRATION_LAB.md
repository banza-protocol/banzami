# Increment 2C — Disposable Canonical Migration Database Lab

**Status:** Increment 2C (first canonical-migration execution; local disposable lab only). **Version:** 1.0

> **Scope boundary.** Applies the complete canonical SQLx migration set to a local,
> synthetic, disposable PostgreSQL 16 database only. Not a VM deployment, not the
> active Sandbox, not LIVE, not Production. Never contacts/inspects/modifies the VM,
> never uses `banzami_staging`, never invokes the production RT04E entrypoint, creates
> no Sandbox database, migration receipt, advisory lock or short-lived migration login.

## Lifecycle
```
source/static gates → Docker + Buildx capability → unique migration-lab identity
→ protected temporary secrets → 2B attested runner build + verify (handoff)
→ derived image (embedded canonical migrations) → isolated pg16 (internal, no host port)
→ owner-session role bootstrap → embedded canonical migration application
→ integrity/level/pending/checksum verification → checksum-drift rejection probe
→ stable-owner ownership verification → network/image/secret boundary verification
→ scoped cleanup → zero-residue verification
```

## Owner-session (2C-only) migration execution
The canonical migrations execute through the approved 2A role model without a
dedicated migration login (that is 2D). The control-plane role is granted MEMBERSHIP
of the `NOLOGIN` stable schema owner and an automatic `SET ROLE` to it, so every
object created during migration is owned by the stable schema owner. No `GRANT ALL`.
No superuser applies migrations; the bootstrap superuser only creates roles and
transfers ownership of the pre-existing empty `public` schema — it never pre-creates
any migration object. If a canonical migration required privileges beyond this
owner-session contract, the lab HOLDs (`HOLD — CANONICAL MIGRATIONS REQUIRE
UNAPPROVED PRIVILEGES`) rather than escalate to superuser.

## Secret delivery
The database credential lives only in a read-only mounted file. The lab-only
entrypoint reads it into the private sqlx subprocess; it never appears in Docker
config, inspectable env, argv, image metadata, logs, SBOM, provenance, drift evidence
or reports. A file-path-only configuration value is the sole permitted surface.

## Integrity, drift and ownership
Discovered from canonical source (no hardcoded count): ordered migration count,
version set, latest level and a source digest. The lab fails closed on missing /
pending / unexpected / mis-ordered migrations, checksum mismatch, wrong latest level,
incomplete metadata, or embedded-vs-source divergence. The drift probe copies the
canonical set outside the repo, changes one byte of one file, mounts it read-only, and
requires SQLx to reject it on checksum. Ownership verification proves the stable owner
owns all application objects and the metadata table, with only narrow catalog/extension
exclusions.

## Explicitly unproven until later increments
- **2D** — dedicated short-lived migration login (create → act-through-owner →
  expire/remove) and least/most-privilege proof; the production migration-role model.
- **2E** — migration receipt single-use + advisory-lock runtime behaviour; end-to-end
  read-only secret-mount proof for a real (non-lab) migration run.
- **2F** — full-path secret non-leak + controlled teardown; only then any Sandbox
  provisioning decision.

No Sandbox, LIVE, production migration-role model, receipt, advisory-lock, deployment,
payment, Production or VM-reset readiness is certified by Increment 2C.
