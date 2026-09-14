# Developer platform — internal competitive matrix

Version: 1.0

**INTERNAL QUALITY EVIDENCE. Not for publication.** Competitor names do not
appear in Banzami's public documentation, and nothing here supports a public
superiority claim (SANDBOX-SELF-SERVICE-001 §46–48, §71–73, §85).

Research date: 2026-09-14. Banzami column: the deployed Public Sandbox, proved by
the harnesses named (see [SANDBOX_SELF_SERVICE_001_CONFORMANCE.md](SANDBOX_SELF_SERVICE_001_CONFORMANCE.md)).

## Evidence classes

| Class | Meaning |
|---|---|
| **LIVE_VERIFIED** | Read or exercised on the research date from the live public source |
| **RECENT_PUBLIC_SECONDARY** | A recent public copy (archive, index, cache) retrieved by Banzami itself |
| **USER_SUPPLIED_RECENT_PUBLIC_EVIDENCE** | The owner's account of a recent public copy that Banzami could not retrieve itself; labelled as such |
| **UNVERIFIED** | No evidence either way; nothing is inferred from absence |
| **N/A** | Structurally irrelevant to Banzami, with the reason |

Verdicts, Banzami against the benchmark's developer outcome (never its vocabulary):
**BETTER** · **EQUIVALENT** · **GAP** · **N/A**.

## BitPay Angola — evidence

- **Live origin, 2026-09-14:** `developers.bitpay.ao` and `bitpay.ao` answered
  Cloudflare **522** (browser and Cloudflare working, origin host error) on every
  path from 04:30 to 07:37 UTC, confirmed independently by the owner's browser at
  07:15:46 UTC. This is an availability observation for that window only. No
  capability is marked absent because of it.
- **Archives tried, 2026-09-14:** Web Archive CDX (no capture), Common Crawl
  indexes CC-MAIN-2026-34/-30/-25 (no capture), archive.today (404), search
  engines (no indexed page). None could be retrieved from this session.
- **USER_SUPPLIED_RECENT_PUBLIC_EVIDENCE used** (no RECENT_PUBLIC_SECONDARY copy could be retrieved): the owner's summary, given on
  2026-09-14, of a recent publicly indexed copy of `https://developers.bitpay.ao/api`.
  It lists: a Public Sandbox open to all; `POST /v1/sandbox/accounts` returning
  test credentials at once; `sk_test_` / `sk_live_` keys; `Idempotency-Key`;
  Payment Intents; deterministic Sandbox scenarios by test mobile number
  (success, customer rejection, timeout → UNKNOWN → later reconciliation,
  insufficient funds, provider unavailable); refunds; Payment Links; hosted
  checkout; QR; signed webhooks with at-least-once delivery and retries; *Send
  test event*; delivery history (HTTP status, latency, attempts, retries);
  realtime SSE with an initial snapshot and terminal-state behaviour, by a browser
  path `GET /v1/public/payments/{id}/events` without credentials and a server path
  `GET /v1/payment_intents/{id}/events` with the secret key; events; HTTP request
  logs with method, path, status, error code, latency and `request_id`;
  OpenAPI/API documentation and code examples.
  **None of these was verified live by Banzami today.**
- Also LIVE_VERIFIED on 2026-09-14, as Angolan-market context: ProxyPay RPS v2
  documentation (sandbox host, API-key auth, HMAC-SHA-256 callbacks with
  at-least-once delivery, sandbox `POST /payments` to simulate a payment) and the
  AppyPay API page (testing environment, access via commercial contact).

## Product capabilities — Banzami vs BitPay Angola

