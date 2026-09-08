# Banzami — Stage C Sandbox Public Routing: Required Operator Decisions

Version: 1.0
Status: **ARCHITECTURE DECISIONS RECORDED (2026-07-10) — STAGE C EXECUTION NOT APPROVED, NOTHING IMPLEMENTED**

> **Scope note.** Sanitised: no IPs, private hostnames, SSH users, server paths,
> secrets, tokens, DB URLs, private endpoints or provider details. This document
> records decisions required **before** Stage C implementation. It implements nothing.

## Context

Stages A (production Postgres/Redis restore + integrity + backup recovery) and B
(public routing guard — offline subdomains return controlled 503 maintenance instead of
website HTML) are complete and merged. The read-only Stage C readiness report
([../../evidence/ops/STAGE_C_READINESS_SECRET_AND_DRIFT_REPORT.md](../../evidence/ops/STAGE_C_READINESS_SECRET_AND_DRIFT_REPORT.md))
found that secrets are **not** the Stage C blocker; the blockers are two drift items:

- **D2** — two parallel staging definitions (shared compose duplicates vs the actually
  running rt04e sandbox project);
- **D3** — proxy routes pointing at container names/networks that no longer match the
  running upstreams; the old shared proxy additionally has no DNS resolver (the
  original 522 root cause) and **must not be reused as-is**.

Stage C scope, when approved, is strictly: public routing for
`developer-api.banzami.com`, `sandbox-api.banzami.com`, `sandbox-operator.banzami.com`
— sandbox money only, no live rails, no operational Developer Console claim.

## Decision 1 — Authoritative staging runtime

**APPROVED (operator, 2026-07-10):** the rt04e sandbox project is the authoritative
staging / Developer Platform runtime.

Consequence: the shared-compose staging duplicates (image-absent, legacy tag pinning)
and the legacy staging deploy path are deprecated and will be removed in the
drift-resolution follow-up PR.

## Decision 2 — Routing design

**APPROVED (operator, 2026-07-10):** use a **dedicated sandbox-edge proxy** for Stage C
sandbox public routes (former Option B). The website edge stays fully
static/independent — the strongest preservation of the Stage B independence property.

The extend-the-website-edge alternative (former Option A) is rejected: it would give
the website edge upstream dependencies, weakening the independence rule.

## Decision 3 — Website independence

**APPROVED (operator, 2026-07-10):** `banzami.com` / `www.banzami.com` remain served by
the website-only edge and must not depend on sandbox/payment/admin/gateway/API
services. This restates the independence rule of
[BANZAMI_PUBLIC_WEBSITE_ARCHITECTURE.md](BANZAMI_PUBLIC_WEBSITE_ARCHITECTURE.md) as a
binding constraint on all Stage C+ routing work.

## Decision 4 — Sandbox capability exposure

**PENDING EXPLICIT STAGE C EXECUTION APPROVAL.**

Public routing to developer-api/sandbox-api/sandbox-operator would expose
**sandbox-scoped payment capability only** (running services report
`ENVIRONMENT=sandbox`; sandbox money; never live rails; no external providers). This
exposure happens only within a separately approved Stage C implementation.

## Decision 5 — sandbox-operator rebuild

**PENDING EXPLICIT STAGE C EXECUTION APPROVAL.**

The stateless sandbox-operator image (no database, no secrets, simulated-only) may be
rebuilt **only** during a separately approved Stage C implementation.

## Decision 3 — amendment (2026-09-08, Stage D)

Decision 3 bounded the website edge to website-only upstreams. That is amended
for exactly one hostname: **`admin.banzami.com`**.

Cloudflare routes each hostname to an origin port with an Origin Rule
(`banzami.com` → 8443, the Sandbox hosts → 2053). A hostname with no rule lands
on the default origin port 443, which the website nginx container owns — so
`admin.banzami.com` already arrived there and answered the maintenance 503.
Serving it from the sandbox edge would need a new Origin Rule, and the only
Cloudflare credential on the host is a DNS-01 token that cannot read a zone.

The amendment is bounded so Decision 3's reason still holds, and the bounds are
asserted by `tests/ops/website-edge-isolation.test.sh`:

- the `banzami.com` / `www` block is untouched and proxies only the website;
- every upstream in the admin vhost is held in a **variable** and resolved at
  request time. nginx resolves a literal `proxy_pass` host at config load, so
  one absent container would stop the whole proxy — including `banzami.com` —
  from starting. Through a variable, a missing admin container is a 502 on
  `admin.banzami.com` and nothing else;
- no LIVE payment hostname is served by this edge.

If a Cloudflare credential that can write Origin Rules becomes available, moving
this hostname to the sandbox edge restores Decision 3 unamended.

## Decision 6 — Unsupported surfaces

