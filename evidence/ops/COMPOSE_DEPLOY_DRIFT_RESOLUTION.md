# Compose/Deploy Drift Resolution (repository-only)

Version: 1.0
Date: 2026-07-10
Source commit at execution: `9a3681713ab4ffdedfdab8cf8e5a10943c1d610e`

> **Scope note.** Sanitised: no IPs, private hostnames, SSH users, server paths,
> secrets, tokens, DB URLs, raw logs or raw Docker output. Repository-only change —
> no server interaction of any kind was performed for this work.

## Prior drift (from the merged Stage C readiness report)

- **D1** — deploy script retained live core-api/api-gateway/public-api deploy functions
  targeting compose services that no longer exist server-side (would fail mid-flow,
  after building images).
- **D2** — two parallel staging definitions: compose staging duplicates + legacy
  `staging` deploy path (in-place compose edit + image retagging) vs the actually
  running, authoritative rt04e sandbox project.
- **D3 (repo aspect)** — the legacy shared-proxy config still read as a valid path for
  sandbox public routing despite routing to retired network/container names and having
  no DNS resolver (the 522 root cause).
- **D4** — deploy↔compose service-list mismatch; a mixed invocation
  (`developer-api` + another service) silently fell through to a legacy compose-based
  developer-api deploy path instead of the rt04e flow.
- Documentation did not yet state, in one place, which runtime is authoritative for what.

## Decisions applied (already merged, PR #40)

- Decision 1: rt04e sandbox project = authoritative staging/Developer Platform runtime.
- Decision 2: future Stage C uses a dedicated sandbox-edge proxy.
- Decision 3: website-edge remains exclusively for banzami.com/www.
- Decisions 4–5: sandbox capability exposure and sandbox-operator rebuild remain
  pending explicit Stage C execution approval.
- Decision 6: no operational Developer Console, no pay/checkout, no live rails, no
  external providers.

## Repository changes made

1. **`deploy.sh` — fail-closed service authority gate.** A `_authority_gate` now denies
   every unapproved service **before** any banner, assurance gate, build, transfer or
   deploy step, with a governance message naming the approved paths and the required
   approvals. The legacy deploy functions for live core-api/admin-api/api-gateway/
   public-api, sandbox-operator, compose-based developer-api, admin/dashboard/pay/
   checkout frontends and the legacy `staging` path were **removed** (they no longer
   read as valid restore/deploy paths). "Deploy all" (no argument) is retired and fails
   closed. The header now documents the two approved paths only.
2. **Local full compose** — the staging section is marked
   `DEPRECATED AS DEPLOYMENT AUTHORITY` (local development only; Decision 1).
3. **Legacy shared-proxy config** — marked `DEPRECATED — NOT AUTHORIZED FOR SANDBOX
   PUBLIC ROUTING` with the reasons (retired upstream names, no resolver/522 root
   cause) and pointers to the sandbox-edge decision. Kept for reference only.
4. **New matrix:** `docs/infra/BANZAMI_SERVICE_AUTHORITY_MATRIX.md` — the single answer
   to which runtime is authoritative and which deploy paths are approved/denied.
5. **New test:** `tests/ops/deploy-authority-gate.test.sh` (see below).
6. Short cross-references added to the Stage C decisions doc, the Stage C readiness
   evidence, the public website architecture doc and the website recovery runbook.

## Services blocked / fail-closed by the gate

| Invocation | Result |
|---|---|
| `core-api`, `api-gateway`, `public-api` (live rails) | denied — Stage E+ approval, rotated secrets, ADR-034 gate required |
| `pay-frontend`, `checkout-frontend` | denied — Stage F approval required |
| `admin-api`, `admin-frontend`, `dashboard-frontend` | denied — Stage D approval + approved runbook required |
| `sandbox-operator` | denied — pending explicit Stage C execution approval (Decision 5) |
| `staging` (legacy path) | denied — rt04e project is the authoritative staging runtime (Decision 1) |
| `developer-api` mixed with another service (legacy compose path) | denied — must be invoked alone so it routes to the rt04e flow |
| no argument ("deploy all") | denied — retired, fail-closed |

## Preserved unchanged

- `./deploy.sh website-frontend` (website deploy + website recovery path).
- Scope-aware website assurance gate and the full/general gate check set.
- Single-source-of-truth preflight guard; `banzami-canonical` / wrong-directory rejection.
- No local Mac QEMU amd64 build fallback (refusal patterns only).
- `BANZAMI_ASSURANCE_ONLY` gate-only mode; `BANZAMI_SKIP_ASSURANCE` break-glass semantics.
- rt04e sandbox flow routing (`developer-api` / `*-staging` invoked alone).
- Stage A / Stage B evidence untouched; Stage C remains **NOT IMPLEMENTED / NOT APPROVED**.

## Tests executed (no Docker, no network, no DB)

- `bash -n deploy.sh` — syntax OK.
- **`tests/ops/deploy-authority-gate.test.sh` — 16/16 pass:** live rails, pay/checkout,
  admin/dashboard, sandbox-operator, legacy staging, mixed developer-api and
  no-argument invocations all fail closed; website deploy + website assurance gate
  intact; wrong-directory/banzami-canonical rejected; no QEMU fallback; sandbox-edge is
  design/documentation only (no compose service, no proxy conf, no deploy path).
- **`tests/ops/website-assurance-gate.test.sh` — all pass** (unchanged guarantees).
- Full assurance tool set (layout · assurance-manifest · asset-inventory ·
  live-fail-closed · docs-claims · SDK-contract) — pass.
- Forbidden-claims grep over changed files (production ready / LIVE active / real
  payments active / Developer Console available / BNA approved / external provider
  active) — no matches.
- Sanitiser/secret scan over changed files — clean.

## Services NOT touched

No server interaction occurred. Website app + website-edge, rt04e sandbox project,
production Postgres/Redis, DNS, certificates, SMTP, external providers, and every
payment/admin/gateway/API/pay/checkout/developers/Developer Platform service — all
untouched. No deploy, no Docker compose invocation, no image rebuild, no migration,
no database command, no proxy routing change.

## Remaining follow-ups

1. `ops: implement sandbox-edge proxy for Stage C` — requires explicit Stage C
   execution approval (unlocks Decisions 4–5).
2. `ops: rebuild sandbox-operator for Stage C` — same approval gate.
3. `ops: fix production Postgres + Redis healthchecks` (D5/D6, cosmetic).
4. `ops: host secret-hygiene cleanup` (D9) + live-era key rotation before Stage E+.
5. Server-side compose cleanup of retired duplicates — server change, needs its own
   approved operation (this PR is repository-only).

## Final status

**COMPOSE/DEPLOY DRIFT RESOLVED IN REPO — STAGE C STILL NOT IMPLEMENTED.**
