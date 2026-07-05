# RT04E Sandbox Rollout — provenance & deployment integrity

**Status:** design repaired; **not executed**. Sandbox-only. **Version:** 1.0

RT04E replaces the current unproven Sandbox runtime with images **built and
traceably labelled from the canonical revision**. Its success proves **only**
canonical Sandbox runtime provenance and deployment integrity.

> RT04E proves canonical Sandbox runtime provenance and deployment integrity only.
> It does not prove feature release, authentication, developer-console access,
> payment, transfer, refund, webhook, QR, mobile or financial E2E behaviour.

Capability **release** and **financial E2E** are **separate follow-on gates**.

## Scope — approved Sandbox service allowlist (only these four)
`core-api-staging` · `api-gateway-staging` · `developer-api` · `public-api-staging`

**Never** deployed by RT04E: `core-api`, `api-gateway`, non-staging `public-api`,
`admin-api`/`admin-api-staging`, and anything matching `prod`/`production`/`live`.

## Canonical source requirement
- Build source is **only** `/srv/banzami/src` (canonical checkout). The runner
  defaults `REPO_ROOT` to it and **refuses** legacy/`/srv/banzami/repo`/arbitrary roots.
- The runner requires `RT04E_RELEASE_REV` (the approved revision), verifies the
  checkout is `main`, clean, matches the revision, and has **no git remotes**. It
  performs **no** git state change.

## Source-to-runtime mapping (declared in `rt04e-sandbox-target-contract.yaml`)
| Service | Compose file / overlay | Deploy op |
|---|---|---|
| core-api-staging | `docker-compose.yml` | build core (labelled) → retag `:adr021-staging` → up |
| public-api-staging | `docker-compose.yml` | build (labelled) → up |
| developer-api | `docker-compose.yml` | build (labelled) → up |
| api-gateway-staging | `docker-compose.sandbox-gateway.yml` (overlay) | overlay build (labelled) → up |

The runner + adapter fail closed if the target is not `sandbox`, a service is
outside the allowlist, a prohibited service resolves, a required service is
unmapped, or the compose mapping is incomplete/ambiguous.

## Revision provenance requirement
Every deployed image carries `org.opencontainers.image.revision=<RT04E_RELEASE_REV>`.
After replacement, a **provenance gate** inspects each running service's image
revision label and **fails** unless it exactly equals the required revision (and
fails if a service is healthy but unlabelled, or was not built by the RT04E path).
The provenance gate runs **before** any health-success conclusion. **No E2E or
authenticated request** is made in this gate.

## Migration checkpoint requirement (`rt04e-migration-checkpoint.sh`)
The runner **cannot reach** `migrate-and-verify.sh` without the checkpoint gate
passing. It requires (without exposing any value): sandbox target + explicit
operator confirmation, no Production/Live markers, an approved controlled
migration-access path, a captured pre-migration schema/migration checkpoint, an
operator-confirmed backup/rollback-equivalent, and an ordered-migration + checksum
preflight incl. `0100_dev_project_sandbox_binding.sql`. Migration is a **separate
explicit human-confirmed, forward-only** stage. No database URL/token/secret is
ever placed in argv, logs, stdout, manifests, Git, Compose or shell history.

## Rollback limits
See `RT04E_SANDBOX_ROLLBACK.md`. Application-image rollback restores the four
Sandbox services only; **database migrations are forward-only and are not
automatically reversed**.

## Evidence
Sanitised evidence (deployed revisions, per-service image ID + revision label,
health status) is written **outside** `/srv/banzami/src` under root-owned storage.
No secret value is captured.

## Operator confirmation points
Stage 0 (target lock), Stage 5 (migration — irreversible-ish), Stage 7 (service
replacement), Stage 10 (rollback). The migration credential is handed to the
runner once via **protected stdin** — never argv/env/log/Git/Compose.

## Deployment integrity vs capability release
RT04E establishes that the running Sandbox services derive from the canonical
revision. It does **not** enable `PAYMENT_CAPABILITY_RELEASED` or run any financial
flow — those are distinct, separately-approved gates.

## Enforcement
`make check-rt04e-rollout-safety` — 16 static checks; `make check-rollout-secret-hygiene`.