| Capability | BitPay Angola (class · evidence) | Banzami (LIVE_VERIFIED on the deployed Sandbox) | Verdict |
|---|---|---|---|
| Sandbox self-service | USER_SUPPLIED · open to all | Anyone with a mailbox; no operator (cleanroom 29/29 including the external-rail steps, `PUBLIC_SANDBOX_OPERATOR_INTERVENTIONS=0`) | EQUIVALENT |
| Zero-human onboarding | USER_SUPPLIED · `POST /v1/sandbox/accounts` returns credentials at once | Email code → workspace → project → Sandbox Financial Setup by use case → key. First SDK call 6.1 s after sign-in (automated). Mailbox ownership is required on purpose: the per-account creation limits and the test-value perimeter hang on an identity | EQUIVALENT — immediate and operator-free in both; Banzami adds a verified identity |
| Test credentials | USER_SUPPLIED · `sk_test_` / `sk_live_` | `bz_test_sk_`, scoped, rotatable, revocable; a Sandbox key cannot reach Live and no Live key can be minted (isolation 12–13) | EQUIVALENT |
| Deterministic scenarios | USER_SUPPLIED · test mobile numbers | 29 published scenarios (`GET /v1/sandbox/scenarios`), explicit `simulate` (DECLINED, PROVIDER_UNAVAILABLE, TIMEOUT, DELAYED), real outcomes by doing the real thing; see *Deterministic testing* below | BETTER |
| Success · decline · insufficient funds · provider unavailable | USER_SUPPLIED | PAYMENT_SUCCESS, PAYMENT_DECLINED (402, nothing moves), INSUFFICIENT_FUNDS (422), PROVIDER_UNAVAILABLE (503 + Retry-After) — scenario suite | EQUIVALENT |
| Timeout → unknown → later resolution | USER_SUPPLIED · UNKNOWN then reconciliation | AMBIGUOUS_TIMEOUT (503 `SANDBOX_SIMULATED_TIMEOUT`, money moved, retry with the key reads it) **and** DELAYED_COMPLETION (202 PENDING, completes on its own ~10 s later: session PAID, webhook, realtime, repeat reads 200) — added 2026-09-14 when this review found the second outcome missing | EQUIVALENT |
| Payment orchestration | USER_SUPPLIED · Payment Intents | Payment Sessions: one intent, link + deep link + dynamic QR crediting one account | EQUIVALENT (vocabulary differs, outcome matches) |
| Hosted payment | USER_SUPPLIED · hosted checkout | pay.banzami.com; realtime status turned the page paid 827 ms after another device paid | EQUIVALENT |
| Payment Links | USER_SUPPLIED | Create, list with cursor, get, cancel; paid by a test payer (cleanroom 12) | EQUIVALENT |
| QR | USER_SUPPLIED | Dynamic QR per session, paid cross-device (cleanroom 13) | EQUIVALENT |
| Refunds | USER_SUPPLIED | Full, partial, cumulative, idempotent, over-refund refused, receipt REVERSED (refund suite 8/8) | EQUIVALENT |
| Test payer · fictitious funding | USER_SUPPLIED · test mobile numbers as payers | Project-owned test payers (API, SDK, Console), idempotent fictitious top-ups within per-Project quotas, test value kept among test payers and test Businesses | BETTER |
| Idempotency | USER_SUPPLIED · `Idempotency-Key` | Stored replay, payload-conflict 409, concurrent 409, a pending acknowledgement never cached as the outcome (scenario suite) | EQUIVALENT |
| Webhooks · signing | USER_SUPPLIED · signed | `banza-signature` with timestamp and replay window; the published SDK verifies it (cleanroom 15) | EQUIVALENT |
| Delivery · retries | USER_SUPPLIED · at-least-once, retries | 5 retries, attempts recorded (workbench: 500 then 200) | EQUIVALENT |
| Send test event | USER_SUPPLIED | Synthetic `webhook.test`, signed, never financial, bounded 10/min per endpoint (workbench, isolation 15) | EQUIVALENT |
| Delivery history | USER_SUPPLIED · status, latency, attempts, retries | Per delivery: status, attempts; per attempt: number, outcome, HTTP status or error class, latency, time — API and Console (latency shown in the Console since 2026-09-14) | EQUIVALENT |
| Replay | UNVERIFIED | Replay a failed delivery, same delivery identity; a succeeded real delivery refused (409); test deliveries replayable | BETTER than no evidence; recorded as EQUIVALENT for safety |
| Realtime · snapshot · terminal · reconnect | USER_SUPPLIED · SSE, snapshot, terminal; browser path without credentials, server path with secret key | Header-token SSE, snapshot first, heartbeat 5 s, closes on terminal, fresh snapshot on reconnect; see *Realtime architecture* | BETTER |
| API Explorer | UNVERIFIED | Console broker; no key in the browser; Try in Sandbox from every runnable reference entry (browser acceptance 10/10) | BETTER than no evidence; EQUIVALENT for safety |
| Request logs | USER_SUPPLIED · method, path, status, error code, latency, request_id | Method, path, route, status, **error code** (since 2026-09-14, migration 0143), latency, request_id, time, Project, source API/API_EXPLORER, filters on each; distinct from Workspace Activity (cleanroom 22–23) | EQUIVALENT |
| Per-attempt latency | USER_SUPPLIED · latency in delivery history | `duration_ms` per attempt in the API and the Console (workbench: `#1:500/…ms, #2:200/…ms`) | EQUIVALENT |
| Error code visibility | USER_SUPPLIED · error code in request logs | Error code in each failed log line, linked to the catalogue, filterable (cleanroom 22) | EQUIVALENT |
| RBAC · Activity | UNVERIFIED | Owner/admin/developer/viewer roles; Workspace Activity separate from API logs | EQUIVALENT for safety |
| Event logs | USER_SUPPLIED · events | Events API and Console, per-event deliveries | EQUIVALENT |
| OpenAPI | USER_SUPPLIED | OpenAPI 3, route/doc/error/event drift gates | EQUIVALENT |
| SDK | USER_SUPPLIED · code examples | `@banzami/sdk` (typed, retries with keys, webhook verification, realtime helper), `banzami_client` for Dart/Flutter | BETTER |
| Error model | USER_SUPPLIED · error codes in logs | 100 codes with PT/EN meaning and action, drift-gated to the runtime; bodies survive Cloudflare (502/504 → 503) | BETTER |
| Receipt / proof | UNVERIFIED | Public verifiable receipt per operation, REVERSED on full refund | BETTER than no evidence; EQUIVALENT for safety |
| Settlement | UNVERIFIED | Application settlement with operator pricing: gross = fee + net | EQUIVALENT for safety |
| Wallet model · ledger | N/A for a gateway comparison | Wallet accounts, double-entry ledger, invariants checked on the deployed Sandbox (all zero) | N/A — Banzami differentiator, not a parity item |
| Workspace / Project · Financial Setup | UNVERIFIED | Workspaces, projects, RBAC, Sandbox Financial Setup by use case | EQUIVALENT for safety |
| Console | UNVERIFIED | Keys, webhooks, logs, Explorer, test data, reset | EQUIVALENT for safety |
| Reset / cleanup | UNVERIFIED | Reset keeps history, retires test data, 5 a day | EQUIVALENT for safety |
| Card test numbers | — | Banzami is wallet-native and never takes card data (CLAUDE.md §2.7) | N/A |

