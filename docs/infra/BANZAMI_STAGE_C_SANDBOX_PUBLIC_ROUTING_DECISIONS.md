# Banzami — Stage C Sandbox Public Routing: Required Operator Decisions

Version: 1.0
Status: **PENDING OPERATOR DECISIONS — STAGE C NOT APPROVED, NOTHING IMPLEMENTED**

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

**PENDING OPERATOR DECISION.**

Declare the rt04e sandbox project as the authoritative staging/Developer Platform
runtime (recommended — it is the running, healthy, contract-managed stack), or choose
another explicit source of truth. Consequence of the recommendation: the shared-compose
staging duplicates (image-absent, legacy tag pinning) and the legacy staging deploy path
are marked deprecated and later removed in the drift-resolution PR.

## Decision 2 — Routing design

**PENDING OPERATOR DECISION.** Choose between:

- **Option A — extend the existing public website-edge** with sandbox-host vhosts
  attached safely to the sandbox network. Pros: one public 443 listener, smallest
  runtime footprint. Cons: the website edge gains upstream dependencies (mitigated by a
  DNS resolver + static-fallback design; the website's own vhost keeps zero upstream
  coupling).
- **Option B — dedicated tiny sandbox-edge proxy** joined to the sandbox network, with
  the public edge routing only the sandbox hosts to it. Pros: website edge stays fully
  static/independent (strongest preservation of the Stage B independence property).
  Cons: one more component.

Either option must preserve: website independence, the Stage B default-server 503
guard for all other hosts, and no reintroduction of the old shared-proxy coupling.

## Decision 3 — Sandbox payment capability exposure

**PENDING OPERATOR DECISION.**

Accept that Stage C public routes expose **sandbox-scoped payment capability only**
(running services report `ENVIRONMENT=sandbox`; sandbox money; no live rails; no
external providers). This acceptance must be recorded before public exposure.

## Decision 4 — sandbox-operator rebuild

**PENDING OPERATOR DECISION.**

Approve or reject rebuilding the stateless sandbox-operator image for Stage C (the one
Stage C service with no running instance; no database, no secrets, simulated-only).

## Decision 5 — Unsupported surfaces

**CONFIRMED (not pending):**

- No operational Developer Console claim (`developers.banzami.com` remains
  demo/docs/non-operational until a real console is implemented and tested).
- No pay/checkout public restore.
- No live core-api/api-gateway/public-api restore.
- No external-provider/payment-rail activation.

## Recommended follow-up PRs (not created by this document)

| # | PR | Objective | Scope / services touched | Not touched | Downtime | Approval |
|---|---|---|---|---|---|---|
| 1 | `ops: reconcile service secret manifest` | Key-level manifest of which service consumes which secret category (no values) | Docs/evidence only | All runtime services | None | Yes (encodes decisions) |
| 2 | `ops: resolve compose/deploy service drift` | Reconcile deploy script ↔ server compose (guard/remove live paths, retire staging duplicates per Decision 1) | deploy tooling + compose source of truth | Running containers, website, sandbox stack | None | Yes |
| 3 | `ops: fix production Postgres + Redis healthchecks` | Correct database name; authenticated Redis ping | Two healthcheck stanzas | Data, schemas, all app services | None (healthcheck refresh only) | Yes (small) |
| 4 | `ops: document Stage C sandbox public routing` | Record the Decision 2 design before implementation | Docs only | Everything | None | Yes |
| 5 | `ops: implement sandbox public routes` | Stage C proper: edge vhosts for the three sandbox hosts + sandbox-operator rebuild | Edge proxy config + one stateless service | Website vhost, payment/admin surfaces, live rails | None for website | **Explicit Stage C approval** |
| 6 | `ops: host secret-hygiene cleanup` | Archive stale env/compose backups; schedule live-era key rotation | Host hygiene + evidence note | All runtime services | None | Yes |

## Related documents

- [BANZAMI_PUBLIC_WEBSITE_ARCHITECTURE.md](BANZAMI_PUBLIC_WEBSITE_ARCHITECTURE.md) — website independence rule.
- [BANZAMI_WEBSITE_RECOVERY_RUNBOOK.md](BANZAMI_WEBSITE_RECOVERY_RUNBOOK.md) — website-only recovery.
- [BANZAMI_SINGLE_SOURCE_OF_TRUTH.md](BANZAMI_SINGLE_SOURCE_OF_TRUTH.md) — authorised repository rule.
- [../../evidence/ops/STAGE_A_PRODUCTION_DB_REDIS_PRECHECK.md](../../evidence/ops/STAGE_A_PRODUCTION_DB_REDIS_PRECHECK.md)
- [../../evidence/ops/STAGE_B_PUBLIC_ROUTING_REPAIR.md](../../evidence/ops/STAGE_B_PUBLIC_ROUTING_REPAIR.md)
- [../../evidence/ops/STAGE_C_READINESS_SECRET_AND_DRIFT_REPORT.md](../../evidence/ops/STAGE_C_READINESS_SECRET_AND_DRIFT_REPORT.md)
