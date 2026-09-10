# DOA — reading its Project's financial readiness

**Version:** 1.0 · **Decision:** [ADR-057](../../adr/ADR-057-project-financial-readiness.md) ·
**SDK:** `@banzami/sdk` 0.12.0

DOA integrates as an ordinary Developer Platform Project. Nothing below is
specific to DOA: it is the contract every Project reads.

## Endpoint

```
GET https://sandbox-api.banzami.com/v1/financial-setup
Authorization: Bearer <the Project's secret key>
```

- **Authority:** the Project key. Nothing in the request names a Project, an
  owner or an account; there is nothing to send.
- **Scope:** `identity:read` — the same scope `GET /v1/me` needs.
- **Optional query:** `fee_destination=@name` evaluates that @banza as the fee
  destination instead of the Project's own. Omit it to evaluate the Project's
  own financial identity (what DOA names as `fee_destination_banza_name`).

## SDK

```ts
import { BanzamiClient, type FinancialSetup } from '@banzami/sdk';

const banzami = new BanzamiClient({ apiKey: process.env.BANZAMI_API_KEY! });

const me = await banzami.me();
// me.project = { id, name, ref } — id is the Project's own id (as in the Console)

const setup: FinancialSetup = await banzami.getFinancialSetup();
```

`getBusinessMe()` is removed in 0.12.0. `me().project` is now an object; read
`me().project.ref` where the slug string was read, `me().project.id` for the
stable identifier.

## Response

```json
{
  "environment": "SANDBOX",
  "project": { "id": "<the Project's own id>", "name": "Doa-Sandbox", "ref": "doa-sandbox" },
  "financial_setup": { "state": "SEALED", "configured": true, "sealed": true },
  "financial_identity": { "handle": "@doa" },
  "kyb": { "status": "APPROVED" },
  "wallet": { "status": "ACTIVE", "ready": true, "currency": "AOA" },
  "pricing": { "profile": "sandbox-reference", "settlement_bps": 200, "payout_bps": 75 },
  "fee_destination": {
    "handle": "@doa", "required": true, "resolved": true, "owned_by_project": true,
    "kyb_approved": true, "wallet_active": true, "type_allowed": true,
    "application_account_ready": true, "eligible": true, "blocker": null
  },
  "settlement": { "ready": true, "blockers": [], "warnings": [] }
}
```

No merchant, owner, binding, wallet, account or rule id appears anywhere in it.

## Semantics

| Field | Meaning |
|---|---|
| `financial_setup.state` | `UNCONFIGURED` (no financial owner yet) · `READY` (configured) · `SEALED` (configured and fixed — a payer-facing artifact was issued, ADR-055) |
| `pricing` | Assigned by Banzami. DOA never sends a rate; a settlement request carrying `application_fee_bps` (or any pricing field) is refused with 400 `PRICING_FIELD_NOT_ACCEPTED`. |
| `fee_destination.required` | Whether the assigned pricing charges a fee at all. When `false`, the destination is reported and blocks nothing. |
| `fee_destination.type_allowed` | The account is classified by Banzami (an operator decision) as one that may receive an application fee. |
| `fee_destination.application_account_ready` | The fee is credited to the destination's own account (ADR-028 requires no separate application account); `true` when that account can receive. |
| `settlement.ready` | `true` exactly when every deterministic prerequisite settlement checks passes — computed by the same code that settles. |
| `settlement.blockers[]` | Each is the refusal a settlement would return. Treat an unknown code as blocking. |
| `settlement.warnings[]` | Advisory only (`WEBHOOK_ENDPOINT_MISSING`). |

Blocker codes: `FINANCIAL_SETUP_NOT_CONFIGURED`, `WALLET_MISSING`,
`PRICING_NOT_CONFIGURED`, `PRICING_CONFIGURATION_ERROR`,
`FEE_DESTINATION_NOT_FOUND`, `FEE_DESTINATION_NOT_OWNED`,
`FEE_DESTINATION_NOT_BUSINESS_ACCOUNT`, `FEE_DESTINATION_NOT_ACTIVE`,
`FEE_DESTINATION_KYB_NOT_APPROVED`, `FEE_DESTINATION_WALLET_UNAVAILABLE`,
`FEE_DESTINATION_TYPE_NOT_ALLOWED`.

What readiness cannot know in advance belongs to each settlement: the balance
of the particular campaign account, and the beneficiary a request names.

The response is computed on each request; there is no cached `checked_at`. Stamp
the time DOA read it on DOA's side if it displays one.

## Errors

| Status | Code | Meaning | DOA should |
|---|---|---|---|
| 200 | — | including an unconfigured Project (a state, not an error) | render it |
| 401 | `UNAUTHORIZED` | missing, invalid, revoked or `bz_live_` key | treat as integration misconfigured |
| 403 | `INSUFFICIENT_SCOPE` | key lacks `identity:read` | issue a key with the scope |
| 409 | `FINANCIAL_SETUP_CONFLICT` | the Project's setup names an owner Banzami cannot evaluate | contact Banzami; not fixable by DOA |
| 503 | `SERVICE_UNAVAILABLE` | could not be evaluated right now — never missing configuration | show "temporarily unavailable", retry |

`GET /v1/integration` refuses a Project key with 403 `USE_FINANCIAL_SETUP`.

## DOA's change

`getBanzamiIntegrationStatus()` adds one `getFinancialSetup()` call after `me()`;
on success it sets `readinessKnown = true` and maps the fields above. A 503 maps
to `BANZAMI_TEMPORARILY_UNAVAILABLE`, never to "not found" or "not configured".
