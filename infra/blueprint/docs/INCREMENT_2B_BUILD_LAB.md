# Increment 2B — Migration-Runner Build, Attestation and Inspection Lab

**Status:** Increment 2B (build/attestation/inspection; local disposable lab only). **Version:** 1.0

> **Scope boundary.** A local, disposable, **non-deploying, non-migrating** build
> laboratory. It builds the migration-runner image from canonical source, proves its
> SBOM and provenance are real and verifiable, and that its static runtime contract
> survives real image inspection. It is not a VM deployment, not Sandbox, not LIVE,
> does not execute SQLx migrations, does not create `banzami_staging`, and uses no
> real credentials.

## A. Closed Increment 2A hardening items
- **A1** — secret files asserted regular / non-symlink / non-empty / mode `0600` /
  hard-link count exactly `1` (fail-closed).
- **A2** — guarded secret-root removal: only a current-run, non-symlink directory
  strictly under the approved OS-temp base and outside the repository is removable;
  environment is never the deletion authority.
- **A3** — the runtime role must successfully authenticate and run `SELECT 1` before
  the (unchanged) negative privileged-DDL checks are asserted.
- **A4** — the effective Docker secret mount is proven read-only by an in-container
  write attempt against the running mount, not by Compose syntax.

The 2A lab was re-run twice after hardening with the zero-residue requirement intact.

## B. Build-lab lifecycle
```
source/static gates → Docker + Buildx attestation capability → unique run identity
→ protected temp artefact root → dedicated docker-container builder
→ digest-pinned runner build (SBOM + provenance) → artefact validation
→ non-migrating image inspection (--network none --read-only) → secret non-leak
→ scoped cleanup → zero-residue verification
```

## C. Immutable build contract
Builds only from the clean checked-out full 40-char revision; bases pinned by
immutable `@sha256:` from `digests.lock`; SQLx CLI pinned to the locked
`core/Cargo.lock` version; the built image records `org.opencontainers.image.revision`
= the full source revision. No secret is passed via build-arg, env, argv, label,
source file, buildx metadata, build log or evidence. No registry login or push.

This increment proves an **attestable, reproducible build procedure**, not
byte-identical binary output.

## D. Attestation evidence
- **SBOM** — machine-readable SPDX document with packages, image/component context,
  SQLx evidence, and no secret pattern.
- **Provenance** — machine-readable SLSA attestation containing the full source
  revision, agreeing with the base-image digest lock, recording the SQLx CLI version
  and local-build evidence, and containing no secret pattern.

## E. Non-migrating inspection (network disabled, read-only, no secret)
Non-root runtime user · `sqlx-cli` at the expected version · PostgreSQL client
present · approved migration entrypoint · no exposed host port · no secret env/label
· no credential in image history. Migration commands are never invoked.

## Explicitly unproven until later increments
- **2C** — disposable migration-test database applying the canonical migration set;
  migration level / checksum / drift / object-ownership verification.
- **2D** — short-lived migration role (create → act-through-owner → expire/remove)
  and least/most-privilege proof.
- **2E** — end-to-end read-only secret-mount proof for a real migration run;
  migration receipt single-use + advisory-lock runtime behaviour.
- **2F** — secret non-leak proof across the full migration path and controlled
  teardown; only then any Sandbox provisioning decision.

No Sandbox, LIVE, migration execution, database provisioning or Production readiness
is certified by Increment 2B.
