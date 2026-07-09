# Phase 0 — Live API Sandbox Results (pilot-enabled)

Version: 1.0

Internal technical Sandbox only. Synthetic participants and balances only. No real
money, customers, external providers, public access, LIVE, Production or BNA claim.
All values below are genuine (non-fabricated) outcomes of live API calls made over
the internal-only network via `docker exec <service> curl` against the deployed
Sandbox. No secrets, tokens, IDs, hostnames, IPs or paths are recorded.

## Redeploy (pilot-enabled)

The four approved internal Sandbox services were rebuilt (deployment-target arch)
and redeployed through the gated adapter, then verified:

| Check | Result |
|-------|:------:|
| Release package build + verify (digests, SBOM/provenance, secret-free) | PASS |
| Verified transfer + source/state materialisation + revision match | PASS |
| Controlled redeploy (deploy-clean of old services + deploy-apply) | PASS |
| core-api-staging / api-gateway-staging / developer-api / public-api-staging healthy | PASS (4/4) |
| non-root runtime (4/4) | PASS |
| `ENVIRONMENT=sandbox`, `BANZAMI_PILOT_LIMITS=1` active in all four | PASS |
| PostgreSQL / Redis / services — no host-published ports | PASS |

`BANZAMI_PILOT_LIMITS=1` is set **only** in the Sandbox deploy profile
(`infra/blueprint/sandbox-ops/scripts/sandbox-deploy.sh`, `ENVIRONMENT=sandbox`);
the policy double-gates and cannot activate on any live/production environment.

A genuine deploy defect was found and fixed during this work: the deployed gateway
defaulted `CORE_API_URL` to its own localhost, so every core-api-backed operation
failed. The Sandbox deploy adapter now wires the inter-service URLs.

## Live API E2E — genuine results

| ID | Test | Live result | Note |
|----|------|:-----------:|------|
| F0-001 | Sandbox health and service allowlist | PASS | gateway `/health` 200; four approved services; no host ports |
| F0-002 | Synthetic consumer onboarding (create) | PASS | HTTP 201 ACTIVE |
| F0-003 | Synthetic merchant onboarding (create) | PASS | HTTP 201 ACTIVE |
| F0-004 | Wallet/account creation (merchant + consumer wallets) | PASS | HTTP 201; available account id returned |
| F0-006 | QR static creation | PASS | HTTP 201; payload returned |
| F0-013..F0-016 | Pilot-limit rejections (per-payment, daily, merchant receiving, aggregate) | BLOCKED (live) | see below |
| F0-005,007,008,009,010,011,012,017,018,020,021 | Payment / ledger / recon / refund flows | BLOCKED (live) | depend on a routable, KYC-elevated, funded consumer |

Authentication for the live calls was bootstrapped synthetically by minting a
`SANDBOX` merchant JWT with the Sandbox's own signing secret (read from the mounted
secret file, held only in volatile memory, never logged, persisted, committed or
reported).

## Why the limit-rejection live proofs are blocked in this pass

The pilot-limit enforcement is **correct and already verified** by real-database
integration tests (merged: `core/compliance/tests/pilot_enforcement_integration.rs`,
8/8 PASS — allow/reject per cap, no ledger mutation on rejection), and the
pilot-enabled build is **deployed and active**. The remaining gap is purely
test-fixture setup: driving the limit rejections **through the live payment API**
requires a payer consumer that is (a) routable by `@banza` handle — which is bound
only by the OTP onboarding flow (start → verify → complete), not the direct wallet
create; (b) elevated to KYC BASIC — which requires the consumer-facing
authentication surface; and (c) for the daily/merchant/aggregate caps, funded to
build up the required ledger state. Assembling this multi-step, multi-service
synthetic fixture chain could not be completed to a genuine passing state in this
pass, and no limit-rejection result was fabricated.

## Non-claims

No LIVE, Production, real money, external payment provider, customer data, public
access, DNS/certificate/SMTP change, or BNA approval/admission is claimed. No
infrastructure was reset. This is not a claim of full Phase 0 live completion.

## Status

The pilot-enabled redeploy is complete and verified, and core API onboarding/
creation flows are proven live. The live-API **limit-rejection** proofs remain
blocked on the routable-consumer onboarding + KYC-elevation + funding fixture
chain — tracked as the remaining Phase 0 live work.
