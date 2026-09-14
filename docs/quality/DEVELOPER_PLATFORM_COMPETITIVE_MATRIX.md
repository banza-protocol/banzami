# Developer platform — internal competitive matrix

Version: 1.0

**INTERNAL QUALITY EVIDENCE. Not for publication.** Competitor names do not
appear in Banzami's public documentation, and nothing here supports a public
superiority claim (SANDBOX-SELF-SERVICE-001 §46–48, §71–73, §85).

Date of research: 2026-09-14. Banzami column: the deployed Public Sandbox at
commit `e5739cd9`, proved by the harnesses named. Legend: **PASS** Banzami has
it and it is proved · **EQUIVALENT** same developer outcome by a different,
Banzami-native mechanism · **BETTER** a stronger Banzami-native outcome ·
**N/A** structurally irrelevant (reason given) · **GAP** an applicable
capability where the benchmark is objectively better.

## Evidence

| Benchmark | Public evidence used | What could be verified |
|---|---|---|
| BitPay Angola | `bitpay.ao` and `developers.bitpay.ao` (Cloudflare-fronted; nameservers `apollo`/`carrera.ns.cloudflare.com`) | **Nothing.** Every host and path answered `HTTP 522` (origin unreachable) on 2026-09-14 04:30 UTC and on retries; no Web Archive capture exists; no search index carries its developer pages. See *Evidence limitation* below. |
| Angolan gateway reference (same market, same rails) | ProxyPay developer docs (`developer.proxypay.co.ao`, RPS v2), AppyPay API page (`appypay.co.ao/api-info`) | Sandbox host, API-key auth, reference payments, HMAC-SHA-256 callbacks with at-least-once delivery, a sandbox `POST /payments` to simulate a payment (ProxyPay); a testing environment and Stoplight docs, access via commercial contact (AppyPay) |
| Stripe | docs.stripe.com/sandboxes, /testing | Multiple self-service sandboxes, anonymous sandbox creation from the CLI, test cards, test helpers, CLI event triggering and local webhook forwarding, Workbench |
| Adyen | docs.adyen.com/development-resources/testing | Test Customer Area credentials, test cards and result codes, webhook testing, API Explorer |
| Checkout.com | checkout.com/docs/developer-resources/testing | Self-service test account, test cards with simulated CVV/AVS/fraud/dispute/payout outcomes, API reference |
| Plaid | plaid.com/docs/sandbox | Self-service sandbox keys, test users, `/sandbox/item/fire_webhook`, `/sandbox/item/reset_login`, product simulation endpoints |
| Twilio | twilio.com/docs/iam/test-credentials | Test credentials that never charge or touch real resources; magic numbers producing success/failure |

### Evidence limitation — BitPay Angola

The owner's brief names capabilities of BitPay Angola indirectly (self-service
Sandbox, test phone numbers as deterministic personas). Its developer portal
could not be read on the research date. The BitPay Angola column below
therefore records, for each capability, the **Angolan-market reference that
could be read** (ProxyPay/AppyPay) together with the capability named in the
brief, and Banzami is compared to that. No row is marked PASS/BETTER on the
basis of a BitPay behaviour that was not observed, and no row assumes BitPay
lacks something. The matrix must be re-run against `developers.bitpay.ao` when
it answers; a capability found there that is applicable and objectively better
reopens this document as a GAP.

## Product capabilities — Banzami vs the Angolan reference (BitPay Angola column)

