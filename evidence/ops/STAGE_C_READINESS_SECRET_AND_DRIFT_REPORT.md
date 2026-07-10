# Stage C Readiness — Secret Reconciliation & Compose/Deploy Drift (read-only)

Version: 1.0
Date: 2026-07-10
Source commit at execution: `81a363ca1bd66fc711475ddd48656aa3942ff56a`

> **Scope note.** Sanitised: no secret values, tokens, JWTs, API keys, DB URLs, SMTP
> credentials, Firebase values, webhook secrets, private endpoints, IPs, private
> hostnames, SSH users, server paths, raw env files, raw logs or raw Docker output.
> Secret inspection was performed at key-name and metadata level only. Public domain
> names and repo service labels only. Internal operations record.

## 1. Current-state confirmation (verified read-only)

- `banzami.com` → HTTP 200 (website, independent); `www.banzami.com` → 301 redirect.
- Offline subdomains (api, admin, pay, developer-api, sandbox-api, sandbox-operator)
  → controlled **503 maintenance** responses (Stage B guard working).
- `developers.banzami.com` → intentional demo/non-operational developer surface.
- Sandbox / Developer Platform stack: 6/6 healthy, continuous uptime.
- Production Postgres + Redis: healthy since Stage A; no writes or migrations since.
- No application containers running beyond the approved website/Sandbox/DB groups.
- No public database ports exposed; host-public listeners unchanged.

## 2. Secret reconciliation summary

- **Interpolation-complete:** every variable referenced by the server compose exists in
  the operator env file; nothing is missing for the services the compose defines.
- **No inline secrets in compose:** all secret-like values use interpolation.
- **No conflicting copies:** the newest env backup (2026-06-29) is a **strict ancestor**
  of the current env — 7 keys added since (Developer Platform peppers/session secrets,
  proof-signing keys, internal keys), zero value drift on common keys, zero keys lost.
- **Live-era orphan keys:** live JWT signing, webhook encryption, KYB object-storage
  credentials and live ledger account IDs exist in env but are referenced by no current
  compose service. Harmless today; **rotation candidates before any live restore**.
- **Sandbox project is config-isolated:** running sandbox containers carry no secret
  env keys (no DB URLs, JWTs or peppers in container env); the rt04e secure-rollout
  flow provisions config separately. Stage C needs no new secret material.
- **No live/production mode flag exists** in env or compose; every application service
  is pinned SANDBOX.
- **Capability flags (non-secret):** the running sandbox services report
  `ENVIRONMENT=sandbox`, `DEVELOPER_KEY_AUTH_ENABLED=true`, `BANZAMI_PILOT_LIMITS=1`
  and `PAYMENT_CAPABILITY_RELEASED=true` — i.e. Stage C public routing would expose
  **sandbox-scoped payment capability only**, never live rails. Operator acceptance of
  that exposure is required before Stage C.

## 3. Service secret-risk classification

| Service | Classification | Notes |
|---|---|---|
| developer-api (running, contract-managed) | `SECRET_READY` | Healthy; no new secrets needed for routing |
| sandbox-api upstreams (staging gateway + public-api + core, running) | `SECRET_READY` | Healthy; sandbox money only; capability-flag note above |
| sandbox-operator | `SECRET_READY` | Stateless, no DB, no secrets; needs image rebuild only |
| docs / developers demo surface | `SECRET_READY` | No secrets; must stay demo/non-operational |
| Production Postgres / Redis | `SECRET_READY` | In verified use since Stage A; healthcheck fixes pending (cosmetic) |
| Shared public proxy | `SECRET_READY` (certs present) | Blocker is routing/network drift, not secrets |
| admin-frontend | `SECRET_READY` | No server secrets; fully dependent on admin-api |
| admin-api | `SECRET_RECONCILIATION_REQUIRED` | Broadest secret surface (admin JWT/API key, staging DB, SMTP/email, KYC object storage); present and consistent but unverified in use since the outage |
| compose-defined staging duplicates (image-absent) | `SECRET_STALE_OR_UNKNOWN` | Superseded by the running sandbox project (drift D2) |
| pay-frontend / checkout-frontend | `DO_NOT_RESTORE_WITH_CURRENT_SECRETS` | Payment surfaces — conservative default rule applies regardless of secret state |
| Live core-api / api-gateway / public-api | `DO_NOT_RESTORE_WITH_CURRENT_SECRETS` | Live-era keys must be rotated first; payment-rail activation unapproved; not defined server-side |

