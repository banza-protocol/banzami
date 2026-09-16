# Banzami Sandbox

## Overview

The **Public Sandbox** is Banzami's self-service developer environment. It is
**available now**, self-service (no Banzami-operator approval for normal developer
onboarding), and uses **fictitious value** — no real Kwanza moves. It models the
same wallet-native, ledger-native architecture as Financial Live.

**Financial Live is not available.** It is fail-closed pending regulatory,
contractual, operational and external-rail readiness: `bz_live_` keys are refused
and no Live key can be issued from the Sandbox.

| | **Sandbox** | **Financial Live** |
|---|---|---|
| Status | **Available** (fictitious value) | **Not available** — fail-closed |
| API key prefix | `bz_test_…` | `bz_live_…` (cannot be issued yet) |
| Base URL | `https://sandbox-api.banzami.com` | `https://api.banzami.com` |
| Developer Console | `https://developers.banzami.com` | `https://developers.banzami.com` |
| Hosted Checkout | `https://pay.banzami.com` | `https://pay.banzami.com` |
| Money | Virtual — no real funds | Real Angolan Kwanza |
| Database / Redis / Webhooks | Fully isolated | Fully isolated |

Sandbox and Live data **never mix**. A `bz_test_` key cannot access Live records,
and Live is not enabled. Isolation is enforced at the API-gateway middleware layer
via the environment bound to each key. See [ADR-060 (self-service Public Sandbox)](../adr/ADR-060-self-service-public-sandbox.md),
[ADR-025 (platform-mode environment router)](../adr/ADR-025-platform-mode-environment-router.md)
and [ADR-061 (wallet-native, rail-decoupled)](../adr/ADR-061-wallet-native-rail-decoupled-financial-network.md).

> The merchant Dashboard app was retired on 2026-09-12 (CAP-APP-002);
> `dashboard.banzami.com` does not resolve. Developer work happens in the
> **Developer Console** at `developers.banzami.com`.

---

## Getting started

1. Sign in to the **Developer Console** (`developers.banzami.com`) and create a
   **Workspace** and a **Project**. This is self-service — no operator approval.
2. Issue a Sandbox **Project key** (`bz_test_…`) in the Console. The secret is
   shown **once**; store it securely. Publishable client keys are read-only.
3. Call the API with the key directly through an official **SDK** (SDK-first —
   direct handcrafted HTTP is not the recommended path).

The **authoritative, machine-readable** Sandbox API contract is the OpenAPI
document — treat it (and the public docs) as the integration truth:

- OpenAPI: [`docs/developer/openapi/banzami-sandbox.openapi.json`](../developer/openapi/banzami-sandbox.openapi.json)
- Public docs: [developers.banzami.com/docs](https://developers.banzami.com/docs)

---

## The three Sandbox testing surfaces (kept distinct)

| Surface | What it is |
|---------|------------|
| **App Banzami Web** — `app.banzami.com` | Authenticated **Consumer** testing: the real Consumer UI (one Flutter app across Web + iOS + Android). Register with a `@banza` and a required declared full name; **no consumer KYC**. See [App Banzami clients](../architecture/APP_BANZAMI_CLIENTS.md). |
| **Hosted Checkout** — `pay.banzami.com` | The payer-facing hosted payment experience (`pay.banzami.com/pay/{slug}`). This is **not** App Banzami. See [ADR-052](../adr/ADR-052-one-hosted-payer-surface.md). |
| **Test Payer** | A deterministic Sandbox scenario tool driven via the API — **not** the real Consumer UX. A test payer pays your own Payment Sessions / Payment Links as a wallet payment inside Banzami. |

### Simulating a payment

A payment link or session is marked paid only by a **real payment**. In the
Sandbox, use a **Test Payer** (create one, fund it, then pay your link/session):

```bash
# 1. Create a test payer (fictitious opening balance)
curl -X POST https://sandbox-api.banzami.com/v1/sandbox/test-payers \
  -H "Authorization: Bearer bz_test_..." -H "Content-Type: application/json" -d '{}'

# 2. Pay your own payment link as that test payer — value moves test-payer wallet
#    → your Business wallet, the link becomes USED, and payment_link.paid fires.
curl -X POST https://sandbox-api.banzami.com/v1/sandbox/test-payers/{test_payer_id}/payments \
  -H "Authorization: Bearer bz_test_..." -H "Content-Type: application/json" \
  -d '{"payment_link_id": "{link_id}"}'
```

Deterministic external-rail outcomes (for rail-dependent operations only) are
requested explicitly via `simulate` (`DECLINED`, `PROVIDER_UNAVAILABLE`, `TIMEOUT`,
`DELAYED`) and via `GET /v1/sandbox/scenarios` / `PUT /v1/sandbox/external-rail`.
`POST /v1/payment-links/{id}/mark-used` is **retired** (410 `ROUTE_RETIRED`); to
close an unpaid link use `DELETE /v1/payment-links/{id}`.

---

## SDK integration

Use an official Banzami SDK and point it at the Sandbox environment with a
`bz_test_` key. Server SDKs (TypeScript, Python, PHP, Go) hold the secret key;
client SDKs (Flutter `banzami_client`, browser) use publishable, read-only keys
only — **secret keys never live in browser or mobile client code**. See
[`sdk/`](../../sdk/) and each SDK's README for current, verified snippets.

---

## Webhooks

Register a Sandbox webhook endpoint in the Console; the secret is returned once.
Verify every delivery with the signature header (`banza-signature`) using the
official SDK webhook verifier before trusting the payload — see
[webhook signature spec](../standards/webhook-signature-spec.md). Sandbox and Live
webhooks are isolated.

---

## Wallet-native model

Banzami is **wallet-native and rail-decoupled** (not rail-free): value moves
natively between Banzami wallets through the Core and ledger; external rails are
interoperability boundaries for funding, withdrawal and external settlement, and
rail-dependent operations fail closed when their rail is down. Payers are **never**
asked for card numbers, CVV or expiry — there is no card-entry flow. See
[wallet-native terminology](../architecture/WALLET_NATIVE_TERMINOLOGY.md).

---

## Local development

```bash
make dev-up        # start local infrastructure (PostgreSQL, Redis)
make db-migrate    # run database migrations
make core-run      # run the Rust financial core
make gateway-run   # run the API gateway
```

Local dev credentials in examples are placeholders for a local `docker-compose`
default and are never real secrets.

---

## Security guarantees

- Environment isolation: a `bz_test_` key can never touch Live; Live is fail-closed.
- Only Banzami **Core** writes canonical financial state; every posting is
  double-entry and atomic; balances are derived from the ledger, never stored.
- Client-supplied identifiers create no financial authority.
- Secret keys are server-side only; publishable keys are read-only.

---

## Authoritative sources

- API contract: [`docs/developer/openapi/banzami-sandbox.openapi.json`](../developer/openapi/banzami-sandbox.openapi.json)
- Public developer docs: [developers.banzami.com/docs](https://developers.banzami.com/docs)
- Self-service conformance: [`docs/quality/SANDBOX_SELF_SERVICE_001_CONFORMANCE.md`](../quality/SANDBOX_SELF_SERVICE_001_CONFORMANCE.md)
- Sandbox vs Live topology: [`docs/sandbox/sandbox-vs-production.md`](sandbox-vs-production.md)
