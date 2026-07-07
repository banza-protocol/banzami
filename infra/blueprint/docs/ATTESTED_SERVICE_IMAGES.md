# Attested Sandbox Service Images

**Status:** attested immutable service-image lab (local, disposable, non-deploying). **Version:** 1.0

> **Scope boundary.** Local, disposable, non-deploying. Builds attested immutable images
> for the four approved Sandbox services only. Never contacts the VM, never deploys, never
> uses a database / `banzami_staging` / LIVE credentials / payment rail / production secret.

## Approved services (exactly four)
`core-api-staging` · `api-gateway-staging` · `developer-api` · `public-api-staging`.
Any other service is rejected by the allowlist.

## Build & attestation contract
Each image is built on a `docker-container` BuildKit builder from the clean checked-out
revision, with its own **SBOM** and **provenance**, an immutable content digest, and labels
binding the full source revision, service identity and generated run identity. No `:latest`
base, no registry login/push, no source bundle, no secret build-arg/env/label/argv, no secret
in logs/SBOM/provenance. `core-api` builds offline (`SQLX_OFFLINE=true` + committed `.sqlx/`
cache — no database); the Go services build from public modules. Public dependency/base
resolution only.

## Inspection (non-deploying)
`--network none --read-only`, entrypoint overridden, no secret/source mount: the service
binary is present; effective user reported (Go services run as `banzami`; `core-api` runs as
root — reported honestly); no secret env/label/history; no real VM/`banzami_staging`/LIVE
binding; no migration-only or migration-control state; no application listener started.

## Evidence
Real machine-readable SBOM + provenance per image, current-run specific, non-placeholder,
secret-free, provenance records immutable base-image materials, removed at teardown. The
honest claim is a **reproducible build procedure with validated immutable provenance**, not
byte-identical output. No external signing, transparency log, registry publication, Production
readiness or Sandbox deployment readiness is claimed.

## Remaining (next operational phase, not in this source finalisation)
Same-VM legacy reset · fresh Sandbox bootstrap · controlled migration against
`banzami_staging` · controlled deployment + health validation of the four services.
