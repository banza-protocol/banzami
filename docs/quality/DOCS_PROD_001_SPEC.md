# DOCS-PROD-001 — the acceptance standard

**Version:** 1.0
**Status:** owner-supplied specification, preserved verbatim
**Recorded:** 2026-09-13
**Sections:** 0–81 (82)

---

## Why this file exists

This is the owner's DOCS-PROD-001 specification, stored so that no future
session has to recover it from chat history. A previous conformance attempt
could not produce the section-by-section table because the standard existed only
in a conversation that had been compacted away — and the only honest answer at
that point was to stop and ask for it rather than reconstruct 82 sections from
memory and grade against the reconstruction.

It is governance/assurance documentation, not a public developer page.

**It is the acceptance authority.** It is not edited to match the
implementation. If the product and this standard disagree, the standard is what
the work is measured against; changing it requires the owner, not a commit.

Structural integrity is enforced by `tools/check-docs-prod-001-spec.mjs`:

```
DOCS_PROD_001_SPEC_SECTIONS=82
DOCS_PROD_001_SPEC_MISSING_SECTIONS=0
DOCS_PROD_001_SPEC_DUPLICATE_SECTIONS=0
```

---

# BANZAMI DEVELOPERS DOCUMENTATION — DOCS-PROD-001

PUBLIC DEVELOPER DOCUMENTATION
SINGLE TRUTH · DOA REFERENCE IMPLEMENTATION · API v1 · SDK-FIRST
EXTERNAL-DEVELOPER READY

The objective is to prove that the deployed documentation is complete, correct,
runnable, self-sufficient and synchronized with the current product.

If anything is missing: FIX IT NOW. TEST IT. DEPLOY IT. RETEST IT.

---

## 0. PRECONDITION

Product closure is complete.

Use the exact final deployed Banzami runtime and current SDK state.

Do not document an intermediate state.

Public API remains: v1

Do NOT create: /v2

SDK semantic/package versions are independent from API version.

Financial LIVE remains: NOT READY / FAIL-CLOSED.

## 1. AUDIT THE COMPLETE DEPLOYED PUBLIC DOCUMENTATION

Crawl `https://developers.banzami.com/docs` and every canonical PT and EN
documentation route.

Inventory every: page, heading, link, anchor, code example, curl example, SDK
example, endpoint, method, schema, error code, event, status claim, availability
claim, version claim, environment claim, screenshot, artifact, download, CTA,
Console deep link.

Maintain/update `docs/quality/DEVELOPER_DOCUMENTATION_AUDIT.md`.

For every material claim: PAGE, CLAIM, CURRENT PUBLIC TEXT, AUTHORITATIVE
SOURCE, CURRENT RUNTIME TRUTH, ACTION, KEEP / UPDATE / REMOVE / REPLACE, TEST.

Do not stop after inventory. Fix findings immediately.

## 2. REMOVE ALL STALE PUBLIC CLAIMS

Verify that none of the retired historical statements survived, including:
Console is demo / non-operational; SDKs are unpublished / preview-only; do not
run `npm install @banzami/sdk`; webhook delivery is simulated; refunds pending
when they are current; transfers pending when they are current; `/v1/business/*`;
`applicationFeeBps`; old payment-request contracts; old SDK package names; old
SDK versions; Preview language inconsistent with Public Sandbox; "Pendente E2E";
vendored package as primary installation path.

Do not maintain a "legacy documentation museum". Pre-launch documentation has
one current truth.

Required: `PUBLIC_DOC_STALE_CLAIMS=0`, `PUBLIC_DOC_LEGACY_CONTRACTS=0`,
`PUBLIC_LEGACY_ALIASES_IN_DOCS=0`.

## 3. DOCUMENTATION MUST BE SELF-SUFFICIENT

An external developer must be able to answer, using public docs only:

What is Banzami? What can I build? What is Sandbox? What is Live? How do I
create an account? What is a Workspace? What is a Project? What is Financial
Setup? How do I connect a Business? How do I obtain an API key? Where may that
key be used? How do I install the SDK? How do I create my first payment? How do
I create/show a Payment Link? How do I use QR? How do I determine that payment
succeeded? How do I receive webhooks? How do I verify webhooks? How do I refund?
How do settlements work? How do receipts/proofs work? What do I do after a
timeout? How does idempotency work? How do I debug an error? How do I
rotate/revoke credentials? How do I delete/archive resources? How do I go from
zero to a full integration? What is unavailable because Financial LIVE is
unavailable? How do I get support?

If a required answer needs Slack, private repository access, internal chat
history, tribal knowledge, or a Banzami engineer beside them, documentation is
incomplete.

## 4. INFORMATION ARCHITECTURE

Documentation must be organized primarily around developer goals.

Ensure the current IA clearly covers, whether as individual pages or
well-structured merged pages:

START — Overview; Quickstart; How Banzami works; Sandbox vs Live.

DEVELOPER CONSOLE — Account; Workspaces; Members and roles; Projects; Financial
Setup; API Keys; Webhooks; Logs / Events; Workspace Activity; Account and
security; Resource lifecycle: delete vs archive.

INTEGRATE — SDK installation; Authentication; First API call; Idempotency;
Errors and retries.

PAYMENTS — Payment Sessions; Payment Links; QR Payments; Payment lifecycle;
Receipts / proof verification.

MONEY — Wallet Accounts; Balances; Transactions; Refunds; Application
Settlements; Payouts only if currently public/supported.

WEBHOOKS — Endpoint creation; Signature verification; Event catalogue; Retries;
Delivery troubleshooting.

REFERENCE IMPLEMENTATION — DOA overview; DOA architecture; DOA step-by-step
integration; Source/concept mapping; Lessons/patterns.