`BITPAY_APPLICABLE_PRODUCT_GAPS=0` — every capability in the user-supplied evidence
has an equivalent or stronger Banzami outcome on the deployed Sandbox. Two rows
were gaps during this review and were built before counting: delayed completion
and the error code in request logs (with attempt latency in the Console).

## Realtime architecture

| Property | BitPay browser path (USER_SUPPLIED) | Banzami `GET /v1/realtime/payment-sessions/{id}` (LIVE_VERIFIED) |
|---|---|---|
| Credential | None: the payment id opens the stream | A `bzst_` status token, HMAC-signed, in the `Authorization` header; refused in the URL (400) |
| Single-resource isolation | Anyone holding or guessing an id | Token bound to one session (`sid`); another session's token 403; an unknown id with a valid token 403 — ids cannot be probed |
| Cross-tenant protection | Not scoped to a caller | Token only minted on the owner's own read; another Project's key reads nothing (isolation 2, 8) |
| Expiry | UNVERIFIED | 30 minutes, then 401 `REALTIME_TOKEN_EXPIRED` (expiry run 2/2) |
| Mutation impossibility | UNVERIFIED | GET only; POST/PUT/PATCH/DELETE 405; the token is not an API credential (401) — realtime 17 |
| Secret handling | Server path needs the secret key | The browser never holds a key; the server path is the same token (the SDK helper runs in Node) or webhooks/GET with the key |
| Initial snapshot · terminal · reconnect | Snapshot, terminal behaviour | Snapshot first; closes on PAID/EXPIRED/CANCELLED/FAILED; reconnect starts from a fresh snapshot; a stream opened on a terminal session sends it and closes (realtime 8–14) |
| Abuse bounds | UNVERIFIED | 3 streams/session, 20/client, 120 req/min, a dead stream frees its place within the 5 s heartbeat |

