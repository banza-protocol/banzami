# Developer documentation — claim-by-claim audit

**Scope** developers.banzami.com/docs (Portuguese and English), the resource
reference, and the developer landing page banzami.com/developers.
**Spec** [DOCS_PROD_001_SPEC.md](DOCS_PROD_001_SPEC.md) §4, §48.
**Audited** 2026-09-13. Version 1.0.

## What "audited" means here

Every list item, paragraph, callout, table row and reference note on the
documentation pages is a *claim* (`tools/docs/claims.mjs` extracts them). Each
claim was read against the product and recorded in
[developer-documentation-claims.json](developer-documentation-claims.json) with
the class of evidence that holds it true and where that evidence lives:

| Class | Meaning | Claims |
|---|---|---|
| GATE | A CI check fails if the claim becomes false — error catalogue, OpenAPI/route drift, SDK compilation, event catalogue, artifacts | 140 |
| SOURCE | Read against the named source files during the audit | 688 |
| POLICY | Guidance to the reader (what to never do), not a product statement | 60 |
| HISTORY | A dated changelog entry, checked against git history | 20 |
| **Total** | Portuguese and English, the same count on every page | **908** |

RUNTIME is reserved: Get started claims move from SOURCE to RUNTIME only when
`tools/e2e/docs/quickstart-e2e.mjs` completes all twelve steps on the deployed
Sandbox, and the DOA tutorial claims when `tools/e2e/docs/doa-tutorial-e2e.mjs`
does. Both are waiting on the operator review of their fixture Businesses —
a human decision the harnesses do not simulate.

The ledger is keyed by a hash of each claim's text. Rewriting a sentence makes
a claim the ledger does not know, and `tools/check-docs-claims-ledger.mjs` fails
with `UNCLASSIFIED_CLAIMS` until someone reads it again
(`node tools/docs/audit-claims.mjs --write` after reading the change).
Mutation-checked: altering one Console sentence produced `UNCLASSIFIED_CLAIMS=1`
and `STALE_LEDGER_ENTRIES=1`.

```
DOCS_CLAIMS_TOTAL=908
UNCLASSIFIED_CLAIMS=0
STALE_LEDGER_ENTRIES=0
LEDGER_PT_EN_DRIFT=0
DEVELOPER_DOCUMENTATION_AUDIT_COMPLETE=PASS
```

## Claims that were false, and what they say now

Found by reading the claims against the source, by the gates, or by following
the tutorials as a stranger would. Every one is corrected in both languages.

