# SANDBOX-SELF-SERVICE-001 — baseline

Version: 1.0

What the Public Sandbox actually does on 2026-09-13, before any change for this
milestone, read from the runtime, the source and the deployed containers — not
from earlier notes.

## Start state

```
START_BANZAMI_SHA=d4a7e975
START_DOA_SHA=2612573
START_DEPLOYED_CONSOLE_SHA=70ae9e5a   (the Console and the docs are one Next.js app: website-frontend)
START_DEPLOYED_DOCS_SHA=70ae9e5a
START_PUBLIC_API_VERSION=v1           (OpenAPI info.version "docs-2026-09-11", 32 operations)
START_SDK_VERSION=@banzami/sdk 0.13.0 (npm latest; source 0.13.0 plus the unreleased Payment Link fix b13a6e2a)
Deployed Sandbox containers: api-gateway-staging 2026-09-13, developer-api 2026-09-12,
core-api-staging 2026-09-12, pay-frontend 2026-09-12
```

## Summary

The financial core, the developer API surface, webhooks, request logs and the
documentation are real and already exercised end to end. What stops the Sandbox
from being self-service is concentrated in four places:

1. **Financial Setup needs a human.** A Project's Business is applied for and
   approved in BANZADMIN (ADR-058), then classified and priced by an operator
   (ADR-028/057). The DOCS-PROD-001 journeys needed three operator actions.
2. **A payer needs support.** Paying a session means a Banzami consumer wallet;
   the hosted page in Sandbox shows only the Banzami app, which is not publicly
   distributed. The consumer API that creates and funds wallets exists but is
   not part of the developer surface.
3. **Fictitious value is capped for the whole Sandbox.** `BANZAMI_PILOT_LIMITS=1`
   applies the Phase-0 pilot overlay, including a Sandbox-wide cap of 500 000 Kz
   in circulation. At 10 000 Kz per registration grant, about fifty payers
   exhaust funding for every developer.
4. **Interactive tooling is absent.** No API Explorer, no realtime status, no
   synthetic webhook test, no deterministic failure scenarios, no reset.

## Capability inventory

Legend: **PUBLIC** documented developer surface · **CONSOLE** Developer Console
(session) · **PARTIAL** exists but needs a human or an undocumented surface ·
**INTERNAL** operator or service-internal only · **ABSENT**.

