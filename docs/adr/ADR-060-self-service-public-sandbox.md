# ADR-060 — The Public Sandbox is self-service: synthetic Sandbox Businesses, test payers, simulated rail outcomes and tooling, with no operator in the path

Version: 1.0
Status: Accepted
Date: 2026-09-13
Supersedes, for the Sandbox only: ADR-058 §"Nothing is approved on submit — in the Sandbox too" for Developer Projects.
Relates to: ADR-028 (application Business Account), ADR-046/047 (developer keys, Project binding), ADR-051/056 (webhooks), ADR-054 (request logs), ADR-055 (binding seal), ADR-057 (readiness), ADR-058/059 (Business lifecycle, one KYB authority), ADR-048 (pilot limits)

## Context

SANDBOX-SELF-SERVICE-001 sets the contract: a developer who has never used
Banzami builds and tests a complete integration in the Public Sandbox with no
Banzami employee in the path. The baseline
(`docs/quality/SANDBOX_SELF_SERVICE_001_BASELINE.md`) found four blockers: a
Developer Project's Business needs BANZADMIN approval, classification and
pricing; a payer needs support; fictitious value is capped for the whole
Sandbox; and there is no interactive tooling (API Explorer, realtime status,
webhook test event, rail scenarios, reset).

ADR-058 retired the earlier one-click Sandbox setup for a good reason: it wrote
`kyb_status = APPROVED` for a Business nobody reviewed, creating a second KYB
authority. The self-service Sandbox must not bring that back. A Sandbox
Business is a **synthetic test entity**; it must never read as a reviewed one.

## Decision

### 1. Two ways a Project gets a Business, by environment

| | Public Sandbox | Financial LIVE |
|---|---|---|
| New Business | **Provisioned synthetically, immediately**, from a chosen use case | Application → BANZADMIN review (ADR-058), unchanged |
| Existing Business | Connected with a consent code issued by the Project that owns it (Console) or by the Business App | Consent code from the Business App, unchanged |

The public Business application (banzami.com/comerciantes/candidatura) and
BANZADMIN review are unchanged in both environments. What changes is that a
Developer Project in the Sandbox no longer goes through them.

### 2. A synthetic Sandbox Business is one Core operation

`POST /internal/v1/sandbox/businesses` (Core, internal key, **refuses outside
Sandbox on Core's own reading of the environment**) with
`{ project_id, use_case, display_name }`:

1. idempotent on `project_id` — a retry finds and completes the same Business;
2. creates the merchant (name derived from the Project, email
   `sandbox+<project>@projects.banzami.test`), its AOA wallet and PRIMARY account;
3. registers a handle derived from the Project (never chosen by the developer);
4. writes `merchant_compliance.kyb_status = 'SANDBOX_SYNTHETIC'` — a new status
   value, not `APPROVED`. `merchants.verified` stays false (the 0122 projection
   only sets it for `APPROVED`), so receipts, handle lookup and BANZADMIN keep
   showing an unverified test entity;
5. applies the **Sandbox use-case policy**, owned by Core:

   | use_case | business_account_type | pricing profile |
   |---|---|---|
   | `STANDARD` | `MERCHANT` | `sandbox-default` |
   | `APPLICATION` | `APPLICATION` | `sandbox-reference` |

   The developer chooses a use case. Core chooses the classification and the
   profile. No request field carries a rate, a type or a profile code.
6. audits `SANDBOX_BUSINESS_PROVISIONED` with the use case, type and profile.

developer-api's `POST /projects/{id}/financial-setup` (OWNER/ADMIN, CSRF) takes
`{ use_case }`, calls this once, and binds the Project (ADR-047) as before.
Changing the use case of a bound Project is a new operation with the same
policy (`PUT /projects/{id}/financial-setup/use-case`), refused once the binding
is sealed (ADR-055) — the pricing of a Business that already moved money is not
re-decided by its developer.

### 3. `SANDBOX_SYNTHETIC` in the fee-destination rule

ADR-028 requires an application-fee destination to be KYB-approved and
APPLICATION/PLATFORM. Core's fee-destination evaluation now reads KYB as
eligible when `kyb_status = 'APPROVED'`, **or** when the environment is Sandbox
and `kyb_status = 'SANDBOX_SYNTHETIC'`. In LIVE the second branch cannot be
taken, and Core refuses to write the status there in the first place. Payouts
and every other gate that reads `APPROVED` keep reading `APPROVED` only.

### 4. Test payers are Project-owned consumers on the real payment path

Public, developer-key, Sandbox-only (gateway `/v1/sandbox/test-payers`):

- `POST` creates a consumer through public-api's registration path with a
  generated handle (`tp` + random), display name "Sandbox test payer", and the
  Sandbox registration grant. Ownership is recorded
  (`sandbox_test_payers(consumer_id, project_id, …)`); the Project comes from
  the authenticated key, never the body. A PIN is generated and returned once,
  so the payer can sign in on the hosted page like a real payer.
- `GET` lists/reads the Project's own payers; `DELETE` retires one (value
  retired by balanced posting, consumer suspended).