## 4. Compose/deploy/proxy drift findings

- **D1 — Live deploy functions target nonexistent services:** the deploy script retains
  live core-api/api-gateway/public-api paths pointing at compose services that no longer
  exist server-side; a live deploy invocation would fail mid-flow.
- **D2 — Two parallel staging definitions:** the shared compose defines its own staging
  services (images absent, legacy tag pinning, legacy in-place compose-edit deploy path)
  while the actually running staging/Developer Platform is the separate rt04e sandbox
  project with different container names, networks and config mechanism.
- **D3 — Proxy routes point at the wrong network:** the shared proxy's vhosts route to
  compose-network container names; the real upstreams live on isolated sandbox-project
  networks under different names. The shared proxy also still has no DNS resolver (the
  original 522 root cause). **The old shared proxy must not be reused as-is.**
- **D4 — deploy↔compose service-list mismatch:** compose defines services absent from
  the deploy script (docs-frontend, admin-api-staging); the deploy script lists services
  absent from compose (the live trio).
- **D5 — Postgres healthcheck references a non-existent database name** (cosmetic FATAL
  log noise; health reports OK for the wrong reason).
- **D6 — Redis healthcheck is a false-positive check:** unauthenticated ping exits 0
  despite an auth error; it would report healthy even if real clients were rejected.
- **D7 — Repo ↔ server website-proxy config drift:** server has the developers vhost
  and the Stage B guard under a different filename than the repo source of truth.
- **D8 — Frontends have no compose healthchecks**, weakening Stage D/F verification.
- **D9 — Host hygiene:** numerous timestamped compose/env backups accumulate on the
  host, several containing older secret values.

## 5. Drift classification

| # | Classification | Blocks Stage C? | Minimum safe fix later |
|---|---|---|---|
| D3 | `ROUTING_BLOCKER` | **Yes** | Route sandbox hosts via a small edge addition attached to the sandbox network; never the old shared proxy as-is |
| D2 | `NEEDS_ARCHITECTURE_DECISION` | **Yes** | Declare the rt04e sandbox project authoritative; retire compose staging duplicates + legacy deploy path |
| D1 | `RESTORE_BLOCKER` (Stage E+) + `PAYMENT_RISK` | No | Guard or remove live deploy paths until live restore is designed |
| D4 | `RESTORE_BLOCKER` (Stages D–E) | No | Reconcile the service registry in one PR |
| D5 | `COSMETIC_RUNTIME_DRIFT` | No | Point healthcheck at the existing database |
| D6 | `COSMETIC_RUNTIME_DRIFT` (monitoring integrity) | No | Authenticated ping in healthcheck |
| D7 | `HARMLESS_DOC_DRIFT` | No | Sync vhost/guard files into repo under canonical names |
| D8 | `RESTORE_BLOCKER` (Stage D/F verification) | No | Add healthchecks with the restore PRs |
| D9 | `SECURITY_RISK` (low, local) | No | Archive stale backups; rotate live-era keys before Stage E+ |

## 6. Stage C readiness verdict