| Capability | BitPay Angola / Angolan reference (observed) | Banzami (proved) | Verdict |
|---|---|---|---|
| Zero-human Sandbox signup | ProxyPay: sandbox keys "through their ProxyPay account"; AppyPay: via commercial contact | Email code → workspace → project → Financial Setup by use case → key; no operator (`public-sandbox-cleanroom.mjs` 26/26, `PUBLIC_SANDBOX_OPERATOR_INTERVENTIONS=0`) | BETTER |
| Time to first call / first payment | Not published | Automated cleanroom: first SDK call 6.1 s (including `npm install`), first completed payment 7.1 s after sign-in; human time not measured | PASS |
| Test credentials | Sandbox API key | `bz_test_sk_` keys, scoped, rotatable, environment-bound; cannot reach Live (`SANDBOX_CREDENTIAL_CAN_ACCESS_LIVE=0`) | EQUIVALENT |
| Test payer / test data | ProxyPay: simulate a payment event; brief: test phone numbers | Project-owned test payers with fictitious funding, quotas and a value perimeter; pay by link or QR through the real consumer path | BETTER |
| Deterministic scenarios | Brief: reserved test phone numbers | 28 published scenarios (`GET /v1/sandbox/scenarios`), explicit `simulate` for rail outcomes, no magic amounts or numbers (`SANDBOX_HIDDEN_TEST_MAGIC=0`) | EQUIVALENT (Banzami-native: explicit, not reserved identifiers) |
| Payment orchestration | Reference / mobile-number payment requests | Payment Sessions: one intent with link, deep link and dynamic QR crediting one account | PASS |
| Payment Links | Not observed | Create, list with cursor, get, cancel; paid by test payer (cleanroom step 12) | PASS |
| QR | Not observed | Dynamic QR per session, paid cross-device (cleanroom step 13; pay page realtime 827 ms) | PASS |
| Refunds | Not observed | Full, partial, cumulative, idempotent, over-refund refused (cleanroom 19–20) | PASS |
| Idempotency | Not observed | `Idempotency-Key` with stored replay; SDK keeps the key across retries | PASS |
| Webhooks: signing, retry | HMAC-SHA-256 `X-Signature`; at-least-once | `banza-signature` (timestamped HMAC, replay window), 5 retries, SDK verification | EQUIVALENT |
| Webhook replay | Not observed | Replay per delivery, same delivery identity; test deliveries replayable | BETTER |
| Webhook test events | ProxyPay: sandbox simulated payment triggers a callback | Synthetic `webhook.test` to one endpoint, signed, never financial, bounded | EQUIVALENT |
| Event and delivery logs | Not observed | Events, deliveries, attempts with status codes (API and Console) | BETTER |
| API request logs | Not observed | Per-Project logs with `request_id`, source `API` / `API_EXPLORER`, distinct from Workspace Activity | BETTER |
| Real-time payment status (SSE) | Not observed | Header-token SSE, snapshot/status/heartbeat/terminal, reconnect, CORS, limits; p50 901 ms through Cloudflare | BETTER |
| OpenAPI | Not observed (docs per API) | OpenAPI 3 (41 operations), route/doc drift gates | PASS |
| SDK | Code samples (HTTP, Shell, PHP, Java, C#) | `@banzami/sdk` on npm (0.13.0 published; 0.14.0 prepared), `banzami_client` for Dart/Flutter | BETTER |
| API Explorer | AppyPay: Stoplight-hosted docs | Console broker: no key in the browser, one-scope 60 s key, allowlist from OpenAPI, logged | EQUIVALENT (Banzami-native, safer for a financial API) |
| Hosted payment page | Not observed | pay.banzami.com with realtime status | PASS |
| Error catalogue | Status codes, validation messages | 100 codes, PT/EN meaning and action, drift-gated to the runtime | BETTER |
| Event catalogue | Payment notification | Seven financial events plus the synthetic test event, per-field reference, drift-gated | BETTER |
| Receipts / proofs | Not observed | Public verifiable receipt per operation (`/v1/public/proofs/{ref}`, banzami.com/r/{ref}) | BETTER |
| Settlements | Not observed | Application settlement with operator pricing: gross = fee + net (cleanroom 21) | BETTER |
| Wallet / ledger model | Not applicable to a reference gateway | Wallet accounts, double-entry ledger, invariants checked on the deployed Sandbox | BETTER |
| Self-service reset | Not observed | Reset keeps ledger history, retires test data, 5 a day | BETTER |
| Card test numbers | — | Banzami is wallet-native and never takes card data (CLAUDE.md §2.7) | N/A |

`BITPAY_APPLICABLE_PRODUCT_GAPS=0` — against every capability observable in the
Angolan reference and named in the brief, subject to the evidence limitation.

## Documentation and developer experience

| Area | Angolan reference (observed) | Banzami (proved) | Verdict |
|---|---|---|---|
| Onboarding / Quickstart | Per-API introductions | Quickstart that runs end to end with no operator (`DOC_QUICKSTART_E2E` 12/12) | BETTER |
| Testing | Sandbox host + simulate endpoint | Testing cookbook: one recipe per scenario, drift-gated to the scenario catalogue | BETTER |
| API reference | Per-API reference pages | Reference generated from and gated against OpenAPI; examples per endpoint; Postman generated | PASS |
| API Explorer | Stoplight (AppyPay) | Console Explorer (above) | EQUIVALENT |
| Errors / events / webhooks / realtime guides | Callback section | Dedicated guides, PT/EN, SVG diagrams | BETTER |
| SDK docs | Code samples | SDK README and guide examples compiled against the registry | BETTER |
| Console | Merchant back office | Developers Console: keys, webhooks, logs, Explorer, test data, reset | BETTER |
| Search | Not observed | Docs search with task aliases, gated (`check-docs-search`) | PASS |
| Reference implementation | Not observed | DOA tutorial runs end to end (13/13), no special tenant path | BETTER |
| Mobile / accessibility | Not observed | Responsive and accessibility sweeps on docs and Console | PASS |
| AI-readable docs | Not observed | `llms.txt`, generated and gated | PASS |
| PT/EN | Portuguese/English varies by provider | Full PT/EN parity, structure-gated | PASS |
| Troubleshooting | Not observed | Symptom index and error actions | PASS |

`BITPAY_APPLICABLE_DOC_DX_GAPS=0` — same evidence limitation.

## Global benchmarks — where they remain stronger (informational)

These are not BitPay-applicable gaps under §85, and are recorded so they are
not forgotten:

| Capability | Benchmark | Banzami today |
|---|---|---|
| CLI with local webhook forwarding and event triggering | Stripe CLI (`listen`, `trigger`) | Console/API test events, delivery logs and replay; no CLI |
| Several isolated sandboxes per account, anonymous sandbox from a CLI | Stripe | One Sandbox environment; isolation per Workspace/Project |
| Time simulation (billing clocks) | Stripe test clocks | No recurring products that need it — N/A today |
| Agent skills / MCP for integration | Stripe | `llms.txt`; no agent tooling |

## Banzami differentiators preserved (§48)

Workspace, Project, Financial Setup, Wallet Accounts, double-entry ledger, the
financial authority model, application settlement, operator-governed pricing,
public verifiable receipts, Developer Console with RBAC, Workspace Activity
distinct from API logs, the DOA reference implementation, PT/EN parity, and the
OpenAPI, event and error drift gates with documentation contract tests — none
was weakened; each is exercised by the harnesses above.
