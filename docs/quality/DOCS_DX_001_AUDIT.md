# DOCS-DX-001 — developer experience audit

Version: 1.0

The developer documentation at developers.banzami.com/docs, assessed journey by
journey against one principle: **less doubt per minute**. This is internal UX
evidence, not a scorecard; DOCS-PROD-001 remains the canonical documentation
specification and is unchanged.

## Start state

```
START_BANZAMI_SHA=36711d6a
START_DOA_SHA=2612573
START_DOCS_DEPLOYED_SHA=c74bf9e2
PUBLIC_API=v1
SDK=@banzami/sdk 0.13.0
```

## Statuses

`EXCELLENT` — a developer completes the task with no doubt and no detour.
`GOOD` — completes it with no doubt; a wait or constraint outside the
documentation remains, and the documentation states it plainly.
`NEEDS_IMPROVEMENT` — doubt or a detour the documentation could remove.
`BLOCKING` — the task cannot be completed from the documentation.

A status is not upgraded because a test passes. Where a journey is GOOD rather
than EXCELLENT the reason is named, and it is a product constraint, not a
documentation defect.

```
DOCS_DX_JOURNEYS=20
DOCS_DX_EXCELLENT=14
DOCS_DX_GOOD=6
DOCS_DX_NEEDS_IMPROVEMENT=0
DOCS_DX_BLOCKING=0
```

## Benchmark principles

Principles drawn from the public developer documentation of Stripe, Adyen,
Checkout.com, Plaid and Twilio, as general patterns. No page, wording or layout
was copied, and nothing here compares Banzami with them publicly. Each row names
where Banzami's documentation applies the principle.

| Principle | Applied as |
|---|---|
| Time to first success is the headline metric; the first page a newcomer sees points at it. | Task-first home; Quickstart is one click from every page; 12 steps in 4 stages with a stated wait (Financial Setup review). |
| Guides and reference are separate products that link to each other. | Build guides vs API reference; every endpoint links its guides and every guide links its endpoints. |
| Navigation is by task, not by internal system. | GET STARTED / BUILD / CONSOLE / REFERENCE / LEARN / RESOURCES. |
| Reference density: every endpoint answers the same questions in the same place. | Scope, idempotency, typed parameters grouped by location, refused fields, response, reachable errors, events, SDK method, guides. |
| Errors are resolved in two layers: the HTTP class first, then the code. | HTTP class table, then a searchable, filterable catalogue of 72 codes with meaning and action. |
| Webhooks are taught as a safe pattern, not an endpoint list. | Ten-step recipe with verify-before-parse as its own step; retry and disable behaviour stated exactly. |
| Testing is a cookbook of scenarios with expected results. | 18 Sandbox recipes: trigger, API result, event, Console, clean-up, limitations. Real mechanisms only. |
| Progressive disclosure: the common path first, detail on demand. | Collapsed long responses, event samples and symptoms; comparison tables before prose. |
| Code-language tabs only when the languages exist. | One official server SDK (TypeScript) plus curl; no tabs for SDKs that do not exist. |
| Contextual links replace "see also" lists. | Next-step cards on every page; Console pages deep-link to the guide for that screen. |
| Reference must work on a phone. | Tables and fixed diagrams scroll in place; path diagrams redraw in one column; fact grids stack. |
| Search answers questions, not only titles. | Aliases in both languages; 57 real queries held by a gate. |
| Documentation is consumed by tools and models as well as people. | `llms.txt` generated from the canonical pages, held against drift; OpenAPI and Postman artifacts. No chatbot, no MCP. |

## Journeys

Each journey: GOAL · CURRENT PATH · DECISIONS · PAGES · AMBIGUITIES · DEAD
ENDS · UNNECESSARY CONCEPTS · COPY/PASTE · ERROR RECOVERY · NEXT STEP · MOBILE ·
SELF-SERVICE · ACTION · STATUS.

### J1 — First payment