**NOT READY YET — conditionally close.** Secrets are *not* the blocker for the Stage C
scope (developer-api / sandbox-api / sandbox-operator, sandbox money only): the running
upstreams need no new secret material and sandbox-operator is secretless. Stage C is
blocked by **D2 + D3** — an explicit operator decision on the authoritative staging
runtime and the routing design is required before any implementation. See
[../../docs/infra/BANZAMI_STAGE_C_SANDBOX_PUBLIC_ROUTING_DECISIONS.md](../../docs/infra/BANZAMI_STAGE_C_SANDBOX_PUBLIC_ROUTING_DECISIONS.md).

## 7. Hard blockers before Stage C

1. Routing/network architecture decision (D2 + D3).
2. Operator acceptance that Stage C publicly exposes **sandbox-scoped** payment
   capability (`ENVIRONMENT=sandbox`, no live rails) — must be a recorded decision.
3. sandbox-operator image rebuild approval (the one Stage C service with no running
   instance).

## 8. Recommended operator decisions

1. Declare the rt04e sandbox project the authoritative staging/Developer Platform
   runtime; mark the compose staging duplicates deprecated.
2. Approve a Stage C routing design (edge extension vs dedicated sandbox-edge proxy).
3. Record acceptance of public sandbox payment capability for Stage C.
4. Schedule rotation of live-era orphan keys at the Stage E/F gate.

## 9. Proposed follow-up PRs

Enumerated with objective/scope/downtime/approval in the Stage C decision record
(see link above): (1) reconcile service secret manifest; (2) resolve compose/deploy
service drift; (3) fix production Postgres + Redis healthchecks; (4) document Stage C
sandbox public routing; (5) implement sandbox public routes — only after explicit
Stage C approval; (6) host secret-hygiene cleanup.

## 10. Items that must remain offline

Live core-api / api-gateway / public-api (real rails); pay and checkout surfaces; any
operational Developer Console claim on `developers.banzami.com` (demo/docs only until a
real console is implemented and tested); all external-provider activation; admin
surfaces (until Stage D with reconciled secrets).

## 11. Untouched confirmations

- banzami.com website-only proxy: untouched, independent, serving 200 throughout —
  only external HTTPS checks were performed.
- Stage A Postgres + Redis: healthy, untouched — no writes, no migrations, no schema
  access; all inspection was key-name/metadata level.
- Sandbox / Developer Platform stack: untouched, healthy, continuous uptime.

## 12. Non-usage confirmation

No deploy, rebuild, start, restart, publish, migration, database write, Docker prune,
VM reset, DNS/certificate/SMTP change, proxy routing change, external-provider command,
or any payment/admin/gateway/API/pay/checkout/developers/Developer Platform service
restore was used. No secret values were read out, copied or committed.

## 13. Final status

**READ-ONLY STAGE C READINESS REPORT PREPARED — NO SERVICES CHANGED.**

## Addendum (2026-07-10) — architecture decisions recorded

The operator decisions blocking Stage C (§6–§8) have since been recorded in
[../../docs/infra/BANZAMI_STAGE_C_SANDBOX_PUBLIC_ROUTING_DECISIONS.md](../../docs/infra/BANZAMI_STAGE_C_SANDBOX_PUBLIC_ROUTING_DECISIONS.md):
the rt04e sandbox project is **approved** as the authoritative staging/Developer
Platform runtime (resolves D2 direction), a **dedicated sandbox-edge proxy** is the
approved routing design (resolves the D3 design question), and website independence is
restated as binding. Sandbox capability exposure and the sandbox-operator rebuild
remain **pending explicit Stage C execution approval**. Stage C is still **not
implemented** — this addendum records decisions only, no runtime change.

Repository-level drift (D1/D2/D4 and the D3 repo aspect) was subsequently resolved —
see [COMPOSE_DEPLOY_DRIFT_RESOLUTION.md](COMPOSE_DEPLOY_DRIFT_RESOLUTION.md) and
[../../docs/infra/BANZAMI_SERVICE_AUTHORITY_MATRIX.md](../../docs/infra/BANZAMI_SERVICE_AUTHORITY_MATRIX.md).
