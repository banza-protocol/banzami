# Banzami Blueprint — Migration-Runner Build Laboratory (Increment 2B)

**Status:** Increment 2B — build, attestation and inspection lab (reviewable; non-deploying, non-migrating). **Version:** 1.0

> **LOCAL · DISPOSABLE · non-Sandbox · non-LIVE · non-production · non-deploying ·
> non-migrating.** This lab builds the existing migration-runner image from
> canonical source, generates real SBOM + provenance attestations, validates
> immutable identity/provenance, and inspects the image with the network disabled.
> It never runs SQLx/migrations, starts a database, mounts a credential, invokes the
> migration entrypoint with a secret, contacts a registry, or touches the VM.

## What this increment proves
- The runner image **builds** from the canonical clean revision using digest-pinned
  bases (from `migration-runner/digests.lock`) and the locked SQLx CLI version.
- **Real** SBOM and provenance attestations are generated (BuildKit, docker-container
  builder) and are machine-readable, contain the full source revision, agree with the
  base-image digest lock, and contain no secret pattern.
- The built image survives **runtime inspection** (`--network none --read-only`,
  entrypoint overridden, no secret mounted): non-root user, `sqlx-cli` at the
  expected version, PostgreSQL client present, approved entrypoint, no exposed port,
  no secret env/label, no credential in history.
- No secret leaks into build logs, metadata, SBOM, provenance or evidence.
- Every run is fully torn down with zero host-wide residue.

## What this increment does NOT do
No SQLx/migration execution · no database · no migration-test DB · no migration role
· no migration receipt · no advisory lock · no DB connection · no secret-bearing
entrypoint invocation · no `banzami_staging` · no Sandbox/LIVE provisioning · no
application deployment · no RT04E runtime change · no VM contact · no push/merge/PR.

## Layout
```
infra/blueprint/build-lab/
  scripts/
    runner-build-lab.sh     fail-closed orchestrator (capability|build|verify|clean|full)
    validate-evidence.mjs   OCI-layout SBOM + provenance attestation validator
infra/blueprint/validators/check-blueprint-runner-build.mjs   static gate (no Docker)
```

## Use
```bash
make check-blueprint-runner-build   # static gate (no Docker)
make blueprint-runner-build         # unique builder, digest-pinned build, SBOM+provenance, load
make blueprint-runner-verify        # evidence + non-migrating inspection + non-leak
make blueprint-runner-clean         # scoped teardown (this run's builder/image/container/artefacts)
```
`runner-build-lab.sh full` runs build → verify → clean → residue check, and is the
form used for the reproducibility runs.

All authority (source revision, Dockerfile path, artefact root, builder, image tag,
network, secret path, compose project) is derived from validated repository state and
the current generated run identity `bzrunnerlab-<ts>-<pid>-<rand>`; uncontrolled
environment overrides are cleared. Cleanup removes only current-run labelled/named
resources — never `docker system prune`, image/builder/volume/network prune, or any
unscoped deletion. Temporary OCI/SBOM/provenance artefacts live only in a generated
root outside the repository and are removed at teardown.