Banzami's design gives a page what it needs and nothing a leaked or guessed id
would: **BETTER** by design, recorded with the evidence above. An unauthenticated
by-id endpoint was not added.

## Deterministic testing

| Criterion | BitPay (USER_SUPPLIED: test mobile numbers) | Banzami |
|---|---|---|
| Discoverability | Numbers listed in documentation | `GET /v1/sandbox/scenarios` (machine-readable), Console Test data, cookbook recipe per scenario, drift-gated |
| Determinism | By number | By explicit `simulate` or by doing the real thing; `simulated: true` marks every simulated outcome |
| Breadth | 5 outcomes listed | 29 scenarios: payments (incl. delayed completion), request errors, idempotency, webhooks (retry, replay, signature), refunds, settlement, receipts, realtime, rate limit, Live fail-closed |
| Ease of use | Enter a number | One field on the payment call, or a select in the Console |
| Safety | UNVERIFIED | No magic values in real flows (`SANDBOX_HIDDEN_TEST_MAGIC=0`); test value stays among test payers and test Businesses |
| Tenant isolation | UNVERIFIED | Test payers per Project, 404 elsewhere (isolation 3–6) |
| Expected results documented | UNVERIFIED | Every scenario has trigger, result and event in PT/EN |
| Automation | UNVERIFIED | Suite of 29 with mutation-proven predicates; SDK typed (`TestPaymentPending`) |
| Resetability | UNVERIFIED | Self-service reset keeping history |

Verdict: **BETTER** — every applicable outcome is present; the mechanism differs.

## Documentation and developer experience — Banzami vs BitPay Angola

| Area | BitPay (class) | Banzami (LIVE_VERIFIED) | Verdict |
|---|---|---|---|
| Quickstart | UNVERIFIED | Runs end to end with no operator (12/12) | EQUIVALENT for safety |
| API reference · code examples | USER_SUPPLIED · API docs and examples | Reference gated against OpenAPI, curl and SDK examples compiled against the registry, Try in Sandbox | EQUIVALENT |
| Testing guide | USER_SUPPLIED · scenario numbers | Cookbook, one recipe per scenario | BETTER |
| Webhooks · realtime · errors · events guides | USER_SUPPLIED | PT/EN guides with SVG diagrams, gated | EQUIVALENT |
| Search | UNVERIFIED | Task-oriented search, gated | EQUIVALENT for safety |
| Reference implementation | UNVERIFIED | DOA tutorial runs end to end (13/13) | EQUIVALENT for safety |
| Mobile · accessibility | UNVERIFIED | Docs sweep 600/0, Console accessibility 41/41, responsive 52/52 | EQUIVALENT for safety |
| PT/EN | UNVERIFIED | Full parity, structure-gated | EQUIVALENT for safety |
| AI-readable docs | UNVERIFIED | `llms.txt`, generated and gated | EQUIVALENT for safety |
| Console | UNVERIFIED | Documented page by page | EQUIVALENT for safety |
| Troubleshooting | UNVERIFIED | Symptom index, error actions | EQUIVALENT for safety |