- `POST …/{id}/fund` adds fictitious value within per-Project quotas.
- `POST …/{id}/payments` pays a Payment Session, Payment Link or QR reference
  **as that payer**, through public-api's own consumer payment handler — the
  same code a person's wallet uses. The gateway holds no second payment
  implementation.

A test payer of Project A is invisible to Project B: every route resolves the
payer through `project_id = <key's project>` and answers `404` otherwise.

### 5. Deterministic outcomes: real where Banzami has them, explicit simulation where it does not

Banzami wallet payments have no card network or bank to decline them. Outcomes
that are real in the Sandbox are produced by doing the real thing and are
documented as recipes (invalid key/scope/parameter/cursor, idempotent replay and
conflict, concurrent duplicate, insufficient funds via a payer created with
`initial_balance_minor: 0`, refund limits, receipt not found, rate limit, Live
refused).

External-rail outcomes are requested **explicitly** on the test-payer payment:
`"simulate": "DECLINED" | "PROVIDER_UNAVAILABLE" | "TIMEOUT"`. The response says
`"simulated": true`. `DECLINED` and `PROVIDER_UNAVAILABLE` change nothing.
`TIMEOUT` executes the payment and then answers `504 SANDBOX_SIMULATED_TIMEOUT`,
so a client learns the ambiguous-outcome rule: retry with the same
`Idempotency-Key` and read the real result. There are no reserved magic
handles, amounts or phone numbers. `GET /v1/sandbox/scenarios` returns the
catalogue, served from `services/api-gateway/internal/handler/sandbox_scenarios.json`,
which the documentation renders and a drift gate holds to the testing guide.

A payment made as a test payer answers one shape whichever consumer path paid
it — `{ test_payer_id, via, payment_session_id | payment_link_id, status:
"PAID", transfer_id, amount_minor, currency, paid_at, proof_reference,
simulated: false }` — never the payee's link view. The real outcome of a
simulated `TIMEOUT` is kept for 24 hours (Redis) under the Project and the
`Idempotency-Key`, and ANY repeat with that key — with or without `simulate`,
so an SDK's automatic retry of the 504 too — reads it instead of paying again.

### 6. Fictitious value has per-Project quotas

The pilot overlay (ADR-048) stays for per-actor limits. The Sandbox-wide
aggregate funds cap does not apply to the registration grant and test-payer
funding of synthetic payers, because one developer could otherwise exhaust
funding for every other developer. Instead: at most 10 active test payers per
Project, a grant of at most 10 000 Kz each (`initial_balance_minor`, default
1 000 000 minor units), at most 25 000 Kz per top-up, a 50 000 Kz balance per
payer, and at most 20 top-ups and 100 000 Kz of top-ups per Project per 24
hours; counted per Project and answered with `429 SANDBOX_QUOTA_EXCEEDED`. A
top-up exceeding the payer's balance cap answers `422 SANDBOX_FUNDING_REFUSED`.

### 7. API Explorer is a server-side broker

The browser never holds a Project secret. The Console posts
`{ operation_id, path_params, query, body, idempotency_key }` to developer-api
(`POST /projects/{id}/explorer/requests`, session + CSRF). developer-api:

1. accepts only operation ids from an allowlist generated from the published
   OpenAPI (method + path template + scope), never a URL;
2. mints a Sandbox key for the Project with **only the operation's scope**,
   `purpose = 'EXPLORER'`, `expires_at = now() + 60 s`, created by the signed-in
   user; the secret exists in memory for this request only;
3. calls the configured Sandbox gateway base URL with that key — the ordinary
   public authorization path: scopes, Financial Setup, tenant isolation;