REFERENCE — API Reference v1; SDK Reference; Error catalogue; Event catalogue;
Rate limits; Object schemas.

SANDBOX — Testing; Test data; Sandbox guarantees; Sandbox limits.

RESOURCES — OpenAPI; Postman only if still useful/current; Changelog; Glossary;
Support.

Do not create unnecessary navigation depth. Quickstart must be immediately
discoverable.

## 5. DOCUMENTATION HOMEPAGE

The docs homepage must behave like a product entry point, not an internal status
dump.

It should communicate clearly: Build with Banzami.

Provide obvious paths to: Start integrating; Understand the platform; Browse API
reference.

Surface: Quickstart; popular developer tasks; DOA reference implementation;
Sandbox available; Live unavailable.

Do not lead with internal assurance/governance terminology. Do not make users
understand the repository to understand the product.

## 6. QUICKSTART — REAL AND RUNNABLE

The original Quickstart requirement is a real external-developer journey.

Prove all twelve steps:

1. Create/sign in to Developer account.
2. Create Workspace.
3. Create Project.
4. Complete or connect Financial Setup.
5. Create secret API key.
6. Install current official SDK.
7. Call identity/readiness.
8. Create first payment resource.
9. Open hosted payment experience.
10. Receive/observe payment confirmation.
11. Receive webhook.
12. View transaction/receipt in Console.

Primary installation must use the current published SDK registry package.

No source checkout. No local tarball. No vendored SDK as primary path. No
private documentation. No direct DB mutation. No hidden command.

Execute the Quickstart from a clean environment using ONLY public docs.

If the workflow needs operator review because that is the real contract, use the
canonical review workflow. Do not bypass KYB/Financial Setup.

If a genuinely human-only OTP/MFA ceremony is required, stop only for that
specific ceremony, then continue automatically.

Cleanup afterwards.

Required: `DOC_QUICKSTART_E2E=PASS`, `DOC_QUICKSTART_RESIDUE=0`,
`PUBLIC_SDK_INSTALL_FROM_REGISTRY=PASS`.

## 7. COMPLETE DEVELOPER CONSOLE DOCUMENTATION

The docs must describe the actual current Console.

ACCOUNT — personal account; profile; security; sessions; preferences if they
truly exist; logout. Do not document decorative preferences that do nothing.

WORKSPACE — what Workspace represents; membership; roles; ownership; invites;
leave Workspace; ownership transfer; hard-delete conditions; archive conditions.

PROJECT — purpose; stable Project ID; environment; rename; delete empty Project;
archive financial/historical Project.

FINANCIAL SETUP — why it exists; Project → Financial Setup → Business →
financial authority. Document both canonical paths: A. new Business application;
B. connect existing Business with single-use consent code. Explain operator
review truthfully. No auto-KYB fiction.

API KEYS — name; scopes; reveal once; rotation; revocation; last use;
server-side-only storage; Sandbox key semantics; Live fail-closed status.

WEBHOOKS — endpoint lifecycle; signing secret; delivery activity;
disable/re-enable; rotation; retries; troubleshooting.

LOGS / EVENTS — developer integration/API activity.

WORKSPACE ACTIVITY — added after the original documentation milestone. Document
it as current product truth: Workspace Activity = administrative
membership/ownership audit. Logs / Events = application/API integration
activity. Do not confuse the two. Do not expose `developer.audit_events` or
other implementation-table names.

Every major Console surface should link contextually to relevant docs.

Required: `DOCS_CONSOLE_COMPLETE=PASS`, `DOCS_WORKSPACE_COMPLETE=PASS`,
`DOCS_PROJECT_COMPLETE=PASS`, `DOCS_FINANCIAL_SETUP_COMPLETE=PASS`,
`DOCS_API_KEYS_COMPLETE=PASS`, `DOCS_WEBHOOKS_COMPLETE=PASS`.

## 8. CANONICAL CONCEPT MODEL

Documentation must explain one clear authority model:

```
User
  ↓ membership
Workspace
  ↓ contains
Project
  ↓ financial authority
Financial Setup
  ↓ binds
Business
  ↓ owns/controls
Wallet / Wallet Accounts
  ↓ receives financial effects from
Payments / Refunds / Settlements
```

State explicitly: User ≠ Workspace; Workspace ≠ Project; Project ≠ Business;
Business ≠ Wallet Account.

Authority: Project key → Project → sealed/current Financial Setup → Business →
permitted resources.

Client-supplied IDs identify/select resources. They DO NOT grant authority.

Do not teach internal concepts such as merchant UUID, owner UUID, root wallet,
PRIMARY internal account, binding-table internals, unless there is a true public
contract requiring them.

## 9. DOA — CANONICAL REFERENCE IMPLEMENTATION

Create/verify a major public section: DOA — Reference Implementation, or
equivalent.

DOA is an EXAMPLE APPLICATION. DOA is NOT a special Banzami tenant.

Required principle: DOA MAY BE SPECIAL AS AN APPLICATION. DOA MUST NEVER BE
SPECIAL AS A BANZAMI TENANT.

Every DOA example must use contracts available to another external developer.

Required: `DOA_REFERENCE_IMPLEMENTATION=PASS`, `DOA_DOC_SPECIAL_CASES=0`.

## 10. DOA ARCHITECTURE

Explain the application/platform boundary clearly.

Conceptual flow: Donor → DOA → Banzami API / SDK → Payment Session / Link / QR →
payer completes payment → Banzami financial truth → webhook → DOA updates
business/application state → campaign closes → settlement → beneficiary +
application fee destination.