`BITPAY_APPLICABLE_DOC_DX_GAPS=0`.

## Global benchmarks (LIVE_VERIFIED 2026-09-14) — where they remain stronger

Not BitPay-applicable under §85; recorded so they are not forgotten.

| Capability | Benchmark | Banzami today |
|---|---|---|
| CLI with local webhook forwarding and event triggering | Stripe CLI (`listen`, `trigger`) | Console/API test events, delivery history and replay; no CLI |
| Several isolated sandboxes per account; anonymous sandbox from a CLI | Stripe | One Sandbox environment; isolation per Workspace/Project |
| Agent skills / MCP for integration | Stripe | `llms.txt`; no agent tooling |

## Banzami differentiators preserved (§48)

Workspace, Project, Financial Setup, Wallet Accounts, double-entry ledger, the
financial authority model, application settlement, operator-governed pricing,
public verifiable receipts, Developer Console with RBAC, Workspace Activity
distinct from API logs, the DOA reference implementation, PT/EN parity, and the
OpenAPI, event and error drift gates with documentation contract tests.

## Architectural taxonomy (WALLET-NATIVE-001 §53–55)

Providers are not one category, and comparing them as if they were produces
wrong conclusions. Three families, each benchmarked on what it is built to do:

| Family | What it is built around | Benchmark it for | Examples (evidence class) |
|---|---|---|---|
| **Gateway / orchestration centric** | Routing merchant payments to external rails; the provider's state is the payment's state | Developer experience, Sandbox, API quality, external-rail orchestration, merchant integration | BitPay Angola (USER_SUPPLIED_RECENT_PUBLIC_EVIDENCE for its developer portal — see above) |
| **Wallet + multirail payment platform** | A consumer wallet with merchant acceptance and several rails | Wallet adoption, PSP operation, merchant ecosystem, rail interoperability | PayPay (UNVERIFIED — see the research rule below) |
| **Wallet-native financial network** | Value represented inside the network moves between participants through the operator's core and ledger; rails at the boundary | Internal network movement, ledger correctness, financial addressing, rail decoupling, programmability, Sandbox DX, receipts, realtime, webhooks, settlements | Banzami (ADR-061; proved in the deployed Sandbox) |

**BitPay** is not Banzami's architectural target. It remains a useful benchmark for
developer experience, Sandbox, API quality and gateway orchestration, and the
matrices above compare those outcomes only.

**PayPay research rule.** No claim is made here that PayPay is or is not fully
wallet-native. The question that matters — to what extent value moves natively
inside the PayPay network without an external rail executing each transaction —
has not been researched from reliable evidence, so the classification above is
UNVERIFIED and nothing is inferred from it. Banzami's architecture is not changed
to differ from, or resemble, any provider.

### Banzami on its own benchmark

| Capability | Banzami (Sandbox) | Evidence |
|---|---|---|
| Internal movement with the external rail down | Wallet payment and P2P complete | `external_rail_tests.rs`; scenario `EXTERNAL_RAIL_DOWN_WALLET_PAYMENT` |
| Rail-dependent operation with the rail down | Fails closed, nothing moved | scenario `EXTERNAL_RAIL_DOWN_FAILS_CLOSED`; payout and acquiring tests |
| One financial writer | Enforced by the database | migration 0144; `financial_writer_guard.rs` |
| Ledger correctness | Balanced postings, immutable, book sums to zero | `ledger-reconciliation.sh` |
| Financial addressing | `@banza` resolves Banzami participants | handle registry; P2P by handle |
| Which rail a payment used, visible to the developer | `rail: WALLET \| EXTERNAL_SIMULATED` | OpenAPI `TestPayment` |