4. revokes the key and returns status, headers of interest (`request_id`),
   body and latency.

Explorer keys are hidden from the key list, refused by key authorisation at and
after `expires_at` whether or not revoked, and cannot be rotated or revoked
through the Console's key routes (rotating one would mint a STANDARD key with
its scopes). Their requests appear in the Project's API logs with
`source: API_EXPLORER` (filterable). Writes carry a caller-visible
`Idempotency-Key`, which the Console generates once per form. Signing secrets in
a response (`secret`) are hidden by the broker and named in `redacted`; a secret
is revealed once on the Webhooks screen, not in a response panel. The broker
runs only on a Sandbox deployment, 30 requests a minute per Project, and the
allowlist (`explorer_operations.json`) is regenerated from the OpenAPI and
checked in CI (`build-explorer-allowlist.mjs --check`): an operation with no
`x-banzami-scope`, or marked `x-banzami-project-key: refused`, is not runnable.

### 8. Webhook test event

`POST /v1/webhooks/endpoints/{id}/test` (public, `webhooks:write`) and the
Console button deliver `type: "webhook.test"` to that endpoint only, signed with
`banza-signature` like every event, recorded with `synthetic = true` in events
and deliveries. It moves no money, is not subscribable, is not one of the seven
financial events, and is documented and drift-gated separately. Delivery replay
(existing) re-delivers the stored event with its original id and never
re-executes an operation. A delivery that succeeded is not replayed — except a
synthetic event's, which moves nothing and exists to be sent again (gateway and
developer-api apply the same rule). An inactive endpoint answers
`409 ENDPOINT_DISABLED`; a non-Sandbox key `403 SANDBOX_ONLY`.

### 9. Realtime payment status

*Revised during REALTIME-001: the token travels in the Authorization header, not
the query string, and the route is `/v1/realtime/payment-sessions/{id}`.*

A Payment Session read with a Project key (create, get, list) carries
`realtime: { token, expires_at, path }`; a session-backed payment link's public
view carries `realtime: { session_id, token, expires_at, path }` for the hosted
page. The token is `bzst_` + base64url(payload) + `.` + HMAC-SHA256: session id,
environment and expiry (at most 30 minutes), under a key derived from the
gateway's signing secret with a fixed label, so it cannot be confused with or
forged from a session JWT. It carries no merchant, Project or payer identifier
and grants nothing a slug does not already grant: the public status of one
session.

One route, mounted by its own function (`mountRealtimeStatus`) so the contract
gates read it as its own credential class (`statusToken` in the OpenAPI):

`GET /v1/realtime/payment-sessions/{id}` with `Authorization: Bearer bzst_…`

- `Accept: application/json` — one snapshot `{ session_id, status, amount_minor,
  currency, expires_at, terminal, observed_at }`;
- `Accept: text/event-stream` — Server-Sent Events: `retry: 3000`, a `snapshot`
  event, a `status` event on each change, a `: heartbeat` comment every 5 s,
  an `expired` event at token expiry; the stream closes after a terminal status
  (PAID, EXPIRED, CANCELLED, FAILED). A reconnect starts from a fresh snapshot
  (there is no `Last-Event-ID` replay: the current state is the whole state).

Refusals: token in the query string `400 REALTIME_TOKEN_IN_URL` (even when
valid — a URL reaches logs, history and `Referer`), missing `401
REALTIME_TOKEN_REQUIRED`, bad signature or foreign environment `401
REALTIME_TOKEN_INVALID`, expired `401 REALTIME_TOKEN_EXPIRED`, another session
`403 REALTIME_TOKEN_WRONG_RESOURCE`. Limits: 3 streams per session, 20 per IP
(`429 REALTIME_STREAM_LIMIT`, `Retry-After` = one heartbeat), 120 requests a minute per IP.
A stream the client abandons keeps its place until the server notices; behind
Cloudflare that is the next failed write, so the 5 s heartbeat is also the
longest a reloaded page waits for a place (it was 15 s, measured on the deployed
Sandbox, until the heartbeat was shortened). CORS allows any
origin without credentials; the preflight is answered by the CORS middleware.
The route is exempt from the 60 s request timeout and clears the write
deadline; the response sets `X-Accel-Buffering: no` for nginx. One watcher per
session reads the canonical session once a second and fans out changes.