- **GOAL** Create a payment in the Sandbox and confirm it on the server.
- **CURRENT PATH** Home → Quickstart (12 steps).
- **DECISIONS** 1: new Business or existing Business (comparison table + diagram).
- **PAGES** 1; optional Testing → "Pay a session".
- **AMBIGUITIES** None found. Each step says what, why, what to do, how to know it worked, what is next.
- **DEAD ENDS** None; next-step cards at the end.
- **UNNECESSARY CONCEPTS** Removed: primary paths, suggested journeys, the old "guides" page.
- **COPY/PASTE** Code blocks are held by `check-docs-code-examples`; the SDK sample shows the client created with `webhookSecret`.
- **ERROR RECOVERY** Troubleshooting covers the failures a step can produce (401, missing scope, `PAYMENTS_UNAVAILABLE`, missing webhook); the help card on every page links it.
- **NEXT STEP** Accept payments, Webhooks, Sandbox testing.
- **MOBILE** Path diagram in one column; step cards stack.
- **SELF-SERVICE** Full, except two constraints stated where they occur: the Financial Setup review (step 4), and paying a test session needs a Banzami wallet in the Sandbox (step 10 links the Testing recipe, which says so and routes to support).
- **ACTION** Done. Runtime proof: the Quickstart end-to-end run completes after the Financial Setup approval ceremony.
- **STATUS** GOOD — the two waits are product constraints, documented where they occur.

### J2 — Financial Setup

- **GOAL** Make a project able to receive payments.
- **CURRENT PATH** Quickstart → Financial Setup section (step 4); Console → Financial Setup.
- **DECISIONS** 1 (new vs existing Business).
- **PAGES** 1.
- **AMBIGUITIES** Removed: "who decides" and "is it immediate" are table rows.
- **DEAD ENDS** None.
- **UNNECESSARY CONCEPTS** Internal owner/binding vocabulary removed.
- **COPY/PASTE** `getFinancialSetup()` readiness check.
- **ERROR RECOVERY** `403 PAYMENTS_UNAVAILABLE` symptom explains the state and what is missing.
- **NEXT STEP** Create an API key.
- **MOBILE** Diagram scrolls in place; table scrolls.
- **SELF-SERVICE** Submission is self-service; approval is a Banzami review, stated.
- **ACTION** Done.
- **STATUS** GOOD — review time is outside the documentation.

### J3 — API key and scopes

- **GOAL** Create a key with the right scopes.
- **CURRENT PATH** Console → API keys (scope-by-task table); Quickstart step 5.
- **DECISIONS** Which scopes — answered by the table, derived from the endpoint contracts.
- **PAGES** 1.
- **AMBIGUITIES** The task harness found none of this in one place at first (T3 failed); the table was added.
- **DEAD ENDS** None. **UNNECESSARY CONCEPTS** None.
- **COPY/PASTE** `GET /v1/me` confirmation.
- **ERROR RECOVERY** `401` and `403 INSUFFICIENT_SCOPE` symptoms.
- **NEXT STEP** Security → store the key.
- **MOBILE** Table scrolls in place. **SELF-SERVICE** Full.
- **ACTION** Done. **STATUS** EXCELLENT.

### J4 — Accept payments (session, link, QR)

- **GOAL** Choose and create the right payment resource.
- **CURRENT PATH** Accept payments.
- **DECISIONS** 1, with a comparison table.
- **PAGES** 1 (+ reference per endpoint).
- **AMBIGUITIES** Interfaces (link, deep link, dynamic/static QR) stated from the runtime DTO.
- **DEAD ENDS** None. **UNNECESSARY CONCEPTS** None.
- **COPY/PASTE** curl and SDK samples; expected response shown.
- **ERROR RECOVERY** Common errors table with fixes.
- **NEXT STEP** Confirm with webhooks.
- **MOBILE** Good. **SELF-SERVICE** Full.
- **ACTION** Done. Payment Links with a project key need the HTTP call until the SDK release that carries the fix (the SDK source is fixed; the release is an owner action).
- **STATUS** GOOD — the SDK release is pending.

### J5 — Webhooks

- **GOAL** Receive events safely.
- **CURRENT PATH** Webhooks → 10-step recipe.
- **DECISIONS** None.
- **PAGES** 1 (+ Events).
- **AMBIGUITIES** Retries (5 attempts: 1 m, 5 m, 30 m, 2 h), disable ("events emitted while disabled are never delivered") and rotation (immediate, not overlapping) stated exactly.
- **DEAD ENDS** None. **UNNECESSARY CONCEPTS** None.
- **COPY/PASTE** SDK verifier over the raw body; a wrong example shown as wrong.
- **ERROR RECOVERY** Signature and missing-webhook symptoms.
- **NEXT STEP** Events, Testing.
- **MOBILE** Diagram in one column. **SELF-SERVICE** Full.
- **ACTION** Done. **STATUS** EXCELLENT.

