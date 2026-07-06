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
- `RT04E_RELEASE_REV` must be the **full immutable canonical Git SHA** — exactly 40
  lowercase hex characters. Abbreviated revisions, branch names, tags and symbolic
  refs are **rejected** (`rt04e_valid_rev`, parser `^[0-9a-f]{40}$`). The runner
  verifies the checkout is `main`, clean, has **no git remotes**, and that the SHA
  **equals the verified canonical `HEAD`** (never inferred from an arbitrary
  directory). It performs **no** git state change. The full SHA is used in the
  immutable image tag, the OCI revision label, the override rendering, the rollback
  manifest and evidence identifiers.

## Source-to-runtime mapping (declared in `rt04e-sandbox-target-contract.yaml`)
| Service | Compose file / overlay | Immutable release reference |
|---|---|---|
| core-api-staging | `docker-compose.yml` | `banzami/core-api:rt04e-<rev>` |
| public-api-staging | `docker-compose.yml` | `banzami/public-api:rt04e-<rev>` |
| developer-api | `docker-compose.yml` | `banzami/developer-api:rt04e-<rev>` |
| api-gateway-staging | `docker-compose.sandbox-gateway.yml` (overlay) | `banzami/api-gateway:rt04e-<rev>` |

`<rev>` is the full 40-hex canonical release SHA (`RT04E_RELEASE_REV`). The
runner + adapter fail closed if the target is not `sandbox`, a service is outside
the allowlist, a prohibited service resolves, a required service is unmapped, or the
compose mapping is incomplete/ambiguous.

## Immutable release references (no mutable tags)
The active RT04E path uses **only** the immutable reference
`banzami/<repo>:rt04e-<rev>`. Mutable runtime tags (`latest`, `adr021-staging`,
generic staging tags, service-name-derived repos) are **never** part of the
replacement path. Each service builds **its own** image repository
(`core-api-staging→banzami/core-api`, `public-api-staging→banzami/public-api`,
`developer-api→banzami/developer-api`, `api-gateway-staging→banzami/api-gateway`)
from its canonical build context, labels it with the canonical revision, and tags it
**only** to that immutable reference — derived structurally by `rt04e-sandbox-lib.sh`
(`rt04e_release_ref`), never inferred loosely from the service name.

## Source-controlled image override
The immutable references are bound to Compose through a **source-controlled
template** (`infra/deployment/rt04e-sandbox-images.override.template.yml`). At run
time the runner substitutes the validated revision **literally** (`sed`, never shell
eval) into a **root-owned temp override generated OUTSIDE the repo** (`0600`),
`export`s `RT04E_OVERRIDE`, refuses any unresolved placeholder, and **removes it on
completion** via an `EXIT/INT/TERM/HUP` trap. Every Compose operation uses the
**fixed file order** `docker-compose.yml` + `docker-compose.sandbox-gateway.yml` +
generated override (never caller input).

## Pre-mutation SEMANTIC Compose attestation (confidential + two projections)
`rt04e-sandbox-attest.sh` runs **before** any migration checkpoint, migration, image
build, service replacement, or rollback decision. It uses the **Docker Compose
engine** as the authority — `docker compose … config --no-interpolate
--no-env-resolution --format json` — **not** grep/awk on Compose text.

**Confidentiality.** Both `--no-interpolate` **and** `--no-env-resolution` are
required (and their support verified first — fail closed if unavailable, alongside
the `up` isolation flags). `--no-env-resolution` keeps service **env files
unresolved** and environment values **out of the model entirely**. The resolved JSON
is piped **directly** to a constrained parser (`tools/rt04e-attest-parser.mjs`) that
reads stdin only, **never writes the config to disk**, and emits **only** PASS/FAIL
categories per service — never an image value, env value, host, URL, port or any
Compose field. It rejects unexpected object shapes (exit 2).