**CONFIRMED (not pending):**

- ~~No operational Developer Console claim (`developers.banzami.com` remains
  demo/docs/non-operational until a real console is implemented and tested).~~
  **SUPERSEDED 2026-09-08.** The condition this set — "until a real console is
  implemented and tested" — has been met. The Console runs the full external
  developer lifecycle against the deployed Sandbox: email + OTP sign-in,
  workspaces, projects, financial setup, the API-key lifecycle including
  reveal-once and revocation, wallet accounts, balances, transactions, refunds,
  webhook endpoints/events/deliveries and request logs, all on the project's own
  data. Two independent tenants were taken through it end to end from outside the
  monorepo, using only the published SDK and a key copied once from the Console.
  Nothing here approves a LIVE console: the surface is Sandbox, and Financial
  LIVE remains fail-closed.
- No pay/checkout public restore.
- No live core-api/api-gateway/public-api restore.
- No external-provider/payment-rail activation.

## Target topology (approved architecture, not yet implemented)

```text
public 443
  ├─ banzami.com / www.banzami.com → website-edge → website app
  ├─ api/sandbox-api/developer-api/sandbox-operator hosts → sandbox-edge → rt04e sandbox project
  └─ all other hosts → controlled 503 maintenance response
```

The sandbox-edge MUST:

- depend only on the rt04e sandbox project;
- not depend on production payment/admin/gateway services;
- not require live rails;
- not expose pay/checkout;
- not expose an operational Developer Console;
- **fail closed** if sandbox upstreams are unavailable (controlled maintenance/error
  response — never a false 200, never website HTML);
- preserve `banzami.com` availability if sandbox routing fails (website-edge remains
  independent in both directions).

## Follow-up implementation PRs (listed only — none created by this document)

| # | PR | Objective | Scope / services touched | Not touched | Downtime | Approval |
|---|---|---|---|---|---|---|
| 1 | `ops: implement sandbox-edge proxy for Stage C` | Stage C proper: dedicated sandbox-edge proxy per Decision 2 + public routes for the three sandbox hosts | New sandbox-edge component + edge host routing | Website vhost/app, payment/admin surfaces, live rails, databases | None for website | **Explicit Stage C execution approval** (also unlocks Decision 4) |
| 2 | `ops: rebuild sandbox-operator for Stage C` | Rebuild the stateless sandbox-operator image (Decision 5) | One stateless service (no DB, no secrets) | Everything else | None | **Explicit Stage C execution approval** |
| 3 | `ops: reconcile compose/deploy service drift` | Reconcile deploy script ↔ server compose (guard/remove live paths, retire staging duplicates per Decision 1) | Deploy tooling + compose source of truth | Running containers, website, sandbox stack | None | Yes |
| 4 | `ops: fix production Postgres + Redis healthchecks` | Correct database name; authenticated Redis ping | Two healthcheck stanzas | Data, schemas, all app services | None (healthcheck refresh only) | Yes (small) |
| 5 | `ops: host secret-hygiene cleanup` | Archive stale env/compose backups; schedule live-era key rotation | Host hygiene + evidence note | All runtime services | None | Yes |

## Related documents

- [BANZAMI_SERVICE_AUTHORITY_MATRIX.md](BANZAMI_SERVICE_AUTHORITY_MATRIX.md) — enforced service authority matrix (fail-closed in `deploy.sh`).
- [BANZAMI_PUBLIC_WEBSITE_ARCHITECTURE.md](BANZAMI_PUBLIC_WEBSITE_ARCHITECTURE.md) — website independence rule.
- [BANZAMI_WEBSITE_RECOVERY_RUNBOOK.md](BANZAMI_WEBSITE_RECOVERY_RUNBOOK.md) — website-only recovery.
- [BANZAMI_SINGLE_SOURCE_OF_TRUTH.md](BANZAMI_SINGLE_SOURCE_OF_TRUTH.md) — authorised repository rule.
- [../../evidence/ops/STAGE_A_PRODUCTION_DB_REDIS_PRECHECK.md](../../evidence/ops/STAGE_A_PRODUCTION_DB_REDIS_PRECHECK.md)
- [../../evidence/ops/STAGE_B_PUBLIC_ROUTING_REPAIR.md](../../evidence/ops/STAGE_B_PUBLIC_ROUTING_REPAIR.md)
- [../../evidence/ops/STAGE_C_READINESS_SECRET_AND_DRIFT_REPORT.md](../../evidence/ops/STAGE_C_READINESS_SECRET_AND_DRIFT_REPORT.md)
- [../../evidence/ops/COMPOSE_DEPLOY_DRIFT_RESOLUTION.md](../../evidence/ops/COMPOSE_DEPLOY_DRIFT_RESOLUTION.md)