DOA owns: campaigns; donor UX; campaign state; application-specific business
logic.

Banzami owns: money; balances; payment execution; pricing; fees; ledger;
receipts/proofs; settlement execution.

This boundary must be understandable without repository access.

## 11. DOA STEP-BY-STEP TUTORIAL

The public tutorial must teach a sanitized integration from zero.

Cover: 1. Developer account. 2. Workspace. 3. Project. 4. Financial Setup.
5. New Business application path. 6. Existing Business consent-code path.
7. API key. 8. Required scopes. 9. SDK installation. 10. Server configuration.
11. Identity/readiness. 12. Campaign-side integration pattern. 13. Payment
Session / Link. 14. Hosted payment URL. 15. QR presentation. 16. Payer
completion. 17. Webhook reception. 18. Signature verification. 19. Idempotent
processing. 20. Application state. 21. Receipt/reference. 22. Campaign close.
23. Settlement according to current public model. 24. Settlement result/event.
25. Reconciliation. 26. Credential rotation/revocation. 27. Troubleshooting.

Use placeholders only for actual required environment variables. Do not invent
configuration variables. Do not expose private repository paths.

## 12. DOA CODE EXAMPLES

Derive recommended patterns from the real current DOA integration where useful.
Do NOT dump private application code.

Every example must be: sanitized; minimal; correct; current;
compilable/testable; public-contract-only.

If DOA contains an implementation detail other applications should NOT copy: do
not teach it.

Document the recommended contract usage, not historical accidents.

## 13. DOA SOURCE / CONCEPT MAPPING

Provide an advanced mapping such as: Developer concept; DOA responsibility;
Banzami public method/resource; Why.

Examples: Create payment journey → DOA donation/business service → Banzami
payment resource → obtains hosted payer experience. Payment confirmed → DOA
webhook consumer → emitted payment event → updates campaign/application state.
Settlement completed → DOA financial integration → application settlement
event/resource → records final economic result.

If DOA repo is private: describe module roles, not private file paths.

## 14. SDK DOCUMENTATION

SDK docs must use current registry truth.

Document: current package/version; installation; client construction;
configuration; methods grouped by domain; parameters; return types; errors;
idempotency; security; server/browser compatibility; webhook helpers where
official.

Do not document removed methods. Do not manually duplicate large generated type
surfaces unnecessarily. Where reference can derive from SDK source,
derive/validate it.

Required: `DOCS_SDK_CURRENT=PASS`.

## 15. API REFERENCE — OPENAPI v1 IS AUTHORITY

Canonical API reference must derive from or validate against final OpenAPI v1.

Public API: v1 ONLY.

No: `/v2`; `/v1/business/*` if retired; `applicationFeeBps`; withdrawn routes;
retired payment-request contract; operator/internal-only routes presented as
developer endpoints.

Every public endpoint should expose: method; path; purpose; authentication;
required scope; request schema; response schema; errors; idempotency semantics;
example.

Required: `DOC_ENDPOINTS_NOT_IN_OPENAPI=0`, `OPENAPI_ENDPOINTS_UNDOCUMENTED=0`,
`ROUTE_OPENAPI_DOC_DRIFT=0`, `DOCS_CURRENT_API_VERSION=v1`,
`DOCS_V2_REFERENCES=0`.

## 16. API EXPLORER — OPTIONAL ONLY IF SAFE

Evaluate whether a Sandbox interactive API explorer adds real value.

If implemented: Sandbox only. Never Live. Never persist secret. Never put secret
in URL. No analytics capture of credentials. Clear warning. Secrets stay only in
approved ephemeral client state.

If this cannot be implemented safely: NOT_APPLICABLE is acceptable with explicit
reason.

Documentation quality does not require an unsafe "Try it" button.

## 17. MULTI-LANGUAGE CODE EXAMPLES

Primary language: TypeScript / Node SDK.

Where officially supported/current, examples may include: Python; PHP; Go;
Flutter/Dart; curl.

Do not show a language merely for symmetry. Every displayed language example
must be maintained and verified.

Where multiple language examples share semantics, use generated/shared
fixtures/templates where practical to prevent drift.

## 18. CODE COPY UX

Commands/code blocks intended to be pasted must provide accessible Copy UX.

Copy result must contain only the intended code.

Do not include shell prompt characters that break paste.

Provide visible success feedback. Keyboard accessible.

## 19. AMOUNTS AND CURRENCIES

Create/verify one canonical explanation.

Document `amount_minor`; AOA minor-unit semantics.

Examples: 100 minor = 1 Kz; 25 000 minor = 250 Kz; 5 000 000 minor = 50 000 Kz.

Use current runtime semantics. No float money. Document SDK formatting helpers
if current/public.

Maintain regression protection against the historical 100× formatting defect.

## 20. IDEMPOTENCY — FIRST-CLASS GUIDE

Idempotency must not be buried only in endpoint reference.

Explain: when required; how to generate key; stable retention semantics only if
contractually defined; network timeout handling; ambiguous outcome handling;
concurrent request behaviour; changed-payload conflict.

Critical guidance — after ambiguous network outcome: DO NOT create a new
economic command merely because the response was lost. Use the same durable
idempotency identity / query the existing operation as defined by the contract.

Use DOA examples where appropriate.

## 21. ERRORS — FIRST-CLASS GUIDE

Explain canonical error envelope, including current public fields such as
`code`, `message`, `request_id`.

Developers must branch on `code`, not message text.

Cover: 400; 401; 403; 404; 409; 422; 429; 5xx.

For every class explain: meaning; developer action; retry?; same idempotency
key?

Generate/validate catalogue against canonical error source. Do not invent
documentation-only error codes.

