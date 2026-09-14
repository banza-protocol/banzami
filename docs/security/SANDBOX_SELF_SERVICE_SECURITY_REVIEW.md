# Sandbox self-service — security review

**Milestone:** SANDBOX-SELF-SERVICE-001 · **Date:** 2026-09-14 · **Scope:** the
surfaces ADR-060 added to the Public Sandbox. Financial LIVE is NOT READY /
FAIL-CLOSED and is out of scope except where a Sandbox surface could reach it.

**Method.** Code read of every new route and its authority chain; adversarial
end-to-end runs against the deployed Sandbox through Cloudflare and nginx
(`tools/e2e/sandbox/realtime-isolation-e2e.mjs`, `self-service-e2e.mjs`);
each control that a finding produced is held by a test that was shown to fail
with the control removed (mutation-proven). The realtime channel has its own
threat model: [REALTIME_STATUS_THREAT_MODEL.md](REALTIME_STATUS_THREAT_MODEL.md).

## Findings and their fixes

| # | Severity | Finding | Fix | Proof |
|---|---|---|---|---|
| SSR-1 | High | **Test value could leave the Sandbox's test perimeter.** A test payer received a PIN and could sign in to the consumer surface; from there it could pay any Business and send to any consumer, with value issued outside the Sandbox-wide funds cap — Project after Project, from one self-service account. A synthetic Business could also settle to any consumer, or name a real application's Business as its fee destination. Real Sandbox tenants (including an application's canonical tenant holding live data) could have received fictitious value at will. | public-api issues no PIN, refuses sign-in to a test payer (`403 TEST_PAYER_SIGN_IN_UNAVAILABLE`) and refuses any session it already held; Core refuses a synthetic Business's settlement unless the beneficiary is an unretired test payer or a synthetic Business and the fee destination is a synthetic Business (`422 SANDBOX_VALUE_PERIMETER`). Contract, SDK types, Console and guides no longer promise a PIN. | `847bf530`; real-DB tests `TestVerify_ATestPayerDoesNotSignIn`, `test_value_stays_among_test_payers_and_test_businesses`; deployed isolation step 14 |
| SSR-2 | Medium | **Unbounded self-service creation.** Anyone with a mailbox signs in; each Project's Sandbox setup provisions a Business, a wallet and ledger accounts in Core; nothing bounded workspaces or projects per account (archive, create again). | At most 10 active workspaces per user (20 created a day) and 25 active projects per workspace (50 a day); archiving frees an active place, not the day's allowance (`429 WORKSPACE_LIMIT_REACHED` / `PROJECT_LIMIT_REACHED`). The busiest account had 2 and 1. | `e3a82499`; `TestLimits_*`, `TestPgStore_CreationCounts` |
| SSR-3 | Medium | **Test webhook deliveries as an on-demand amplifier.** A test event is a signed request, with retries, to a URL the developer chooses; it could be sent at a key's 120 requests a minute, and a succeeded test delivery replayed through the API or the Console. | Synthetic deliveries — sends and replays, gateway and developer-api — are bounded to 10 a minute per endpoint under one advisory lock (`429 WEBHOOK_TEST_RATE_LIMITED`, `Retry-After: 60`). Endpoint URLs keep the existing SSRF rules (https, public host, re-checked at delivery; RA-023). | `1ff83ca3`; real-DB tests in both services; deployed isolation step 15 |
| SSR-4 | Low | **API Explorer path values.** `.` and `..` matched the path-value character class and became their own segment, which the gateway cleans into a redirect to another route; the broker's HTTP client followed redirects carrying the minted key. The minted key's single scope bounded the effect. | Dot-only values refused; redirects answered, never followed. | `a2bc64f9`; `TestExplorer_RunsOnlyWhatThePublishedContractDescribes`, `TestExplorer_ARedirectIsAnsweredNotFollowed` |
| SSR-5 | Low (availability) | **Realtime places held by dead connections.** Behind Cloudflare an abandoned stream kept its place until the 15 s heartbeat; a page reloaded three times was refused a stream for 15.7 s. | Heartbeat 5 s, `Retry-After` names it; docs drift-gated to the constant. | `c6118fec`; `TestRealtime_HeartbeatBoundsHowLongADeadStreamHoldsItsPlace`; deployed realtime step 12 (5.2 s) |

No finding is open.

## Controls reviewed, by surface

### Environment separation
- One developer platform, two financial environments. Keys are minted
  Sandbox-only (`bz_test_`); a request naming `environment: LIVE` is refused
  `400` and no `bz_live_` key exists (deployed isolation step 12). The Live host
  answers a Sandbox key with `503` (step 13) — Live is fail-closed, not merely
  unauthenticated. Realtime tokens carry an environment claim.
- `SANDBOX_CREDENTIAL_CAN_ACCESS_LIVE=0`, `LIVE_CREDENTIAL_CAN_BE_MINTED_IN_SANDBOX=0`.

### Synthetic Sandbox Business
- `kyb_status = SANDBOX_SYNTHETIC`, never `APPROVED`; Core refuses to write it in
  LIVE. Payouts and every gate that reads `APPROVED` still read only `APPROVED`,
  so a synthetic Business cannot pay out. It has no Business App user (its address
  is `sandbox+<project>@projects.banzami.test`). The Console and API show it as
  unverified (`verified: false`).
- Classification and pricing come from the use case by policy
  (STANDARD → MERCHANT / `sandbox-default`; APPLICATION → APPLICATION /
  `sandbox-reference`); no operator step, no body field chooses them.

### Test payers
- Project-owned: every read and write resolves the payer through the key's
  Project; another Project gets `404` for read, fund, pay and retire (deployed
  step 5) and sees none in its lists (step 6).
- Pays only its Project's own Business: the gateway names the payee from the
  session, link or QR and refuses another merchant's (`404`, step 3).
- Quotas per Project (10 active, 10 000 Kz grant, 25 000 Kz top-up, 50 000 Kz
  balance, 20 top-ups and 100 000 Kz a day); the value perimeter (SSR-1) bounds
  where that value can go.
- `simulate` outcomes change nothing (`DECLINED`, `PROVIDER_UNAVAILABLE`) or
  execute once and answer ambiguously (`TIMEOUT`, the real result kept 24 h under
  the Project and `Idempotency-Key`).

### API Explorer
- The browser never holds a key. developer-api mints a Sandbox key with only the
  operation's scope, 60 s life, `purpose = EXPLORER` (hidden from key lists,
  refused for key management), calls the gateway, revokes it on a context the
  caller cannot cancel; the schema refuses an EXPLORER key without an expiry.
