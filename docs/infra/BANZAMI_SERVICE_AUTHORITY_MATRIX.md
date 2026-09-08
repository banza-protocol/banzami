# Banzami — Service Authority Matrix

Version: 1.0

> **Scope note.** Sanitised: no IPs, private hostnames, SSH users, server paths,
> secrets, tokens, DB URLs, private endpoints or provider details. This matrix is the
> repository's single answer to "which runtime is authoritative for what, and which
> deploy/restore paths are approved" after the Stage C architecture decisions
> ([BANZAMI_STAGE_C_SANDBOX_PUBLIC_ROUTING_DECISIONS.md](BANZAMI_STAGE_C_SANDBOX_PUBLIC_ROUTING_DECISIONS.md)).
> `deploy.sh` enforces it fail-closed; `tests/ops/deploy-authority-gate.test.sh` proves it.

## Matrix

| Surface / component | Authority status | Deploy/restore path |
|---|---|---|
| **website-edge + website app** (banzami.com / www) | **ACTIVE — current authority** for the institutional website. Website-edge is website-only: it must never gain sandbox/payment/admin/gateway upstream dependencies (Decision 3). | `./deploy.sh website-frontend` — **approved** (scope-aware assurance gate) |
| **rt04e sandbox project** | **ACTIVE — current authority** for the staging / Developer Platform runtime (Decision 1). Config-isolated, contract-managed. | `./deploy.sh developer-api\|core-api-staging\|api-gateway-staging\|public-api-staging` (invoked alone) — **approved**, routes to the sandbox source-deploy flow |
| **sandbox-edge** | **APPROVED DESIGN, NOT IMPLEMENTED** — the dedicated proxy that will carry Stage C sandbox public routes (Decision 2). Exists as documentation only; no runtime artifact may exist before the separately approved Stage C implementation PR. | None yet — future `ops: implement sandbox-edge proxy for Stage C` PR |
| **Old shared proxy** (legacy edge config) | **NOT AUTHORIZED** for sandbox public routing until redesigned: routes point at retired compose-network names; no DNS resolver (522 root cause). Config kept for reference only, marked DEPRECATED. | None — must not be redeployed as-is |
| **Compose staging duplicates** (staging services in the local full compose; legacy `staging` deploy path) | **DEPRECATED / NOT AUTHORITATIVE** — local development only (Decision 1 consequence). | `./deploy.sh staging` — **fails closed** |
| **Live core-api / api-gateway / public-api** (real payment rails) | **NOT APPROVED / NOT DEFINED for restore** — not defined server-side; require Stage E+ approval, rotated live-era secrets and the ADR-034 rollout gate. | `./deploy.sh core-api\|api-gateway\|public-api` — **fails closed** |
| **operator console** (admin-api, admin-frontend) | **STAGE D APPROVED — 2026-09-08, SANDBOX SCOPE ONLY.** Approved by the owner by name in the final pre-launch closure brief, which records `admin.banzami.com` returning 503 as a release blocker and instructs the bring-up through the canonical source-bundle process. Bounded like Stage F: admin-api runs against the Sandbox stack with `ENVIRONMENT=SANDBOX` so the console labels what it shows for what it is, there is no LIVE database for it to reach, and the live payment rails stay fail-closed. Revoke by restoring `_deny_unapproved` for both services in `deploy.sh`. | `./deploy.sh admin-api\|admin-frontend` — **approved (sandbox scope)** |
| **merchant dashboard** (dashboard-frontend) | **NOT APPROVED.** Stage D covers the operator console only; the merchant surface needs its own approval and runbook. | `./deploy.sh dashboard-frontend` — **fails closed** |
| **pay** (pay-frontend) | **STAGE F APPROVED — 2026-09-05, SANDBOX SCOPE ONLY.** Approved by the owner in the external-Sandbox-launch brief, which names this surface and instructs its deployment (Banzami ADR-052). The approval is bounded: the surface serves the environment Platform Mode selects, and while that is `SANDBOX` it reads the Sandbox stack, shows the SANDBOX badge and does not offer the external acquiring rail. It does not approve, enable or imply a LIVE payment surface — the live gateway remains offline and fail-closed, and external provider rails remain Stage G. Revoke by restoring `_deny_unapproved` for `pay-frontend` in `deploy.sh`. | `./deploy.sh pay-frontend` — **approved (sandbox scope)** |
| **checkout** (checkout-frontend) | **RETIRED** — `apps/checkout` was a redundant second application presenting the same payment and claiming the same host; deleted under Banzami ADR-052. `checkout.banzami.com` is an alias that redirects to the canonical origin, not an application. | None — the service no longer exists |
| **sandbox-operator** | Rebuild **pending explicit Stage C execution approval** (Decision 5); stateless, no DB, no secrets. | `./deploy.sh sandbox-operator` — **fails closed** until Stage C execution approval |
| **developers.banzami.com** | **OPERATIONAL — SANDBOX SCOPE ONLY (2026-09-08).** Served by the website app's host-guarded developer pages. Supersedes the earlier DEMO / NON-OPERATIONAL status: the condition Decision 6 set — "until a real console is implemented and tested" — is met, and the full external developer lifecycle runs against the deployed Sandbox (sign-in, workspaces, projects, financial setup, API keys with reveal-once and revocation, wallet accounts, balances, transactions, refunds, webhooks and request logs). It does not approve or imply a LIVE console: Financial LIVE remains fail-closed and no Console path reaches it. | Part of the website deploy; no separate path |
| **External providers / live rails** | **OUT OF SCOPE** — payment-rail / external-provider activation is a separate governance decision (Stage G) and is not enabled by any approved path above. | None |

## Enforcement

- `deploy.sh` — `_authority_gate` denies every unapproved service **before** any
  banner, gate, build, transfer or deploy step, with a governance message pointing
  here. "Deploy all" (no argument) is retired and fails closed.
- Global safety preserved and unchanged: single-source-of-truth preflight guard
  (wrong-checkout / `banzami-canonical` rejection), no local Mac QEMU amd64 build
  fallback, scope-aware website assurance gate, `BANZAMI_ASSURANCE_ONLY`,
  `BANZAMI_SKIP_ASSURANCE` break-glass semantics.
- Proof: `tests/ops/deploy-authority-gate.test.sh` (no Docker, no network, no DB)
  and `tests/ops/website-assurance-gate.test.sh`.

## Related

- [BANZAMI_STAGE_C_SANDBOX_PUBLIC_ROUTING_DECISIONS.md](BANZAMI_STAGE_C_SANDBOX_PUBLIC_ROUTING_DECISIONS.md)
- [BANZAMI_PUBLIC_WEBSITE_ARCHITECTURE.md](BANZAMI_PUBLIC_WEBSITE_ARCHITECTURE.md)
- [BANZAMI_SINGLE_SOURCE_OF_TRUTH.md](BANZAMI_SINGLE_SOURCE_OF_TRUTH.md)
- [../../evidence/ops/COMPOSE_DEPLOY_DRIFT_RESOLUTION.md](../../evidence/ops/COMPOSE_DEPLOY_DRIFT_RESOLUTION.md)