Required: `DOC_ERRORS_MISSING=0`.

## 22. WEBHOOK DOCUMENTATION

Webhook guide must cover current real behaviour: endpoint registration; HTTPS;
supported URL rules; SSRF-related restrictions relevant to integrator; signing
secret; reveal-once behaviour; signature header; raw request body; timestamp;
HMAC/signature verification; tolerance/replay window if contractually defined;
event ID; at-least-once delivery; ordering semantics; retry behaviour;
deduplication; secret rotation; disable; re-enable; delivery troubleshooting.

Critical rule: VERIFY THE SIGNATURE BEFORE TRUSTING/PARSING THE EVENT.

Use official SDK verifier examples where available. Use DOA as a pattern, not
special case.

## 23. EVENT CATALOGUE — BIDIRECTIONAL TRUTH

This section must preserve the recently discovered/fixed defect.

The public event catalogue MUST be bidirectionally synchronized with current
emitted public runtime events.

Current known emitted set contains seven events. Verify from source/runtime
rather than trusting this prompt.

Previously omitted: `payment_session.created`; `refund.completed`.

Ensure: every emitted public event is documented; every documented emitted event
is actually emitted.

Do NOT publish registrable-but-never-emitted events as emitted events.

Known examples that were deliberately excluded because they were registrable but
not emitted: `payment.completed`; `payout.sent`. Verify that remains true before
relying on it.

For every current public event document: name; when emitted; payload/object;
idempotency guidance; expected developer reaction.

Required: `DOC_EVENTS_MISSING=0`, `DOC_EVENTS_NOT_EMITTED=0`,
`DOC_EVENT_CATALOGUE_PT_EN_DRIFT=0`.

Keep the bidirectional drift gate in CI.

## 24. QR PAYMENTS

Document the final current QR contract, including CAP-PAY-003 semantics.

Explain the difference between current supported concepts such as QR opening
hosted payment; structured QR payment; and any other QR mode only if it actually
exists.

Avoid vague "QR supported".

Document exactly: what developer creates; what payer scans; what happens next;
how result is observed.

Use diagrams when they improve understanding.

## 25. PAYMENT LIFECYCLES

Document actual state machines. Do not merge unrelated resource statuses.

Separate where necessary: Payment Session; Payment Link; Financial Payment;
Receipt / proof.

Use current canonical vocabulary only. Do not invent generic CREATED→PAID state
names when an object uses different statuses.

## 26. REFUNDS

Dedicated current guide.

Explain: eligible payment sources; partial refund; full refund; cumulative
limit; currency; idempotency; receipt/proof transition where applicable;
webhook/event behaviour.

Only use DOA refund examples if DOA actually performs refunds. Do not fabricate
DOA behaviour.

Required: `DOCS_REFUNDS_COMPLETE=PASS`.

## 27. SETTLEMENTS

Dedicated guide.

Explain clearly: payment ≠ settlement.

Document: who controls settlement; source account; beneficiary; fee destination;
operator-governed pricing; developer cannot choose pricing rate.

Use a worked reference example consistent with current Sandbox semantics: gross
100000 minor; 200 bps; fee 2000; net 98000. Show: -100000 + 2000 + 98000 = 0.

Explain returned/current pricing snapshot fields such as pricing profile;
applied bps; gross; fee; net — only if they are actual current public fields.

DOA may be used as the proven application pattern.

Do NOT state "settlement is automatic" unless that becomes actual runtime truth.

Required: `DOCS_SETTLEMENTS_COMPLETE=PASS`.

## 28. RECEIPTS / PROOF VERIFICATION

Explain the current public proof model.

Cover: receipt reference; SECURE_V1 public-proof reference format; QR
verification; public verifier; PDF evidence; public verifier as canonical
verification truth; exact-reference behaviour; no normalization;
reversed/refunded state where relevant.

Document states: verified; not found; temporarily unavailable. Document actual
HTTP semantics.

Do NOT conflate Consumer 8-character transfer/activity references with SECURE_V1
public receipt/proof references. They are distinct unless current contract
explicitly states otherwise.

Required: `DOCS_RECEIPTS_COMPLETE=PASS`.

## 29. SECURITY BEST PRACTICES

Dedicated security guidance.

Teach: API keys server-side only; reveal once; least privilege; rotation;
revocation; webhook secret storage; environment variables; no source control; no
localStorage for server secrets; no screenshots of secrets; session/account
security; no credentials in support tickets.

Use only synthetic placeholders.

Reflect current TLS expectation where relevant: public Banzami web endpoints
require TLS 1.2 or newer. Do not claim TLS 1.3-only.

## 30. SANDBOX

Describe current Public Sandbox accurately.

Sandbox is operational for integration. Money is fictitious. Financial LIVE is
unavailable/fail-closed.

Explain: what Sandbox shares with future Live semantics; what is
Sandbox-specific; what may safely be reset/retired; what is not evidence of
regulatory/Live readiness.

Do not call current operational Console "demo". Do not describe real outbound
webhooks as simulated.

## 31. LIVE STATUS

Canonical truth: Financial LIVE: NOT READY / FAIL-CLOSED.

Document consistently and calmly.

Do not imply launch date; regulatory approval; Live readiness; automatic access
— unless these become true later.

Avoid repeating giant warning banners unnecessarily.

## 32. CONSOLE SCREEN GUIDES

Document important Console screens where useful: Overview; Balances;
Transactions; Financial Setup; API Keys; Webhooks; Logs / Events; Workspace
Activity; Project Settings; Workspace Settings; Account; Security; Sessions.

Screenshots, if used, must be: current; sanitized; secret-free;
private-ID-free; free from bearer proof references; free from unnecessary real
personal data.