### J6 — Events

- **GOAL** Know what each event carries and what to do.
- **CURRENT PATH** Events → per-event reference.
- **DECISIONS** None. **PAGES** 1.
- **AMBIGUITIES** Only documented fields are the contract; extra payload fields are stated as not part of it.
- **DEAD ENDS** None. **UNNECESSARY CONCEPTS** None.
- **COPY/PASTE** Sample delivery per event.
- **ERROR RECOVERY** Duplicates and ordering per event.
- **NEXT STEP** The resource's guide and endpoint.
- **MOBILE** Tables scroll; fact grids stack. **SELF-SERVICE** Full.
- **ACTION** Done. **STATUS** EXCELLENT.

### J7 — Errors and recovery

- **GOAL** Turn an error response into an action.
- **CURRENT PATH** Errors → HTTP class → searchable catalogue; Troubleshooting by symptom.
- **DECISIONS** None. **PAGES** 1–2.
- **AMBIGUITIES** Handle by status, then code, never message — stated in the intro.
- **DEAD ENDS** None; every reference error links its catalogue entry.
- **UNNECESSARY CONCEPTS** None.
- **COPY/PASTE** Error envelope sample.
- **ERROR RECOVERY** Meaning, action, where to look, request_id.
- **NEXT STEP** Support with request_id.
- **MOBILE** Tables scroll in place; the catalogue search sits above the list. **SELF-SERVICE** Full.
- **ACTION** Done (a family code `FEE_DESTINATION_*` produced a broken anchor on the deployed reference; fixed). **STATUS** EXCELLENT.

### J8 — Retries and idempotency

- **GOAL** Retry safely after a timeout.
- **CURRENT PATH** API reference → Idempotency (canonical), linked from How Banzami works and every money guide.
- **DECISIONS** None. **PAGES** 1.
- **AMBIGUITIES** The timeout case was implied, not said (task harness T4); it now opens the rules: same key, same body.
- **DEAD ENDS** None. **UNNECESSARY CONCEPTS** None.
- **COPY/PASTE** curl retry sample.
- **ERROR RECOVERY** `IDEMPOTENCY_CONFLICT`, `IDEMPOTENCY_KEY_REUSED`.
- **NEXT STEP** The money guides. **MOBILE** Good. **SELF-SERVICE** Full.
- **ACTION** Done. **STATUS** EXCELLENT.

### J9 — Refunds

- **GOAL** Refund all or part of a payment.
- **CURRENT PATH** Refunds (3 steps).
- **DECISIONS** Full or partial. **PAGES** 1.
- **AMBIGUITIES** Status stored is `SUCCEEDED`; body `idempotency_key` required; which account is debited.
- **DEAD ENDS** None. **UNNECESSARY CONCEPTS** None.
- **COPY/PASTE** SDK sample with `refund_source`.
- **ERROR RECOVERY** Errors with retry guidance.
- **NEXT STEP** Testing → refund recipe. **MOBILE** Good. **SELF-SERVICE** Full.
- **ACTION** Done. **STATUS** EXCELLENT.

### J10 — Settlements

- **GOAL** Pay out a campaign balance.
- **CURRENT PATH** Settlements (worked example + 3 steps).
- **DECISIONS** Fee destination. **PAGES** 1.
- **AMBIGUITIES** Not automatic; gross is the whole balance; the fee comes from the pricing profile; 100000 − 2000 = 98000, movements sum to zero.
- **DEAD ENDS** None. **UNNECESSARY CONCEPTS** None.
- **COPY/PASTE** SDK sample.
- **ERROR RECOVERY** Errors table with idempotency guidance.
- **NEXT STEP** Events (settlement events), DOA.
- **MOBILE** Settlement diagram redrawn vertically.
- **SELF-SERVICE** Full once the Business has a pricing profile (assigned by Banzami; stated).
- **ACTION** Done. The Console has no settlement list and a project key cannot read a settlement by id; the page says to keep the response and the `application_settlement.completed` event.
- **STATUS** GOOD — no Console settlement view exists; stated.