| Capability | State | Where it is | What is missing for self-service |
|---|---|---|---|
| Sign-up (email + code) | CONSOLE | developer-api `/auth/*` | — |
| Workspace, members, roles, Activity | CONSOLE | developer-api | — |
| Project, rename, archive | CONSOLE | developer-api | — |
| Financial Setup | PARTIAL | developer-api `financial-onboarding/applications` → gateway application → **BANZADMIN approve**; `POST /projects/{id}/financial-setup` answers `410 FINANCIAL_SETUP_BY_REVIEW` | Automatic Sandbox provisioning without a human |
| Sandbox Business provisioning | INTERNAL | Core `POST /internal/v1/merchants` + wallet, `POST /internal/v1/sandbox/business-readiness` (handle, Sandbox-only, refuses LIVE) | A Console path; an honest synthetic marker instead of `kyb_status=APPROVED` (the reason ADR-058 retired the one-click setup) |
| Classification (MERCHANT / APPLICATION / PLATFORM) | INTERNAL | Core `PATCH /internal/v1/merchants/{id}/business-account-type`, BANZADMIN | Policy-derived from a use case |
| Pricing profile | INTERNAL | Core `PUT /internal/v1/merchants/{id}/pricing-profile`; approval assigns `sandbox-default`; `sandbox-reference` is the non-zero Sandbox profile | Policy-derived from a use case |
| Connect an existing Business | PARTIAL | Consent code issued from the **Business App** session; spent in the Console | A code a Sandbox Business's owning Project can issue itself |
| API keys, scopes, rotate, revoke | CONSOLE + PUBLIC | developer-api, gateway `authorizeKey` | Keys have no expiry (needed for a server-side Explorer credential) |
| `GET /v1/me`, `GET /v1/financial-setup` | PUBLIC | gateway | — |
| Payment Sessions (link, deep link, dynamic/static QR) | PUBLIC | gateway + Core | A self-service way to pay one |
| Payment Links (create, list with cursor/limit, get, cancel) | PUBLIC | gateway + Core; cursor/limit → 400 `INVALID_PARAM` (proved live 9/9) | SDK 0.13.0 cannot create/list with a project key (fix unreleased) |
| QR | PUBLIC | session interfaces `DYNAMIC_QR` / `STATIC_QR`, `GET /v1/payment-sessions/{id}/qr`; consumer `POST /v1/qr/pay` | A self-service payer |
| Test payer | PARTIAL | public-api `POST /v1/auth/register` (Sandbox grant 1 000 000 minor), consumer surface only | Project-owned test payers on the developer surface |
| Fictitious funding | PARTIAL | public-api `POST /v1/sandbox/fund` (consumer JWT, 20/day), Core `consumer-wallets/test-credit`, `wallets/:id/sandbox-credit` (internal) | Developer-surface funding with per-project limits; the Sandbox-wide pilot cap |
| Hosted payment page | PUBLIC | pay.banzami.com (apps/pay); Sandbox shows only the app QR / deep link | A Sandbox "pay as a test payer" path |
| Refunds (full, partial, cumulative, idempotent) | PUBLIC + CONSOLE | gateway `POST /v1/refunds`, Console refund; DOCS journeys proved | Nothing beyond a payer |
| Wallet accounts, transfers | PUBLIC | gateway + Core | — |
| Application settlement | PUBLIC | gateway + Core; fee destination requires `kyb_status=APPROVED` **and** APPLICATION/PLATFORM | Automatic classification + pricing; a synthetic Business that passes the fee-destination check in Sandbox only |
| Receipts / public proof | PUBLIC | `GET /v1/public/proofs/{ref}`, banzami.com/r/{ref}; 200 / 404 / 503 | — |
| Webhook endpoints, secret once, rotate, disable/enable | PUBLIC + CONSOLE | gateway (ADR-051/056), developer-api | — |
| Webhook events, deliveries, attempts, replay | PUBLIC + CONSOLE | `GET /v1/webhooks/events`, `…/deliveries`, `POST /v1/webhooks/deliveries/{id}/replay`, Console | — |
| Synthetic test event | ABSENT | — | A non-financial test event, documented apart from the 7 financial events |
| API request logs | CONSOLE | ADR-054, `GET /projects/{id}/logs` (30 days) | Filters; Explorer attribution |
| Workspace Activity vs API logs | CONSOLE | distinct stores and pages | — |
| Realtime payment status | ABSENT | no `text/event-stream` anywhere | Browser-safe, session-scoped status stream |
| API Explorer | ABSENT | docs mark §16 NOT_APPLICABLE | Secret-free broker from the Console session |
| Deterministic scenarios | PARTIAL | API-level outcomes are real and documented (invalid key/scope/param/cursor, idempotency, 429, insufficient funds, refund limits, receipts); rail outcomes (decline, timeout, provider unavailable) do not exist | A documented scenario mechanism for rail outcomes |
| Reset | ABSENT | operator tools only (`retire-synthetic-residue.sh`) | A self-service reset that preserves ledger history |
| Rate limits | PUBLIC | gateway per IP and per key, `429 RATE_LIMITED` + `Retry-After` | Limits for new resources |
| OpenAPI / Postman / SDK | PUBLIC | `docs/developer/openapi`, mirrored on the site; Postman collection; `@banzami/sdk` | Update for every new public contract; npm release needs the owner |
| Financial LIVE | INTERNAL / closed | fail-closed everywhere; `bz_live_` refused | Stays closed |

## Human intervention on the documented journey today

| Step | Who | Evidence |
|---|---|---|
| Approve the Business application | BANZADMIN operator with MFA | ADR-058; DOCS-PROD-001 ceremony 2026-09-13 |
| Classify APPLICATION | BANZADMIN operator | `PATCH …/business-account-type` (first DOA run settled at 0 bps without it) |
| Assign `sandbox-reference` | BANZADMIN operator | `PUT …/pricing-profile` |
| Obtain a payer | Banzami support | Quickstart step 10, Testing "Pay a session" |
| Retire synthetic residue | Owner-run operator tool | `retire-synthetic-residue.sh --apply` |

`PUBLIC_SANDBOX_OPERATOR_APPROVAL_REQUIRED` at baseline: **3** (approve, classify, price) plus support for a payer.

## Structural findings the design must resolve

1. **KYB honesty.** ADR-058 retired the one-click setup because it wrote
   `kyb_status=APPROVED` for a Business nobody reviewed — a second KYB authority.
   A self-service Sandbox Business must be marked as a synthetic test entity,
   never as reviewed KYB, and application-fee eligibility must accept that
   marker only in the Sandbox.
2. **Sandbox-wide cap.** The pilot overlay's aggregate funds cap is a shared
   resource any one developer can exhaust. Public fictitious value needs
   per-Project quotas.
3. **No expiring credentials.** A server-side Explorer needs a short-lived,
   scope-bound credential that cannot be copied into a browser.
4. **One payment implementation.** The consumer payment path lives in
   public-api; a test-payer payment must reuse it rather than duplicate it.
5. **Event catalogue integrity.** A synthetic test event must not enter the
   seven-event financial catalogue or its drift gates as if it were financial.

## What has an equivalent already (for the competitive matrix)

Idempotency with stored 4xx replay; signed webhooks with 5 retries and replay;
event and delivery logs; API request logs with `request_id`; error catalogue of
72 codes; event catalogue with per-field reference; public verifiable receipts;
wallet accounts and double-entry ledger; application settlement with operator
pricing; OpenAPI with route drift gates; SDK with webhook verification; PT/EN
documentation with a Sandbox testing cookbook and a reference implementation.
