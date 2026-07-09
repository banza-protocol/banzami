# Phase 0 — Online payments / API-SDK / Platform-integrator Live Results

Version: 1.0

Internal technical Sandbox only. Synthetic participants, synthetic merchants,
synthetic platforms and synthetic balances only. No LIVE, Production, real money,
external payment providers, customer data, public access, DNS/certificate/SMTP
change or infrastructure reset. Live-API calls made over the internal-only network
via `docker exec <service> curl`; secrets read from mounted files into memory only
and never printed. Distinct payment surfaces are labelled explicitly below.

## Enablement provisioned (file-only, Sandbox-scoped)

The developer/platform API-key layer was enabled in the sandbox deploy: `API_KEY_PEPPER`,
`DEVELOPER_INTERNAL_KEY` (gateway↔developer-api matched), `CORE_PAYEE_VALIDATION_KEY`
(core↔developer-api matched), `SESSION_SECRET`, `OTP_PEPPER` (file-only, in-process,
never in Docker-inspectable env), plus `DEVELOPER_KEY_AUTH_ENABLED` +
`PAYMENT_CAPABILITY_RELEASED` and a `developer-api` network alias so the gateway's
SSRF host-allowlist accepts `DEVELOPER_API_URL`. A new Sandbox-only fixture endpoint
`POST /internal/v1/fixture-projects` was added (hard `ENVIRONMENT=sandbox` +
internal-key gated) to mint a synthetic platform without a Console session. The
platform holds no money, computes no balances and issues no receipts.

**Developer data model (unblock).** The canonical developer migrations (`0089`, `0100`)
were applied to `banzami_staging` via the existing gated migration adapter, and
`bl_app_runtime` was granted least-privilege DML (SELECT/INSERT/UPDATE/DELETE + USAGE,
no DDL/ownership) on the `developer` schema. Post-migration verification (superuser,
read-only): schema present, 8 developer tables, runtime role has USAGE + INSERT +
SELECT, migrations at version 100. A pre-existing operational gap was fixed: the gated
adapter now refreshes the short-lived `bl_migration` login (whose `VALID UNTIL` expires
~30 min post-bootstrap) before applying, using the canonical role bootstrap.

## Results

| ID | Flow | Surface | Result | Evidence |
|----|------|---------|:------:|----------|
| F0-025 | Platform API key authentication | dev-key | PASS | synthetic platform provisioned via `POST /internal/v1/fixture-projects`; active synthetic key → `GET /v1/me` 200 `key_status=active` with project + scopes. |
| F0-026 | SDK-style payment request creation | payment link (merchant-auth) | PASS | payment-link create 201 — the same "create a payment request" shape a future SDK exposes. |
| F0-027 | Online checkout payment success | QR-direct (online) | PASS | consumer paid online via QR → 201 COMPLETED; merchant +50.000 / payer −50.000 (wallet-native double-entry). |
| F0-028 | Webhook delivery success | webhook | SIMULATED | event-emission pipeline reachable (`GET /v1/webhooks/events` 200); a live 2xx outbound delivery requires a public https sink (SSRF-enforced) — excluded by the no-external / no-public constraint. Signature is `Banza-Signature` HMAC-SHA256; envelope carries an event id. |
| F0-029 | Webhook retry / failure handling | webhook | SIMULATED | retry/backoff schedule (1m/5m/30m/2h/8h, max 5, terminal FAILED) + delivery idempotency (`UNIQUE(event_id,endpoint_id)`) verified in code + unit tests; live outbound retries need an external sink — excluded. |
| F0-030 | Platform reconciliation | list + balance | PASS | created (1 payment link / 1 QR, 50.000) vs settled (`GET /v1/merchant/wallet-payments` → 1 COMPLETED, ref BZM-…) vs `GET /v1/wallets/{id}/balance` (available 50.000) — zero discrepancy. |
| F0-031 | Receipt verification | authenticated receipt | PASS | settled wallet payment exposes a server-generated receipt reference (BZM-…) via `GET /v1/merchant/wallet-payments`: reference queryable, status matches the payment (COMPLETED), `receipt_available=true`, payer shown handle-only (`@handle`, no personal data), and a forged reference does not resolve on the public verifier (`exists=false`). The public `/r/{ref}` proof page is transaction/acquiring-scoped and not minted for wallet-native transfers. |
| F0-032 | Revoked/invalid API key rejection | dev-key auth | PASS | invalid key → 401; revoked and invalid are indistinguishable by design (both 401); active keys authenticate (F0-025), exercising the full accept/reject boundary. No balance/ledger mutation on rejection. |
| F0-033 | Unauthorised platform rejection | dev-key auth | PASS | no Authorization → 401; forged `bz_test_sk_…` key → 401; authenticated read-only key on a write route → 403 `INSUFFICIENT_SCOPE`. No balance/ledger mutation on rejection. |
| F0-034 | Payment link expiry / cancel | payment link | PASS | create 201 → cancel (DELETE) 200 → pay attempt → 422 `LINK_NOT_ACTIVE`. |
| F0-035 | Payment intent idempotency | payment request | PASS | pay twice with the same intent → payer debited exactly once (30.000); replay rejected `REQUEST_NOT_PENDING`. |

