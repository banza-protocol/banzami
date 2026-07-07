# Banzami Blueprint — Migration Identity Lab (Increment 2D)

**Status:** Increment 2D — final migration identity + derived-executor attestation (local, disposable). **Version:** 1.0

> **LOCAL · SYNTHETIC · DISPOSABLE · non-Sandbox · non-LIVE · non-production.** Never
> contacts the VM; never uses `banzami_staging`/`live`/`prod`; never invokes the
> production RT04E entrypoint. 2E (authorisation/receipt/advisory-lock) and 2F
> (unified gate) remain separate.

## What this increment proves
- The derived migration executor has its **own** immutable identity + attestation:
  built from the attested 2B runner supplied as an `oci-layout` build-context pinned
  to the parent's **content digest**, with the executor's own **SBOM + provenance**,
  and labels binding it to the full source revision, parent content digest, embedded
  canonical migration digest and derived Dockerfile material.
- A **short-lived least-privilege migration login** (`LOGIN`, `CONNECTION LIMIT 1`,
  `VALID UNTIL`, no superuser/createdb/createrole/replication/bypass-RLS) is the **only**
  role granted stable-owner membership + automatic `SET ROLE`, so it applies the
  canonical migrations *as* the `NOLOGIN` stable owner. Runtime and control-plane roles
  are **not** owner members and cannot assume the owner. No blanket grants; no superuser
  applies migrations.
- Runtime proof: the login authenticates, applies the full canonical set, every
  application object + the metadata table is owned by the stable owner, no foreign role
  owns application objects, the login is least-privilege, and after execution the login
  is **removed**, its **membership is gone**, and its **credential is unusable**.
- File-only secret boundary (secret absent from env/config/logs/image metadata/SBOM/
  provenance/evidence); scoped teardown; host-wide zero residue.

## Layout
```
infra/blueprint/migration-identity/
  Dockerfile.migrate-attested          derived executor (FROM oci-layout base-runner, own identity labels)
  docker-compose.migration-identity.yml  disposable pg16 (internal, no host port) + short-lived-login bootstrap
  scripts/
    lab-entrypoint.sh                  file-only-secret entrypoint (embedded)
    bootstrap-migration-login.sh       role model incl. short-lived migration login
    migration-identity.sh              fail-closed orchestrator (capability|run|verify|clean|full)
    verify-identity.sh                 ownership + privilege-separation verifier (superuser RO)
    validate-derived-evidence.mjs      derived SBOM/provenance/linkage validator
infra/blueprint/validators/check-blueprint-migration-identity.mjs   static gate (no Docker)
```

## Use
```bash
make check-blueprint-migration-identity      # static gate (no Docker)
make blueprint-migration-identity-lab-run    # attested runner + attested derived + short-lived login migrate
make blueprint-migration-identity-lab-verify # evidence + ownership/privilege + lifecycle + secret boundary
make blueprint-migration-identity-lab-clean  # scoped teardown (guarded secret/artefact removal)
```
`migration-identity.sh full` runs the whole cycle and is used for the reproducibility
runs. All authority derives from validated repo state and the generated run identity
`bzmigrationidentity-<ts>-<pid>-<rand>`; ambient overrides are cleared; no global prune.