### J11 — Accounts and transfers

- **GOAL** Keep funds apart and move them between accounts.
- **CURRENT PATH** Accounts and transfers. **DECISIONS** None. **PAGES** 1.
- **AMBIGUITIES** "A transfer is / is not" table. **DEAD ENDS** None. **UNNECESSARY CONCEPTS** Root wallet hidden.
- **COPY/PASTE** SDK sample. **ERROR RECOVERY** `INSUFFICIENT_FUNDS` recipe.
- **NEXT STEP** Settlements. **MOBILE** Good. **SELF-SERVICE** Full.
- **ACTION** Done. **STATUS** EXCELLENT.

### J12 — Receipts and references

- **GOAL** Verify a receipt; tell the two references apart.
- **CURRENT PATH** Receipts. **DECISIONS** None. **PAGES** 1.
- **AMBIGUITIES** The 8-character transaction reference vs the `BZM-…` proof reference, in one table with "publicly verifiable: no / yes".
- **DEAD ENDS** None. **UNNECESSARY CONCEPTS** None.
- **COPY/PASTE** curl verification. **ERROR RECOVERY** 200 / 404 / 503.
- **NEXT STEP** Events. **MOBILE** Good. **SELF-SERVICE** Full.
- **ACTION** Done. **STATUS** EXCELLENT.

### J13 — Sandbox testing

- **GOAL** Exercise each scenario deliberately.
- **CURRENT PATH** Sandbox testing (18 recipes).
- **DECISIONS** None. **PAGES** 1.
- **AMBIGUITIES** Real mechanisms only; "no API marks a session paid" stated.
- **DEAD ENDS** None. **UNNECESSARY CONCEPTS** None.
- **COPY/PASTE** Triggers are literal requests.
- **ERROR RECOVERY** Expected refusal codes per recipe.
- **NEXT STEP** From Sandbox toward Live. **MOBILE** Recipe grids stack.
- **SELF-SERVICE** Full except paying a session, which needs a Sandbox Banzami wallet (not publicly distributed; routed to support).
- **ACTION** Done; the invalid-cursor recipe was added after the task harness found it missing (T13).
- **STATUS** GOOD — the payer wallet constraint is a product constraint.

### J14 — DOA reference implementation

- **GOAL** See a complete integration end to end.
- **CURRENT PATH** DOA (16 sections, chapter facts). **DECISIONS** None. **PAGES** 1.
- **AMBIGUITIES** DOA is not a special tenant: same API, SDK, authorisation, contracts, webhooks, settlement.
- **DEAD ENDS** None. **UNNECESSARY CONCEPTS** None.
- **COPY/PASTE** SDK calls DOA uses. **ERROR RECOVERY** Common failure per chapter.
- **NEXT STEP** Settlements, Webhooks. **MOBILE** Good. **SELF-SERVICE** Full.
- **ACTION** Done. Runtime proof: contract run 13/13 against the deployed API; the full run completes after the approval ceremony.
- **STATUS** EXCELLENT.

### J15 — Console ↔ documentation

- **GOAL** Move between a Console screen and its guide without searching.
- **CURRENT PATH** Console pages carry deep links (Logs, Webhooks, Transactions, Balances, Go live, Support); docs name Console locations exactly.
- **DECISIONS** None. **PAGES** 1. **AMBIGUITIES** None. **DEAD ENDS** None (16 deep links held by a gate).
- **UNNECESSARY CONCEPTS** None. **COPY/PASTE** n/a. **ERROR RECOVERY** Logs → request_id → Troubleshooting.
- **NEXT STEP** n/a. **MOBILE** Good. **SELF-SERVICE** Full.
- **ACTION** Done. **STATUS** EXCELLENT.

### J16 — API reference lookup