Do not make documentation depend entirely on screenshots. Concepts must remain
understandable after UI changes.

## 33. NEXT-STEP NAVIGATION

Major guides should not dead-end.

Examples: API key created → Make first request. Payment created → Handle
webhooks. Webhook configured → Test/understand retries. Integration completed →
Run Sandbox checklist.

Every major learning path should have an obvious useful next action.

## 34. SEARCH

Verify docs search quality.

Search must find, where current: titles; headings; concepts; endpoint names; SDK
methods; error codes; event names.

Keyboard shortcut may be used if accessible. Do not introduce external tracking
that captures sensitive search content.

If current documentation intentionally does not implement search, this may only
be NOT_APPLICABLE if there is a strong UX justification and the original quality
objective is still demonstrably met.

Do not default to N/A merely to avoid implementation.

## 35. NAVIGATION UX

Verify: persistent navigation; current-page state; clear sections; mobile docs
navigation; breadcrumbs where useful; previous/next where useful; no
duplicate/conflicting navigation systems; no unnecessarily deep 3-level maze.

## 36. ON-PAGE TABLE OF CONTENTS

For long guides, verify: desktop on-page TOC where useful; mobile usable
alternative where useful; stable anchors; deep links; no broken anchors.

Use NOT_APPLICABLE only for pages where a TOC genuinely adds no value.

## 37. URL DESIGN

Routes must be stable and understandable.

Examples of desired shape: `/docs`; `/docs/quickstart`; `/docs/concepts/...`;
`/docs/console/...`; `/docs/payments/...`; `/docs/webhooks`; `/docs/refunds`;
`/docs/settlements`; `/docs/reference/...`; `/docs/examples/doa`.

Do not force these exact paths if current IA uses equally clear canonical
routes.

Old docs routes may redirect for documentation navigation where appropriate.

Do NOT use documentation redirects as an excuse to preserve retired API
contracts.

No broken indexed links.

## 38. PT / EN PARITY

Portuguese is primary. English must have the same technical truth.

Verify more than route count.

Same: page set; API paths; SDK package/version; code example semantics; events;
errors; status badges; capability availability; Sandbox/Live status; DOA
tutorial semantics; Financial Setup semantics.

Translations may differ linguistically, not technically.

Required: `DOCS_PT_EN_PAGE_PARITY=PASS`, `DOCS_PT_EN_CONTRACT_PARITY=PASS`.

## 39. GLOSSARY

Current glossary should concisely cover relevant public concepts such as:
Workspace; Project; Financial Setup; Business; Wallet Account; Payment Session;
Payment Link; Refund; Transaction; Settlement; Webhook; Receipt; Sandbox; Live;
Idempotency; @banza; minor units.

No internal-only concepts. Definitions must match current public contract.

## 40. CHANGELOG

Public changelog should contain developer-impacting changes, not raw commit
history.

Where appropriate include: date; category; change; developer impact; action
required.

Do not expose sensitive security implementation details.

API remains v1 pre-launch even when current corrections are breaking
corrections. Do not manufacture v2.

## 41. OLD DOCUMENTATION CLEANUP

Search final public site/source for stale historical content.

Known strings/concepts to classify include: preview; demo; not published;
vendored; Pendente E2E; `/v1/business/`; `applicationFeeBps`; old SDK versions;
old webhook claims; retired payment requests; `apps/dashboard`.

Legitimate changelog/history context may contain historical terms if clearly
historical.

Do not use brittle global bans that prevent honest history.

Current-contract stale hit count: 0.

## 42. OPENAPI ARTIFACT

Publish/verify canonical OpenAPI v1.

Public link must work. Schema must validate. No dead public route. No
operator/internal-only route. No merchant-internal route unless genuinely
Developer public.

Examples use synthetic placeholders only.

## 43. POSTMAN / OTHER ARTIFACTS

Evaluate current auxiliary artifacts.

If Postman collection remains useful: update; test; assign ownership. If
stale/redundant: remove it.

Apply the same principle to: manifests; static curl collections; old generated
examples; retired SDK artifacts.

Every published artifact must have: purpose; owner/source of truth; test or
validation path.

## 44. DOCUMENTATION EXAMPLES ARE CODE

Extract and test runnable examples.

TypeScript: compile/test. Python: parse/test where appropriate. PHP: lint/test.
Go: compile/test if current examples exist. Dart/Flutter: analyze/test if
current examples exist. curl: validate method/path/fields against current
contract. JSON: parse/schema-check where relevant.

Never allow code examples to rot silently.

Required: `DOC_CODE_EXAMPLES_TESTED=PASS`.

## 45. LIVE SANDBOX QUICKSTART SMOKE

Run the complete public Quickstart from a clean fixture/environment.

Follow documentation EXACTLY. No hidden knowledge.

If documentation omits a necessary step: GAP. If command fails: GAP. If SDK
example is stale: GAP. If user must know undocumented scope/field/state: GAP.

Cleanup.

Required: `DOC_QUICKSTART_E2E=PASS`, `DOC_QUICKSTART_RESIDUE=0`.

## 46. DOA DOCUMENTATION ACCEPTANCE — BUILD THE MISSING HARNESS

A previous conformance attempt established there was no dedicated
`DOA_DOC_TUTORIAL_E2E` harness. That is a real GAP. Build it now.

The harness/test journey must prove, using the public DOA reference
documentation as the guide: Project setup; Financial Setup; SDK installation/use;
payment; webhook; receipt/proof; settlement.

A competent engineer unfamiliar with DOA must be able to reproduce the
integration pattern using public documentation only.

