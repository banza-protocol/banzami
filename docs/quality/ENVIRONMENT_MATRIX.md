# Sandbox / Live Environment Matrix — Banzami

Programme: BANZAMI-SANDBOX-RELEASE-ASSURANCE-001 · audited 2026-07-04

Topology note: the platform currently operates in **platform mode SANDBOX**
(`GET /v1/platform-mode` on api.banzami.com returns SANDBOX with public
banner). The "main stack" is the production infrastructure running in sandbox
platform mode; the "staging stack" is the internal pre-production plane
(banzami_staging DB) where features (e.g. payment sessions) are staged before
main-stack deploy. Live money movement is not authorized anywhere.

Control classes: **ENFORCED** (violation impossible by code/config) ·
**CHECKED** (runtime-validated with error) · **CONVENTION** (operational
discipline only — hardening candidates).

| Component | Main stack (platform SANDBOX) | Staging stack | Shared? | Control |
|---|---|---|---|---|
| PostgreSQL | banzami (live DB name) | banzami_staging | same container, separate DBs/creds | ENFORCED (no fallback URLs; services fail to start unset) |
| Redis | redis:6379 (gateway idempotency/rate limit) | staging stack uses no Redis | — | ENFORCED (no sandbox Redis consumer) |
| API gateway | api.banzami.com → api-gateway | sandbox-api.banzami.com → api-gateway-staging | no | ENFORCED (nginx hostname routing) |
| Environment binding | ENVIRONMENT per stack; core defaults to LIVE when unset (fail-closed: test endpoints 403) | ENVIRONMENT=SANDBOX | — | ENFORCED |
| API keys | bz_live_ bound at issuance | bz_test_ | no | ENFORCED (core verify-key returns environment claim; JWT carries it; sandbox handlers 403 non-SANDBOX) |
| Platform mode | platform_settings row, admin-API-gated, history-audited, propagated to both DBs | same value propagated | shared value by design | CHECKED (EnvGate refuses LIVE-stack writes when mode≠LIVE; propagation drift is a monitoring gap) |
| KYC/KYB storage | banzami-kyc (R2) | banzami-kyc-sandbox | no | CHECKED (unset ⇒ 503, fail-closed) |
| Email | Resend | Resend + EmailDryRun flag | shared account | **CONVENTION** — hardening: default dry-run in staging deploys |
| Webhooks | outbox in banzami DB, merchant-scoped | outbox in banzami_staging | no | ENFORCED (per-DB isolation) |
| Acquiring rails (EMIS) | stubbed — provider errors without credentials; test-confirm endpoints 403 in LIVE env | simulated provider | — | ENFORCED fail-closed (no phantom success) |
| Live activation | requires: ENVIRONMENT=LIVE stack + platform_mode=LIVE via authenticated admin API (audited) + EMIS credentials injected + rail implementation (absent) | — | — | multiple independent gates; no single env var enables live money |
| Pay/checkout frontends | pay.banzami.com (client → own /api routes; server routes per-link: sandbox links → STAGING_GATEWAY_URL) | shared frontend serves both planes server-side | yes (single deployment) | CHECKED — E2E of staging-link routing required (RA-015) |
| Seeds/fixtures | seed.sh localhost-only | staging-seed.sh hardcoded staging | no | ENFORCED |
| Rate limits / usage | per-DB | per-DB | no | ENFORCED |
| Source maps | Next.js default off | same | — | ENFORCED (default) |
| Cross-env DB pool (ADR-025 login hint) | optional read-only pool to other env | same | intentional, read-only | CHECKED |
| DNS/edge | Cloudflare-proxied: api, sandbox-api, developers, developer-api, admin, pay, banzami.com | sandbox-api, sandbox-operator | — | ENFORCED at nginx; RA-005 (:3005) and RA-013 (config drift) open |

## Hardening actions (from CONVENTION → CHECKED/ENFORCED)

1. Staging/sandbox email: enforce `EMAIL_DRY_RUN=true` (or a dedicated sandbox
   Resend key) in staging compose; deploy gate should fail otherwise. (RA-016)
2. `ACQUIRING_WEBHOOK_SECRET` must be distinct per environment — add a boot
   guard or deploy check. (RA-017)
3. Platform-mode propagation drift: add startup/periodic consistency check
   between banzami and banzami_staging platform_settings. (RA-018)
4. Deployed E2E proving a staging payment link resolves and pays through
   pay.banzami.com via STAGING_GATEWAY_URL. (RA-015)