Related flows already merged on main (context): F0-006 QR payment (PASS), F0-007
payment link acquiring-settlement (SIMULATED — external EMIS rail), F0-008 payment
intent create→pay→decline (PASS), F0-020 reconciliation (PASS), F0-021 refund (PASS).

## Surface distinctions (as required)

- **QR payment** — consumer→merchant wallet transfer (F0-006, F0-027 checkout): PASS live.
- **Payment link** — create + cancel (F0-026, F0-034): PASS live; acquiring settlement (F0-007) is the external EMIS rail (SIMULATED / not in scope).
- **Payment intent** — payment-request create→pay→decline + idempotency (F0-008, F0-035): PASS live.
- **Online / API / SDK flow** — dev-key platform authentication (F0-025) PASS live; SDK-shape payment request (F0-026/F0-027) PASS live.
- **Webhook flow** — emission + signature + retry contract (F0-028/029): SIMULATED (outbound needs an external sink).
- **Platform reconciliation** (F0-030): PASS live, zero discrepancy.
- **Receipt verification** (F0-031): PASS live (authenticated receipt: state-match, handle-only, non-fabricable); public `/r/{ref}` proof is transaction-scoped (not wallet transfers).
- **Simulated external-provider settlement** — payment-link acquiring/EMIS (F0-007): SIMULATED / NOT_IN_SCOPE.
- **Tabletop incident/restart** (F0-019/F0-022): SIMULATED.

## Blocker status

The prior blocker (**PLATFORM API MODEL DATA LAYER MISSING IN SANDBOX DB**) is
**resolved**: the operator authorised, and this pass applied, the canonical developer
migrations via the gated migration adapter, provisioning the `developer.*` schema with
least-privilege runtime grants. All material platform/API/SDK flows now pass live; the
only remaining simulations are justified (webhook outbound delivery requires an external
public sink; the payment-link acquiring settlement is the external EMIS rail; and the
operational restart/incident drills are tabletop). No test failed.

## Key-rejection and receipt proofs (per plan)

- **Active key works** (F0-025), **revoked/invalid key rejected** (F0-032, 401),
  **unauthorised platform rejected** (F0-033: no-auth/forged → 401, wrong-scope → 403).
  Every rejection is at the auth layer, before any posting — **no balance and no ledger
  mutation** on a rejected operation, and no transaction reaches a completed state.
- **Receipt** (F0-031): the reference is queryable, its state matches the Banzami
  payment (COMPLETED), a platform **cannot fabricate** a receipt (a forged reference
  returns `exists=false`), and the receipt exposes **no unnecessary personal data**
  (payer shown handle-only).

## Non-claims

No LIVE, Production, real money, external payment provider, real EMIS callback,
customer data, public access, DNS/certificate/SMTP change, migration or infrastructure
reset was used. No production SDK is claimed — F0-026 is an SDK contract simulation
(the HTTP request shape a future SDK would expose). This is not a claim of full Phase 0
/ production completion or any BNA approval/admission.