Rules: fresh equivalent fixture; no special DOA tenant branch; no direct DB
mutation; no private endpoint; no hidden repository instruction; no unpublished
SDK; no invented credentials.

If operator review is legitimately required: use canonical workflow.

After completion: cleanup.

Required: `DOA_DOC_TUTORIAL_E2E=PASS`, `DOA_DOC_TUTORIAL_RESIDUE=0`,
`DOA_DOC_SPECIAL_CASES=0`.

## 47. SECURITY OF THE DOCUMENTATION ITSELF

Scan public pages; source docs; examples; screenshots; downloadable artifacts
for: real API keys; old API keys; webhook secrets; OTP values; tokens; session
secrets; private UUIDs; private proof references; private hostnames; database
names; internal IPs; origin IP; real personal data not intentionally public.

Run secret scanning/gitleaks.

Required: `PUBLIC_DOC_REAL_SECRETS=0`, `PUBLIC_DOC_PRIVATE_IDENTIFIERS=0`.

## 48. CLAIM SAFETY

Search for claims containing or implying: available; verified; instant;
automatic; complete; production; live; secure; real-time; supported; guaranteed;
always.

Verify each material claim against current product/runtime.

Avoid: 100% secure; zero bugs; always. Use precise technical language.

Financial LIVE must remain accurately described. Settlement must not be
described as automatic if current DOA/Banzami flow requires an explicit action.

Required: `PUBLIC_DOC_UNSUPPORTED_CLAIMS=0`.

## 49. API VERSION POLICY

Canonical public statement: Banzami Public API v1. No v2.

SDK package versions are independent from API version. Explain only where
useful.

Required: `DOCS_CURRENT_API_VERSION=v1`, `DOCS_V2_REFERENCES=0`.

## 50. STATUS BADGES

Use status labels sparingly.

Canonical environment status: Sandbox: Available. Financial Live: Unavailable.

Do not label current normal public capabilities preview; experimental; demo —
unless they genuinely are.

If capability is public/current: document as current. If not public: do not
present it as usable.

## 51. RATE LIMITS

Document stable public rate limits where they are part of the public developer
contract.

Do not expose sensitive internal defensive implementation details unnecessarily.

Explain 429; Retry-After where currently applicable.

Ensure docs do not contradict edge/application rate-limit behaviour.

## 52. PAGINATION / FILTERING / SORTING

For public list endpoints that support them, document: pagination; cursor
semantics; filters; sorting.

Do not document unsupported query parameters. Use current field names.

## 53. TIME

Document timestamp semantics. Wire/API time: UTC.

Explain SDK parsing where relevant. Console may render local timezone.

Do not conflate display timezone with financial event time.

## 54. IDENTIFIERS

Explain identifiers developers should persist where relevant: Project ID;
resource IDs; their own `reference_id`; event ID; receipt/proof reference.

Explain what IDs are NOT authority.

Never teach internal owner/merchant/root-wallet UUID usage.

## 55. TROUBLESHOOTING

Provide practical guides for current likely integration failures: API key → 401;
403 authorization/scope; Project not financially ready; payment remains pending;
webhook not arriving; webhook signature invalid; idempotency conflict; 429;
receipt/proof unavailable; refund refused; settlement not ready.

For each: likely causes; how to inspect; which Console surface helps; what
`request_id` to provide support; whether retry is safe; whether same idempotency
key must be reused.

Never ask users to submit secrets.

## 56. SUPPORT

Support documentation must tell developers what to provide: `request_id`;
timestamp; environment; SDK version; operation type; sanitized request details.

Never provide/send: API key; webhook secret; OTP; session token; private signing
secret.

Support CTA must work.

## 57. SEO / DISCOVERABILITY

Public docs are product material.

Verify: meaningful titles; meaningful descriptions; canonical URLs; no
accidental noindex on public docs; authenticated Console remains non-indexable
where required; sitemap contains current docs only; stale docs excluded.

## 58. PERFORMANCE

Docs should remain fast and readable.

Check: reasonable JS payload; optimized images; efficient search; code
highlighting strategy; no unnecessary layout shift; no giant client bundle
solely for static reference.

Use evidence rather than arbitrary performance claims.

## 59. ACCESSIBILITY

Verify deployed documentation with accessibility checks.

Cover: keyboard navigation; skip-to-content where appropriate; heading order;
copy buttons; link names; contrast; tables; code blocks; mobile navigation;
focus visibility; dialogs/menus if any.

Required: `DOCS_ACCESSIBILITY=PASS`.

## 60. RESPONSIVE

Test deployed docs at least at 1440; 1280; tablet; 390 mobile.

Verify: navigation; search; code blocks; tables; API schemas; TOC; language
switch; copy buttons.

Horizontal scrolling is acceptable inside a code block. Whole-page unusable
horizontal overflow is not.

Required: `DOCS_RESPONSIVE=PASS`.

## 61. BROKEN LINKS / ANCHORS

Crawl final deployed docs.

Required: `BROKEN_INTERNAL_DOC_LINKS=0`, `BROKEN_DOC_ANCHORS=0`.

Validate deterministic external links where reasonable. Downloads must work.
Language switch must work. Console links must work.

## 62. DOCS ↔ PRODUCT CROSS-LINKING

Verify contextual links from Console/product where appropriate.

Examples: API Keys → key/security docs. Financial Setup → Financial Setup docs.
Webhooks → webhook docs. Errors → troubleshooting. Workspace Activity →
Workspace Activity/admin-audit explanation if linked.

Docs may link back to relevant Console surfaces. No dead deep links.

## 63. README / REPOSITORY CONSISTENCY

Public docs are primary for external developers.