| Where | It said | The product | Evidence |
|---|---|---|---|
| Error tables (PT/EN) | 403 FORBIDDEN = "insufficient scope or project without an active binding" | Scope is `403 INSUFFICIENT_SCOPE`; no financial setup is `403 PAYMENTS_UNAVAILABLE` | `handler/payment_authz.go`, `webhooks.go resolveWebhookAuthority` |
| Error tables, reference, quickstart | `409 CONFLICT`, `422 VALIDATION_ERROR` | Neither is returned to a developer key; `409 IDEMPOTENCY_CONFLICT` / `IDEMPOTENCY_KEY_REUSED`, `400 MISSING_FIELD` / `INVALID_AMOUNT` / `BAD_REQUEST` | `tools/check-docs-error-catalogue.mjs` |
| Reference, settlement | `403 FORBIDDEN` when the source account belongs to another owner | `404 NOT_FOUND`, deliberately indistinguishable | `application_settlements.go CreateBusiness` |
| Reference, transfers | `422 UNPROCESSABLE` | `422 INSUFFICIENT_FUNDS`, `ACCOUNTS_NOT_SAME_WALLET`, `CURRENCY_MISMATCH` | `core/api/src/routes/wallet_account_transfers.rs` |
| Landing page | `invalid_api_key`, `rate_limit_exceeded`, `payment_not_found`… | Not codes; replaced with real ones | error catalogue |
| Landing page code | `client.payments.create({ amount, recipient })`, `payments.createQr`, `transfers.create`, `sandbox.payments.confirm`, `webhooks.verify` | None exists; `recipient` is refused (`PAYEE_NOT_ALLOWED`); amounts were not minor units | `tools/check-docs-code-examples.mjs` now compiles the landing samples |
| Landing page | A live environment with `bz_live_sk_`, `whsec_live_`, `api.banzami.com`, `BANZAMI_MERCHANT_ID` | Financial LIVE does not exist; a project key never names a merchant or wallet | `middleware/developer_auth.go` |
| Landing page | Payment states `pending_confirmation`, `confirmed`, `refunded` | Sessions are `ACTIVE` → `PAID` (or `CANCELLED`) | `db/migrations/0085_payment_sessions.sql`, `routes/payment_sessions.rs` |
| Landing page | Webhook delivery to a public endpoint is simulated; no Console | Delivery is real; the Console is operational | earlier programme evidence; Console journey |
| Landing page | Legacy keys without `_sk_` keep working | The developer surface accepts `bz_test_sk_` / `bz_test_pk_` only | `DeveloperKeyPrefixes` |
| Guides, webhooks | Up to 5 attempts, backoff 1 min → 5 min → 30 min → 2 h → **8 h** | 5 attempts = 1 + four waits; the 8 h wait never happens | `postgres_webhooks.go attemptDelivery` |
| Console, webhooks | Disabling "stops deliveries"; re-enabling resumes | Disabling stops queueing new events; events emitted meanwhile are never delivered to it | fan-out filters `ep.active = true` |
| SDK checklist | "a validation 422" | Validation errors are 400 | error catalogue |
| Trust | "The public surface is the OpenAPI document; anything else answers 404" | Merchant, consumer and operator routes exist and refuse a key with 401/403 | `server/server.go`; `check-openapi-route-drift.mjs` |
| Artifacts | "no SDK package published" | `@banzami/sdk` and `banzami_client` are published | `sdk-first-manifest.json` |
| SDK table, landing | PHP package `banzami/sdk` | `banzami/sdk-php` | `sdk/php/composer.json` |
| DOA tutorial | Settlement without `feeDestinationBanzaName` | Pricing with a fee returns `422 FEE_DESTINATION_REQUIRED` without it | `routes/application_settlements.rs map_err` |
| DOA tutorial | `-10000000 + 200000 + 9800000 = 0` under a code block computing `-100000 + 2000 + 98000` | The code block is right | the page itself |
| DOA tutorial | Nothing on where the donor's receipt comes from | Banzami issues it; `GET /v1/public/proofs/{ref}` verifies it | `service/proof.go` |
| Get started | Payment-first quickstart with no financial setup | Without it, `403 PAYMENTS_UNAVAILABLE` | quickstart harness |
| Illustrations | Terminal-art diagrams; a text-chip flow with arrow characters | SVG components | `tools/check-docs-illustrations.mjs` |
| PT/EN | English lacked capability cards, the DOA summary, "Where the money lands", key prefixes, three callouts; Portuguese lacked verify-before-parse | Same elements, same order, every page | `tools/check-docs-pt-en-structure.mjs` |
| Console | Leaving a workspace, transferring ownership, key names, Admin limits | Documented from `service.go` role rules | `canAssign`, `canModifyTarget`, `LeaveWorkspace` |
| Changelog | Stopped in July 2026 | Dated September entries from git history | `git log` |

## The gates that keep it true

| Gate | What would have to become false for it to fail |
|---|---|
| `check-docs-error-catalogue.mjs` (+ selftest, 13 mutations) | a reachable code undocumented; a documented code unreachable; a route's reference naming a code that route cannot send; an unclassified gateway code; wrong HTTP status; PT/EN drift; internal detail in catalogue text |
| `check-docs-code-examples.mjs` | any TypeScript sample on the docs or landing page misusing `@banzami/sdk` as installed from npm |
| `check-docs-pt-en-structure.mjs` | a section, example, callout or illustration present in one language only |
| `check-docs-coverage.mjs` | a *_COMPLETE item listed by the spec and not documented in both languages |
| `check-docs-claims-ledger.mjs` | a claim on the page that nobody has audited |
| `check-openapi-route-drift.mjs`, `check-docs-drift.mjs` | reachable routes, OpenAPI and reference disagreeing |
| `check-webhook-event-catalogue.mjs` | emitted and documented events disagreeing |
| `check-docs-illustrations.mjs` | a diagram drawn with characters |
| `tools/e2e/docs/doa-tutorial-e2e.mjs contract` (+ selftest, 24 mutations) | the DOA tutorial omitting a step, naming a nonexistent method, the wrong field, event or scope |
