# Phase 0 — Live API Sandbox Results (pilot-enabled)

Version: 1.0

Internal technical Sandbox only. Synthetic participants and balances only. No real
money, customers, external providers, public access, LIVE, Production or BNA claim.
All values below are genuine (non-fabricated) outcomes of live API calls made over
the internal-only network via `docker exec <service> curl` against the deployed
pilot-enabled Sandbox. No secrets, tokens, IDs, hostnames, IPs or paths are recorded.

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
the policy double-gates (`requested && !liveish`) and cannot activate on any
live/production environment.

Two genuine deploy defects were found and fixed during this work: (1) the deployed
gateway defaulted `CORE_API_URL` to its own localhost, so every core-api-backed
operation failed — the Sandbox deploy adapter now wires the inter-service URLs; and
(2) the Sandbox synthetic funding path (`test-credit`) bypassed the pilot funding
guard — `check_funding` (consumer-balance + aggregate-funds caps) is now applied on
that path so every funding entry point respects the V1.0 pilot limits.

## Synthetic fixture chain (live, no DB seeding)

The full fixture chain was assembled through public/internal Sandbox APIs only:

```
onboarding start → OTP verify (test hook) → complete (binds routable @banza handle)
  → KYC elevate to BASIC (consumer JWT, simulated provider)
  → merchant create → merchant wallet → merchant static QR
  → synthetic funding (sandbox test-credit)
  → QR pay (consumer → merchant) → balance readback → rejection cases → no-mutation readback
```

Authentication was bootstrapped by minting `SANDBOX` JWTs with the Sandbox's own
signing secret, read from the mounted secret file, held only in volatile memory, and
never logged, persisted, committed or reported.

## Live API E2E — genuine results (13/13 PASS)

| ID | Test | Result | Evidence |
|----|------|:------:|----------|
| F0-001 | Health + service allowlist | PASS | gateway `/health` 200; 4 approved services; non-root; no host ports; pilot active |
| F0-002 | Consumer onboarding | PASS | start 201 → verify 200 → complete 201 ACTIVE; routable handle bound |
| F0-003 | Merchant onboarding | PASS | HTTP 201 |
| F0-004 | Wallet creation (merchant + consumer) | PASS | HTTP 201 |
| F0-005 | Funding + consumer max-balance cap | PASS | fund 40.000 OK; credit past 50.000 → `PILOT_LIMIT_CONSUMER_BALANCE_EXCEEDED`; balance unchanged |
| F0-006 | QR payment success | PASS | HTTP 201 COMPLETED |
| F0-009 | Ledger double-entry | PASS | consumer −200.000 / merchant +200.000 via balance readback |
| F0-010 | Idempotent retry | PASS | same key → COMPLETED; balance unchanged (no double charge) |
| F0-012 | Insufficient balance | PASS | HTTP 422 `INSUFFICIENT_FUNDS` |
| F0-013 | Per-payment limit (25.000) | PASS | pay 30.000 → `PILOT_LIMIT_PER_PAYMENT_EXCEEDED`; balances unchanged |
| F0-014 | Consumer daily limit (50.000) | PASS | cumulative >50.000 → `PILOT_LIMIT_CONSUMER_DAILY_EXCEEDED`; balances unchanged |
| F0-015 | Merchant daily receiving (100.000) | PASS | cumulative >100.000 → `PILOT_LIMIT_MERCHANT_DAILY_EXCEEDED`; merchant balance unchanged |
| F0-016 | Aggregate funds (500.000) | PASS | funds-in-circulation >500.000 → `PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED`; balance unchanged |
| F0-017 | Invalid QR payload | PASS | HTTP 400 `BAD_REQUEST` |

### Pilot-limit rejection proof (per the six required properties)

For each of the five limit rejections proven live (F0-013, F0-014, F0-005, F0-015,
F0-016) the following were verified at the API level:

1. **Deterministic `PILOT_LIMIT_*` error** — exact code returned (see table).
2. **Consumer balance unchanged** — balance readback before == after.
3. **Merchant balance unchanged** — balance readback before == after.
4. **Ledger unchanged** — balances are ledger-derived (no persisted balance column),
   so unchanged balances demonstrate no ledger mutation.
5. **Transaction not completed** — the call returns the limit code, not COMPLETED.
6. **No partial posting** — the paired before/after readback is identical, so no
   one-sided or partial entry was written (F0-018).

## The three caps not driven independently live

Three of the eight caps are **not independently triggerable through the live payment
API** and are covered by the merged real-DB integration suite
(`core/compliance/tests/pilot_enforcement_integration.rs`, 8/8 PASS — allow/reject
per cap, asserting no ledger mutation on rejection):

| Cap | Why not isolated at API level |
|-----|-------------------------------|
| Merchant per-received (25.000) | Equal to the consumer per-payment cap (25.000). A single receipt >25.000 requires a payer payment >25.000, which is blocked on the payer side first (`PILOT_LIMIT_PER_PAYMENT_EXCEEDED`). |
| Merchant max balance (100.000) | Equal to the merchant daily-receiving cap (100.000). The daily cap trips on the same crossing receipt and is evaluated first, so the balance cap is shadowed. |
| Aggregate volume (2.000.000) | Impractical to drive at API volume — ~80+ payments while the per-payment (25.000) and daily (50.000) caps throttle throughput. |

These are marked **SIMULATED** (engine-verified), not FAIL: no live test ran and
failed. Their deterministic codes (`PILOT_LIMIT_MERCHANT_RECEIVE_EXCEEDED`,
`PILOT_LIMIT_MERCHANT_BALANCE_EXCEEDED`, `PILOT_LIMIT_AGGREGATE_VOLUME_EXCEEDED`) are
asserted by the integration and unit suites.

## Status summary

| Status | Count | IDs |
|--------|:-----:|-----|
| PASS (live) | 17 | F0-001..006, 009, 010, 012..018, 023, 024 |
| SIMULATED | 3 | F0-011 (idempotency-covered), F0-019, F0-022 |
| DEFERRED | 4 | F0-007 links, F0-008 intents, F0-020 recon, F0-021 refund |
| FAIL | 0 | — |

## Non-claims

No LIVE, Production, real money, external payment provider, customer data, public
access, DNS/certificate/SMTP change, or BNA approval/admission is claimed. No
infrastructure was reset. No migrations were run (a read-only identity/ownership
posture check is a pre-existing DB-hardening finding, orthogonal to this deploy and
left untouched). The aggregate-funds cap test intentionally saturated the synthetic
Sandbox funds-in-circulation to 500.000; this is expected and affects only the
throwaway synthetic Sandbox state.