Attestation is **target-scoped**: an unrelated service (e.g. a server-owned
administration service) may legitimately exist anywhere in the Compose model and is
**ignored** — RT04E judges only the four approved services plus any prohibited-named
service that is **RT04E-controlled** (carries this release's immutable
`:rt04e-<SHA>` reference, i.e. the override/overlay selected, introduced, aliased or
ambiguously resolved it as an RT04E target — which fails closed). Prohibited services
can also never enter through the target contract allowlist or a deploy/rollback
target (`rt04e_in_allow` + `rt04e_refuse_bad`).

**Two projections** prove overlay provenance by contrast (source-file provenance is
never inferred from a single merged model):
- **Projection A — base only** (`docker-compose.yml` only): `core-api-staging`,
  `public-api-staging`, `developer-api` **exist**; `api-gateway-staging` **does not
  exist**; no RT04E-controlled prohibited service.
- **Projection B — full composition** (base → gateway overlay → immutable override):
  all four services **exist**; `api-gateway-staging` exists **only here**; each
  service resolves to its **literal** immutable reference `banzami/<repo>:rt04e-<full
  SHA>`; **no `${…}` interpolation marker**; no ambiguity/duplicate; no
  RT04E-controlled prohibited service.

The runner executes **both** projections before checkpoint/migration/build/
replacement/rollback-decision.

## Hermetic Compose invocation
Every RT04E `docker compose` call (attestation, deployment, rollback) goes through a
**single central wrapper** (`rt04e_compose` in `rt04e-sandbox-lib.sh`). The wrapper
uses a **fixed approved file set + fixed order**, a **fixed project name**
(`rt04e-sandbox`) and **fixed project directory** (`/srv/banzami`), never activates
profiles, and **rejects/unsets inherited `COMPOSE_*` controls** that could steer file
selection, project selection, profiles, path separation or orphan behaviour
(`COMPOSE_FILE`, `COMPOSE_PROJECT_NAME`, `COMPOSE_PROFILES`, `COMPOSE_PATH_SEPARATOR`,
`COMPOSE_IGNORE_ORPHANS`, and related). It never accepts a caller-supplied Compose
file path, project name, profile, service, env file, source root, image repo, tag or
revision, and never passes `--remove-orphans`.

## Exact, isolated service replacement
Replacement runs through the wrapper as exactly `up -d --no-build --pull never
--force-recreate --no-deps <single-allowlisted-service>`: **no build** (the image is
pre-built and tagged), **no pull** (never fetch a mutable remote tag), **forced
recreation** of only the target, **no dependency mutation**, and **no
`--remove-orphans`**. One service per operation, under the exclusive lock.

## Revision provenance requirement
Every deployed image carries `org.opencontainers.image.revision=<RT04E_RELEASE_REV>`.
After replacement, a **provenance gate** inspects each running container's **actual
image** revision label and **fails** unless it exactly equals the required revision
(and fails if a service is healthy but unlabelled, or not built by the RT04E path).
It runs **before** any health-success conclusion. **No E2E/authenticated request.**

## Health requirement
Real, **non-authenticated local liveness** via each container's Docker HEALTHCHECK
status (the container's own `/health` probe) — non-mutating, no business/financial
endpoint, no external redirect, fail-closed on non-`healthy`. Runs **after**
provenance. The rollout success condition requires **both** the running-image
revision-label match **and** local health PASS; a healthy-but-unlabelled container
is a failure.

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
Sandbox services only from **retained, prune-proof pre-state tags**; **database
migrations are forward-only and are not automatically reversed**. RT04E performs
**no** `docker image/container/system/volume prune` or `rmi` anywhere — pre-state
images are retained until the approved rollback window closes (manual).

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
`make check-rt04e-rollout-safety` — 16 static checks + behavioural/continuity checks
17–66 (immutable-tag, isolation-flag, prune-proof, override-generation,
`--no-env-resolution` confidentiality, base-only vs full projection, full-SHA
identity, hermetic-wrapper + inherited-`COMPOSE_*` rejection, target-scoped
prohibited-service handling, and constrained-parser fixtures — all
Docker/DB/secret-free); `make check-rollout-secret-hygiene`.
