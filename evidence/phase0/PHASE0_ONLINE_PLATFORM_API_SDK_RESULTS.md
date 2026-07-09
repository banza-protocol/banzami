# Phase 0 — Online payments / API-SDK / Platform-integrator Live Results

Version: 1.0

Internal technical Sandbox only. Synthetic participants, synthetic merchants,
synthetic platforms and synthetic balances only. No LIVE, Production, real money,
external payment providers, customer data, public access, DNS/certificate/SMTP
change or infrastructure reset. Live-API calls made over the internal-only network
via `docker exec <service> curl`; secrets read from mounted files into memory only
and never printed. Distinct payment surfaces are labelled explicitly below.

## Enablement provisioned this pass (file-only, Sandbox-scoped)

The developer/platform API-key layer was enabled in the sandbox deploy: `API_KEY_PEPPER`,
`DEVELOPER_INTERNAL_KEY` (gateway↔developer-api matched), `CORE_PAYEE_VALIDATION_KEY`
(core↔developer-api matched), `SESSION_SECRET`, `OTP_PEPPER` (file-only, in-process,
never in Docker-inspectable env), plus `DEVELOPER_KEY_AUTH_ENABLED` +
`PAYMENT_CAPABILITY_RELEASED` and a `developer-api` network alias so the gateway's
SSRF host-allowlist accepts `DEVELOPER_API_URL`. A new Sandbox-only fixture endpoint
`POST /internal/v1/fixture-projects` was added (hard `ENVIRONMENT=sandbox` +
internal-key gated) to mint a synthetic platform without a Console session. The
platform holds no money, computes no balances and issues no receipts.

## Results

| ID | Flow | Surface | Result | Evidence |
|----|------|---------|:------:|----------|
| F0-025 | Platform API key authentication | dev-key | **BLOCKED** | fixture-projects endpoint added + unit-tested, but the developer-api DB schema (`developer.*`) is **not provisioned** in the sandbox DB (0 tables; runtime role lacks schema access). Minting/validating a live key needs that schema, which requires running the developer-api migration — forbidden in Phase 0. |
| F0-026 | SDK-style payment request creation | payment link (merchant-auth) | PASS | payment-link create 201 — the same "create a payment request" shape a future SDK exposes. Merchant-authenticated (dev-key authenticator BLOCKED per F0-025). |
| F0-027 | Online checkout payment success | QR-direct (online) | PASS | consumer paid online via QR → 201 COMPLETED; merchant +50.000 / payer −50.000 (wallet-native double-entry). |
| F0-028 | Webhook delivery success | webhook | SIMULATED | event-emission pipeline reachable (`GET /v1/webhooks/events` 200); a live 2xx outbound delivery requires a public https sink (SSRF-enforced) — excluded by the no-external / no-public constraint. Signature is `Banza-Signature` HMAC-SHA256; envelope carries an event id. |
| F0-029 | Webhook retry / failure handling | webhook | SIMULATED | retry/backoff schedule (1m/5m/30m/2h/8h, max 5, terminal FAILED) + delivery idempotency (`UNIQUE(event_id,endpoint_id)`) verified in code + unit tests; live outbound retries need an external sink — excluded. |
| F0-030 | Platform reconciliation | list + balance | PASS | created (1 payment link / 1 QR, 50.000) vs settled (`GET /v1/merchant/wallet-payments` → 1 COMPLETED, ref BZM-…) vs `GET /v1/wallets/{id}/balance` (available 50.000) — zero discrepancy. |
| F0-031 | Receipt verification | proof / receipt | DEFERRED | the settled wallet payment exposes a receipt reference (`reference` BZM-…, `receipt_available=true`) via the authenticated merchant API, but the PUBLIC proof (`GET /v1/public/proofs/{ref}`) is minted only for transaction/acquiring proofs, not wallet-native transfers — the wallet-payment reference returns NOT_FOUND. No live failure; the public-proof path is not applicable to this settlement type. |
| F0-032 | Revoked/invalid API key rejection | dev-key auth | PASS | invalid key → 401 UNAUTHORIZED. Revoked and invalid are deliberately indistinguishable (both → 401), so this exercises the shared rejection contract. A live revoke of a real key is BLOCKED with F0-025 (schema). |
| F0-033 | Unauthorised platform rejection | dev-key auth | PASS | no Authorization → 401; forged `bz_test_sk_…` key → 401 UNAUTHORIZED. (Scope/payee-rejection variants require a live key — blocked with F0-025.) |
| F0-034 | Payment link expiry / cancel | payment link | PASS | create 201 → cancel (DELETE) 200 → pay attempt → 422 `LINK_NOT_ACTIVE`. |
| F0-035 | Payment intent idempotency | payment request | PASS | pay twice with the same intent → payer debited exactly once (30.000); replay rejected `REQUEST_NOT_PENDING`. |

Related flows already merged on main (context): F0-006 QR payment (PASS), F0-007
payment link acquiring-settlement (SIMULATED — external EMIS rail), F0-008 payment
intent create→pay→decline (PASS), F0-020 reconciliation (PASS), F0-021 refund (PASS).

## Surface distinctions (as required)

- **QR payment** — consumer→merchant wallet transfer (F0-006, F0-027 checkout): PASS live.
- **Payment link** — create + cancel (F0-026, F0-034): PASS live; acquiring settlement (F0-007) is the external EMIS rail (SIMULATED / not in scope).
- **Payment intent** — payment-request create→pay→decline + idempotency (F0-008, F0-035): PASS live.
- **Online / API / SDK flow** — SDK-shape requests via the payment surface (F0-026/F0-027): PASS live (merchant-auth). The **dev-key platform authenticator** (F0-025) is BLOCKED on the un-migrated developer schema.
- **Webhook flow** — emission + signature + retry contract (F0-028/029): SIMULATED (outbound needs an external sink).
- **Platform reconciliation** (F0-030): PASS live, zero discrepancy.
- **Receipt verification** (F0-031): DEFERRED (public proof wired to transactions, not wallet transfers).
- **Simulated external-provider settlement** — payment-link acquiring/EMIS (F0-007): SIMULATED / NOT_IN_SCOPE.
- **Tabletop incident/restart** (F0-019/F0-022): SIMULATED.

## Blocker (reported, not fabricated)

**BLOCKER — PLATFORM API MODEL (data layer) MISSING IN SANDBOX DB.** The developer-api
schema (`developer.*` tables: workspaces, projects, api-keys, bindings) is not present
in the sandbox database, and the least-privilege runtime role has no access to it.
The platform API **model and fixture endpoint exist and are unit-tested**; only the
live path is blocked, because provisioning the schema requires running the developer-api
migration, which Phase 0 forbids. Follow-up: provision the developer schema in the
sandbox DB (operator migration, outside Phase 0) to unblock F0-025 and the dev-key
variants of F0-032/F0-033.

## Non-claims

No LIVE, Production, real money, external payment provider, real EMIS callback,
customer data, public access, DNS/certificate/SMTP change, migration or infrastructure
reset was used. No production SDK is claimed — F0-026 is an SDK contract simulation
(the HTTP request shape a future SDK would expose). This is not a claim of full Phase 0
/ production completion or any BNA approval/admission.