- **GOAL** Find everything about one endpoint.
- **CURRENT PATH** API reference → resource group → endpoint.
- **DECISIONS** None. **PAGES** 1.
- **AMBIGUITIES** Scope, idempotency, parameters, refused fields, errors, events, SDK method on every endpoint; held to the gateway by `check-docs-api-reference`.
- **DEAD ENDS** None. **UNNECESSARY CONCEPTS** None.
- **COPY/PASTE** curl per endpoint. **ERROR RECOVERY** Error links.
- **NEXT STEP** Guide links. **MOBILE** Section rail collapses; tables scroll.
- **SELF-SERVICE** Full. **ACTION** Done. **STATUS** EXCELLENT.

### J17 — Search

- **GOAL** Type a question or a code and land on the answer.
- **CURRENT PATH** Search box on every page.
- **DECISIONS** None. **PAGES** 1.
- **AMBIGUITIES** English queries on Portuguese pages resolved by aliases.
- **DEAD ENDS** None. **UNNECESSARY CONCEPTS** None.
- **COPY/PASTE** n/a. **ERROR RECOVERY** Error codes and HTTP classes are indexed.
- **NEXT STEP** n/a. **MOBILE** Good. **SELF-SERVICE** Full.
- **ACTION** Done; 57 queries held by `check-docs-search`. **STATUS** EXCELLENT.

### J18 — Troubleshooting and support

- **GOAL** Solve a problem, or ask for help with the right information.
- **CURRENT PATH** Troubleshooting (16 symptoms) → Support.
- **DECISIONS** None. **PAGES** 1–2.
- **AMBIGUITIES** What to include (request_id, date and time with time zone, environment, Project ID, operation, SDK version) and what never to send (keys, secrets).
- **DEAD ENDS** None. **UNNECESSARY CONCEPTS** None.
- **COPY/PASTE** n/a. **ERROR RECOVERY** Per symptom.
- **NEXT STEP** Email support. **MOBILE** Good.
- **SELF-SERVICE** Full. The support address was replaced by "[email protected]" on the deployed site by Cloudflare's email obfuscation, whose decoder the CSP blocks; found by the deployed sweep and fixed.
- **ACTION** Done. **STATUS** EXCELLENT.

### J19 — From Sandbox toward Live

- **GOAL** Know what is and is not available, and what to prepare.
- **CURRENT PATH** From Sandbox toward Live; Sandbox vs Live table.
- **DECISIONS** None. **PAGES** 1.
- **AMBIGUITIES** Financial Live unavailable (fail-closed); no dates; no approval promises.
- **DEAD ENDS** None. **UNNECESSARY CONCEPTS** None.
- **COPY/PASTE** n/a. **ERROR RECOVERY** n/a.
- **NEXT STEP** Changelog. **MOBILE** Good. **SELF-SERVICE** Full.
- **ACTION** Done. **STATUS** GOOD — Live itself is not available; the page is complete for what exists.

### J20 — Security and credential rotation

- **GOAL** Store, limit and rotate keys and the webhook secret.
- **CURRENT PATH** Security; Webhooks step 10; Console → API keys.
- **DECISIONS** None. **PAGES** 1–2.
- **AMBIGUITIES** Key rotation order (create, deploy, confirm `/v1/me`, revoke); webhook secret rotation is immediate.
- **DEAD ENDS** None. **UNNECESSARY CONCEPTS** None.
- **COPY/PASTE** n/a. **ERROR RECOVERY** 401 symptom.
- **NEXT STEP** Support for vulnerabilities (security@banzami.com).
- **MOBILE** Diagram in one column. **SELF-SERVICE** Full.
- **ACTION** Done. **STATUS** EXCELLENT.

## Task harness (§40)

`tools/e2e/docs/task-harness.mjs` performs T1–T20 from `/docs` against the
published pages: the answering page must be within its click budget, the
anchored section must exist, and that section must state the substance.

First run against the deployed site: 16/20. The four misses were real
documentation gaps (scope by task, the timeout retry rule, the bad-cursor
recipe, log retention in the logs section) and were fixed in the copy.

```
DOCS_DX_TASK_ACCEPTANCE=20/20   (PT 20/20, EN 20/20)
```

## Cold new-developer navigation (§41)

Starting at `/docs`, knowing nothing. Clicks measured by the task harness's link
graph and by hand in the browser.

