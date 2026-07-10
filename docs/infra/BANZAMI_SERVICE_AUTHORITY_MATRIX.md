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
| **admin** (admin-api, admin-frontend, dashboard-frontend) | **FUTURE STAGE D — NOT APPROVED in this PR.** Requires Stage D approval, secret reconciliation and an approved runbook. | `./deploy.sh admin-api\|admin-frontend\|dashboard-frontend` — **fails closed** |
| **pay / checkout** (pay-frontend, checkout-frontend) | **NOT APPROVED** — public payment surfaces; explicit Stage F approval required. | `./deploy.sh pay-frontend\|checkout-frontend` — **fails closed** |
| **sandbox-operator** | Rebuild **pending explicit Stage C execution approval** (Decision 5); stateless, no DB, no secrets. | `./deploy.sh sandbox-operator` — **fails closed** until Stage C execution approval |
| **developers.banzami.com** | **DEMO / NON-OPERATIONAL** — served by the website app's host-guarded developer pages; no operational Developer Console exists or may be claimed (Decision 6). | Part of the website deploy; no separate path |
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
