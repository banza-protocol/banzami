# Banzami Blueprint — Attested Sandbox Service-Image Lab

**Status:** attested immutable service-image build/attestation/inspection lab (local, disposable, non-deploying). **Version:** 1.0

> **LOCAL · DISPOSABLE · non-deploying.** Builds attested immutable images for EXACTLY
> the four approved Sandbox services, generates real SBOM + provenance, inspects them
> with the network disabled, and tears everything down. Never contacts the VM, never
> deploys, never uses a database / `banzami_staging` / LIVE credentials / payment rail.
> Public dependency and base-image resolution only (crates.io / Go proxy / Docker Hub).

## Approved services (allowlist — exactly four)
```
core-api-staging      (core/Dockerfile, Rust, SQLX_OFFLINE + .sqlx cache, no DB)
api-gateway-staging   (services/api-gateway/Dockerfile, Go, USER banzami)
developer-api         (services/developer-api/Dockerfile, Go, USER banzami)
public-api-staging    (services/public-api/Dockerfile, Go, USER banzami)
```
Any other service (admin-api, LIVE services, payment adapters, proxies, frontends,
BANZA docs, BanzAI) is rejected by the allowlist.

## What it proves per service
- Attested build on a `docker-container` builder from the canonical clean revision, with
  the built image's own **SBOM + provenance** and an immutable content digest.
- Identity binding: full source revision label + service identity label + run identity.
- Non-deploying inspection (`--network none --read-only`, entrypoint overridden, no secret
  mount, no source mount): the service binary is present; no secret env/label/history; no
  real VM / `banzami_staging` / LIVE binding; no migration-only/migration-control state.
- Evidence secret-free; provenance records the immutable base-image materials.
- Scoped teardown; host-wide zero residue.

> **Base-image immutability note.** The service Dockerfiles pin version tags
> (`rust:1.88-slim-bookworm`, `debian:bookworm-slim`, `golang:1.25-alpine`, `alpine:3.21`)
> — never `:latest`. The build's **provenance** records the exact resolved base-image
> content digests, and the built image is content-addressed. The honest claim is a
> **reproducible build procedure with validated immutable provenance**, not byte-identical
> output. The service Dockerfiles themselves are out of this lab's modification scope.

## Use
```bash
make check-blueprint-service-images        # static gate (no Docker)
make blueprint-service-images-lab-run      # attested build of the four approved images
make blueprint-service-images-lab-verify   # evidence + inspection + secret boundary
make blueprint-service-images-lab-clean    # scoped teardown (per-run builder/images/artefacts)
```
`service-image-lab.sh full` runs the whole cycle. All authority derives from validated
repo state + the generated run identity `bzservicelab-<ts>-<pid>-<rand>`; ambient overrides
cleared; no global prune. Local image tags are run-scoped and removed at teardown.