Browsers use `fetch` streaming, not `EventSource` (which cannot send a header):
`watchPaymentSessionStatus` in `@banzami/sdk/realtime` refuses anything that is
not a `bzst_` token. The hosted page (apps/pay) and the Console's API Explorer
use the same protocol and fall back to polling at 5 s when no stream is
available. Nothing on this route mutates, and it is not financial authority:
webhooks (signed) and a GET made with the Project key remain what an integration
fulfils on. SSE is chosen over WebSocket because the flow is one-directional,
passes through the existing HTTP edge, and needs no extra infrastructure.

### 10. Reset

`POST /projects/{id}/sandbox/reset` (developer-api, OWNER/ADMIN, typed
`RESET`) calls Core's `POST /internal/v1/sandbox/projects/reset`, which in one
transaction retires the Project's test payers (balance retired by posting,
marked retired, then suspended through the identity lifecycle) and, **only if
the Project owns a `SANDBOX_SYNTHETIC` Business** (read from
`sandbox_businesses` in Core), cancels its open Payment Sessions and Links,
expires their dynamic QRs, retires every account's balance and closes the
non-PRIMARY accounts. A Project merely connected to a Business — a real one, or
another Project's synthetic one — resets only its own payers. Refused while a
settlement is pending (`409 PENDING_SETTLEMENT`). Financial Setup, keys,
webhooks, ledger history and audit history stay. Limited to 5 per Project per
24 hours, counted from the audit log (`429 SANDBOX_RESET_LIMIT`), replay-safe on
the request's key. Nothing is deleted.

A Project shares its synthetic Business with another Project by issuing a
consent code (`POST /projects/{id}/financial-setup/share-code` → the gateway's
`issue-for-project`, which reads ownership itself and refuses any Business that
is not `SANDBOX_SYNTHETIC`); the other Project redeems it through the existing
connect flow. A Project cannot redeem its own code.

### 11. One platform, two financial environments

The Developer Platform is one product with two strictly separated financial
environments. **Public Sandbox**: available, self-service, no operator
approval, fictitious value, `bz_test_` keys. **Financial LIVE**: the same
platform and contracts, with real value, behind institutional approval — NOT
READY and fail-closed. The Console shows both: Sandbox "Disponível"; Live
"Indisponível", requiring institutional approval and not activatable from the
Console. A Sandbox credential opens nothing in Live, and no Live credential can
be minted in the Sandbox. Everything in this ADR — synthetic Businesses, test
payers, simulations, the Explorer, the webhook test event, the reset — is a
Sandbox capability and is compared only with Sandbox capabilities.

### 12. LIVE stays closed on every new path

Every new route checks the Sandbox environment itself (Core, gateway,
public-api, developer-api). Keys stay `bz_test_`; `bz_live_` is refused. No new
route is mounted on a LIVE stack.

## Consequences

- Zero operator actions on the documented Sandbox journey; the DOCS journeys'
  three BANZADMIN ceremonies disappear from the Sandbox.
- A Sandbox Business is visibly a test entity (`SANDBOX_SYNTHETIC`, unverified)
  and never contaminates reviewed-Business counts, KYB queues or verification
  pages.
- The Sandbox no longer tests the LIVE review process for Developer Projects;
  that process is exercised by the public application form and BANZADMIN, which
  are unchanged.
- New migrations: the `SANDBOX_SYNTHETIC` status value, `sandbox_test_payers`,
  explorer key purpose and expiry, synthetic webhook events, the Project's
  Sandbox use case.
- Protocol: nothing here creates a financial concept. `webhook.test` is an
  operator diagnostic delivery with no financial meaning; the signature scheme
  is BANZA's and unchanged.

## Alternatives considered

- **Auto-approve the application in the Sandbox.** Rejected: it recreates the
  unreviewed `APPROVED` records ADR-058 removed.
- **Browser-held delegated Explorer tokens.** Rejected in favour of the broker:
  a token in the browser is a token an extension can read; the broker keeps
  every credential server-side and reuses the ordinary authorization path.
- **Reserved test handles (`test-declined`, …).** Rejected: handles are a global
  public namespace, and a value that silently changes behaviour is the hidden
  magic the milestone forbids. An explicit `simulate` field is visible in the
  request and in the logs.
- **WebSocket status channel.** Rejected: bidirectional transport for a
  one-way status feed, and a second connection type to operate.