Repository README/internal docs must not contradict current public docs.

Avoid duplicating entire external manuals internally when a canonical public
page exists. Prefer links to public truth where appropriate.

Retired apps/packages must not remain documented as current.

## 64. DOCUMENTATION SOURCE-OF-TRUTH MODEL

Maintain clear authorities: Public concepts: public docs. Routes/schemas:
OpenAPI. SDK methods/types: SDK source. Events: canonical emitted-event
source/catalogue. Error codes: canonical error definitions. Capability
availability: current authoritative capability/readiness source where
applicable.

Avoid multiple manually maintained copies of the same contract.

## 65. AUTOMATED DRIFT GATES

CI must detect, where applicable: route ↔ OpenAPI drift; OpenAPI ↔ API docs
drift; SDK ↔ SDK docs drift; emitted events ↔ event catalogue drift; error source
↔ error docs drift; PT ↔ EN parity drift; code-snippet failures; broken internal
links; stale retired-contract strings; secret leakage.

The event gate MUST remain bidirectional.

A product change that makes public documentation false must fail CI.

Mutation-prove meaningful gates. Do not create ornamental gates that can never
fail.

## 66. TARGETED FORBIDDEN STALE CONTRACTS

Maintain targeted/current guards against known retired statements, where
appropriate: Console is demo; SDK not published; do not npm install current SDK;
`/v1/business/`; `applicationFeeBps`; retired payment requests; old package
identities; old webhook simulation claims.

Do not globally ban words that have legitimate historical/changelog usage.
Context matters.

## 67. VISUAL DOCUMENTATION QA

Visually inspect deployed key surfaces: Docs home; Quickstart; Console guide;
SDK install; Payments; Webhooks; Settlements; DOA tutorial; API reference;
Errors; Mobile docs.

Look for: clipped code; broken tables; overflow; empty panels; duplicate
headers; stale badges; broken navigation; bad mobile layout; language mismatch.

Do not mark PASS solely because HTML tests passed.

## 68. EXTERNAL DEVELOPER / COLD READER ACCEPTANCE

The original specification defines EXACTLY twelve questions. The existing older
harness had ten. Do NOT reduce the rubric to ten.

Extend/replace it to prove all twelve:

1. What do I create first?
2. Which key goes on the server?
3. How do I install the SDK?
4. How do I create a payment?
5. How do I know it paid?
6. What should I do after a timeout?
7. How do I verify a webhook?
8. What is Sandbox?
9. Can I use Live?
10. How do I refund?
11. How do settlements work?
12. How do I get support?

The reader may use only public documentation. No project memory.

Required: `DOCS_COLD_READER_ACCEPTANCE=12/12`.

## 69. DOA IS A TEACHING DEVICE, NOT A PRODUCT DEPENDENCY

Every DOA example must make clear: REFERENCE IMPLEMENTATION.

Never teach "Banzami behaves this way because DOA does."

Teach "DOA uses this public Banzami contract in this way."

Banzami contract defines DOA integration. DOA cannot define Banzami authority.

Required: `DOA_DOC_SPECIAL_CASES=0`.

## 70. DOCUMENT LIMITS HONESTLY

Do not overpromise. Financial LIVE remains unavailable.

External dependencies such as banking/regulatory/acquiring rails must not be
presented as solved merely because Public Sandbox is ready.

But do not carry limitations that are no longer true.

Every published limitation must be: current; specific; actionable.

## 71. DELETE OLD DOCUMENTATION RATHER THAN ACCUMULATE

Prefer fewer excellent pages over duplicated documentation.

If two pages teach the same thing: merge where appropriate. If obsolete: remove.
If reference can be generated reliably: generate.

Do not leave contradictory old pages live.

## 72. WRITING STYLE

Portuguese: clear; direct; developer-oriented. English: equivalent technical
truth.

Use: short paragraphs; clear headings; concept before jargon; example after
explanation.

Avoid: marketing fluff; internal assurance jargon in beginner docs; unnecessary
regulatory prose; huge warning blocks.

Use callouts consistently: Note; Important; Warning; Sandbox. Do not overuse
them.

## 73. CODE STYLE

Examples must use real current method names; real current field names; real
current package names.

Placeholders must be obviously synthetic.

Use consistent naming such as `project_x`; `order_123`; `idem_order_123`.

Never paste real production-looking secret; stale DB UUID; real private token.

## 74. DOA GUIDE — EXPECTED READER UNDERSTANDING

At the end of the DOA reference guide, the reader should understand:

DOA creates/manages campaign/application business state. DOA asks Banzami for a
payment experience. The payer pays through Banzami. Banzami owns financial
truth. Webhook informs DOA of financial/application events. DOA updates its own
state idempotently. Banzami provides verifiable receipt/proof semantics.
Campaign closes. Settlement applies operator-governed pricing. Beneficiary
receives net. Application fee destination receives fee where applicable.

The developer should be able to reproduce the pattern for another app.

## 75. FINAL QUICKSTART ACCEPTANCE

From a completely clean external environment: install current official SDK;
create client; check identity/readiness; create payment journey; open payment;
observe/receive event; read result; inspect Console; cleanup. PASS.

No source checkout. No local SDK. No hidden/private docs.

Required: `DOC_QUICKSTART_E2E=PASS`, `DOC_QUICKSTART_RESIDUE=0`.

## 76. FINAL DOCUMENTATION REGRESSION

After the LAST documentation/source change run the applicable complete
regression: website typecheck; website tests; website build; docs link crawler;
anchor check; code extraction/example tests; SDK examples; OpenAPI validation;
route drift; event drift; error drift; PT/EN parity; accessibility; responsive;
secret scan; gitleaks; runtime Quickstart; DOA tutorial E2E; cold-reader 12/12.