- Only operations in the allowlist generated from the published OpenAPI; path
  values by pattern (and SSR-4), declared query parameters only (≤ 256 chars), a
  JSON object body only where the operation has one, bounded body and response.
- Owner, admin or developer role; viewers and outsiders refused (`403`/`404`,
  deployed step 10). 30 requests a minute per Project. Signing secrets redacted;
  a response containing the minted key is discarded. Logged as `API_EXPLORER`.

### Webhook workbench
- `webhook.test` is synthetic (`synthetic: true`), not subscribable, not one of
  the seven financial events, delivered only to the endpoint named; another
  merchant's endpoint, events, deliveries and replays are `404` (deployed step 7).
- Bounded per endpoint (SSR-3).

### Reset
- Owner or admin; typed confirmation `RESET`; Sandbox only; at most 5 a day per
  Project (audit log). Retires test payers and cancels open sessions and links by
  balanced postings — no row is deleted, no balance edited; the ledger and audit
  history stay. Touches only the Business the Project owns (a shared Business is
  not reset by the Project it was shared with — application journey step 17).
  Another developer's reset of a Project is `404` (deployed step 11).

### Sharing a synthetic Business
- Owner or admin of the owning Project issues a code; only a `SANDBOX_SYNTHETIC`
  Business can be shared this way; the issuing Project cannot redeem its own code.
- 12 characters over a 31-letter alphabet (~59 bits), 10-minute life, single use,
  earlier unredeemed codes shortened on issue; a wrong code is indistinguishable
  from an expired one and nothing about the Business is disclosed before
  redemption.

### Request logs and Activity
- API logs (per Project, source `API` / `API_EXPLORER`) and workspace Activity
  are distinct stores and pages; logs carry no key or body secrets.

### Tenant isolation, summarised
Deployed isolation run 16/16 on 2026-09-14: sessions (read, link, QR), payments
by another Project's payer, refunds, test payers, lists, webhook endpoints,
events, deliveries and replays, realtime tokens as API credentials, a second
developer on the first developer's Project, logs, Explorer, reset, share code,
Live keys and the Live host, the value perimeter and the test-delivery bound.
`SANDBOX_CROSS_TENANT_ACCESS=0`.

## Residual risks, accepted

- **A Project bound to a real Business by that Business's consent** can create
  test payers and pay test value into its own Business. The value stays inside
  the tenant that consented; it is that tenant's own data.
- **Self-service sign-up is open by design.** Limits bound what one account
  creates (SSR-2); many mailboxes are bounded by OTP rate limits and the
  per-account limits, not by identity verification.
- **A realtime token leaked from a merchant's page** reads one session's public
  status for at most 30 minutes (threat model, residual risks).