| Looking for | Clicks from /docs | Label followed |
|---|---|---|
| Quickstart | 1 | "Começar a construir" / sidebar "Quickstart" |
| API reference | 1 | "Referência da API" (hero CTA and sidebar) |
| API key documentation | 1 page + 1 in-page | Sidebar "A Consola" → "Chaves de API" in the section list; also Quickstart step 5 |
| Financial Setup | 1 page + 1 in-page | Quickstart → stage bar "Configuração financeira" (the home path diagram highlights it) |
| Webhooks | 1 | Sidebar "Webhooks" |
| Errors | 1 | Sidebar "Erros" |
| Refunds | 1 | Sidebar "Reembolsos" |
| Settlements | 1 | Sidebar "Liquidações" |
| DOA | 1 | Sidebar "Construir como o DOA" |
| Support | 1 | Sidebar "Suporte" / help card on every page |

Findings and what was done:

- **Confusing labels** — the old "Guias" page held several unrelated topics;
  replaced by task pages, with its old anchors redirected to their new homes.
- **Unexpected navigation** — "On this page" sat above the page title; moved to
  a right rail on wide screens, collapsed above the article on narrow ones.
- **Backtracking** — scopes had to be assembled from the quickstart and the
  reference; one table now answers it.
- **Ambiguous paths** — none remaining in the ten targets above.

No duplicate links were added to game the count; every target is reached through
the sidebar or a labelled task card that already existed for a reader.

## Search acceptance (§42)

`tools/check-docs-search.mjs`: 57 PT/EN queries, top-5 expected. Fails when an
error code, an event, a canonical endpoint path, Financial Setup or the
Quickstart can no longer be found (disabling aliases produces 8 failures).

## Gates (§43–50)

| Counter | Gate | Result |
|---|---|---|
| API_REFERENCE_REQUIRED_FIELDS_MISSING=0 | `tools/check-docs-api-reference.mjs` (+ selftest, 9 mutations) | PASS |
| EVENT_REFERENCE_REQUIRED_FIELDS_MISSING=0 | `tools/check-webhook-event-catalogue.mjs` | PASS |
| ERROR_REFERENCE_REQUIRED_FIELDS_MISSING=0 | `tools/check-docs-error-catalogue.mjs` (+ selftest) | PASS |
| SANDBOX_TEST_RECIPES_VALID=PASS | `tools/check-docs-dx.mjs` | PASS |
| AI_READABLE_DOCS_STALE=0 | `tools/docs/build-llms-txt.mjs --check` | PASS |
| DOCS_DIAGRAM_NODE_COUNT=PASS | `tools/check-docs-dx.mjs` (caught the 9-node concept model and the 8-step DOA diagram; both redrawn) | PASS |
| DOCS_EDITORIAL_LINT=PASS | `tools/check-docs-editorial.mjs` | PASS |
| DOCS_COLD_READER_ACCEPTANCE=12/12 | `tools/e2e/docs/cold-reader.mjs` (deployed) | PASS |
| DOCS_AUDIT | `tools/e2e/docs/audit.mjs` (deployed) | 83/0 |

**No visual overengineering (§48):** no animation beyond hover states, no
gradients in the article, no hero artwork, no dashboards inside the docs, no
content hidden behind tabs, no API Explorer, no assistant.

## Product findings surfaced by the documentation work

| Finding | Where it stands |
|---|---|
| `@banzami/sdk` 0.13.0 required `merchantId`/`walletId` for Payment Links, which a project key cannot send. | Fixed in the SDK source (b13a6e2a); needs an npm release by the owner. Docs say to use HTTP until then. |
| `wallet_account_id` was documented in the SDK types as refused for a project key; the gateway accepts it and checks ownership. | Type comment corrected (45396c5f). |
| Webhook payloads carry `merchant_id` / `wallet_id` / `payee_wallet_id`, which API responses redact. | Docs document only non-owner fields and state extra fields are not part of the contract. Redaction in the emitters is a separate product change. |
| A developer cannot obtain a Sandbox payer wallet without support: the Banzami app is not publicly distributed. | Stated in Quickstart and Testing; routed to support. A self-service Sandbox payer is a separate product change. |
| Cloudflare email obfuscation hid the support and security addresses behind a script the CSP blocks. | Fixed for the documentation and developer Console (c4485b4f). Other website pages with addresses (merchant application flow, banzami.com/suporte) carry the same defect. |