No required skip.

## 77. DEPLOYMENT

After the final docs change: commit.

Require CI according to repository policy on the exact applicable SHA.

Deploy developers.banzami.com docs. Verify source/runtime parity.

Then test the DEPLOYED documentation. Do not accept only local proof.

Confirm no stale CDN/cache content remains. Canonical public docs pages must
return expected statuses.

## 78. FINAL ACCEPTANCE MATRIX

The final report MUST evaluate and prove:

```
PUBLIC_DOC_SINGLE_TRUTH=PASS
PUBLIC_DOC_STALE_CLAIMS=0
PUBLIC_DOC_LEGACY_CONTRACTS=0
DOCS_CURRENT_API_VERSION=v1
DOCS_V2_REFERENCES=0
DOCS_CONSOLE_COMPLETE=PASS
DOCS_WORKSPACE_COMPLETE=PASS
DOCS_PROJECT_COMPLETE=PASS
DOCS_FINANCIAL_SETUP_COMPLETE=PASS
DOCS_API_KEYS_COMPLETE=PASS
DOCS_WEBHOOKS_COMPLETE=PASS
DOCS_PAYMENT_SESSIONS_COMPLETE=PASS
DOCS_PAYMENT_LINKS_COMPLETE=PASS
DOCS_QR_PAYMENTS_COMPLETE=PASS
DOCS_REFUNDS_COMPLETE=PASS
DOCS_SETTLEMENTS_COMPLETE=PASS
DOCS_RECEIPTS_COMPLETE=PASS
DOCS_SDK_CURRENT=PASS
PUBLIC_SDK_INSTALL_FROM_REGISTRY=PASS
DOC_ENDPOINTS_NOT_IN_OPENAPI=0
OPENAPI_ENDPOINTS_UNDOCUMENTED=0
ROUTE_OPENAPI_DOC_DRIFT=0
DOC_EVENTS_MISSING=0
DOC_EVENTS_NOT_EMITTED=0
DOC_EVENT_CATALOGUE_PT_EN_DRIFT=0
DOC_ERRORS_MISSING=0
DOA_REFERENCE_IMPLEMENTATION=PASS
DOA_DOC_TUTORIAL_E2E=PASS
DOA_DOC_TUTORIAL_RESIDUE=0
DOA_DOC_SPECIAL_CASES=0
DOC_CODE_EXAMPLES_TESTED=PASS
DOCS_PT_EN_PAGE_PARITY=PASS
DOCS_PT_EN_CONTRACT_PARITY=PASS
PUBLIC_DOC_REAL_SECRETS=0
PUBLIC_DOC_PRIVATE_IDENTIFIERS=0
PUBLIC_DOC_UNSUPPORTED_CLAIMS=0
BROKEN_INTERNAL_DOC_LINKS=0
BROKEN_DOC_ANCHORS=0
DOCS_ACCESSIBILITY=PASS
DOCS_RESPONSIVE=PASS
DOCS_COLD_READER_ACCEPTANCE=12/12
DOC_QUICKSTART_E2E=PASS
DOC_QUICKSTART_RESIDUE=0
```

## 79. FINAL REPORT

Produce ONE final report. No intermediate report unless a genuinely human-only
ceremony blocks further execution.

Include: `FINAL_BANZAMI_SHA`; `FINAL_DOA_SHA`; `FINAL_DOCS_SHA` if distinct;
CI/applicable build status; deployed docs parity.

Old docs audit: pages kept; pages rewritten; pages created; pages removed.

New/current IA. Quickstart E2E. Console documentation coverage. SDK coverage.
API/OpenAPI coverage. Event catalogue coverage. Error catalogue coverage. DOA
reference implementation. DOA tutorial E2E. PT/EN parity. code-example results.
link/anchor results. accessibility. responsive. visual QA. security scan. claim
safety. cold-reader 12/12. drift-gate coverage. full 0–81 conformance table.
final acceptance matrix.

Known remaining documentation defects: NONE.

## 80. VERDICT

Only if `DOCS_PROD_001_GAPS=0` and all mandatory final counters are green:

DOCS-PROD-001 FULLY CONFORMANT

BANZAMI DEVELOPERS DOCUMENTATION READY FOR PUBLIC RELEASE
— one canonical developer truth
— Public API v1 only
— zero known stale public contracts
— zero known documentation/product contradictions
— zero broken public documentation journeys
— DOA canonical reference implementation
— examples tested against current contracts

DOA: CANONICAL REFERENCE IMPLEMENTATION — no Banzami tenant special-casing

Financial LIVE: NOT READY / FAIL-CLOSED

NO FREEZE. NO TAG. Report first.

## 81. FINAL PRINCIPLE

A developer must be able to arrive at `https://developers.banzami.com/docs`
knowing nothing about Banzami and leave knowing:

WHAT Banzami is; HOW the model works; HOW to create/sign in to an account; HOW
to create and configure a Workspace; HOW to create and configure a Project; HOW
to obtain Financial Setup/readiness; HOW to obtain and protect an API key; HOW
to install the official SDK; HOW to make a payment; HOW to use Payment Links /
QR where applicable; HOW to handle webhooks; HOW to verify webhook signatures;
HOW to use idempotency correctly; HOW to refund; HOW settlements work; HOW to
verify a receipt/proof; HOW to debug errors; HOW to rotate credentials; HOW to
understand Sandbox vs Live; HOW to get support.

Without: Slack; email from Banzami staff; private repository access; hidden
documentation; internal database knowledge; tribal knowledge.

The public documentation itself must be sufficient to build a correct
integration.
