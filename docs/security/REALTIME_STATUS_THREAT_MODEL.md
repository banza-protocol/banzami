# Realtime payment status — threat model

**Status:** in force for the Sandbox (ADR-060 §9, REALTIME-001). Financial LIVE is
NOT READY / FAIL-CLOSED; nothing here makes it available.
**Implementation:** `services/api-gateway/internal/handler/realtime.go`,
`services/api-gateway/internal/service/realtime_token.go`; clients
`apps/pay/lib/realtime-status.ts`, `apps/website/lib/realtime-status.ts`,
`sdk/typescript/src/realtime.ts`.
**Deployed proof:** `tools/e2e/sandbox/realtime-isolation-e2e.mjs realtime | isolation | expiry`.

## What the channel is

`GET /v1/realtime/payment-sessions/{id}` tells a browser page what state one
Payment Session is in — as a JSON snapshot, or as a Server-Sent Events stream
(`retry`, `snapshot`, `status` on each change, a `: heartbeat` comment every
5 s, `expired` when the token ends; closed after a terminal status).

It is **for the screen, not for money.** It is not financial authority: a
merchant fulfils on the signed `payment_session.paid` webhook or on a `GET`
its backend makes with its key. The ledger is the only truth; the channel reads
the canonical session and repeats it.

```
merchant backend ── key ──▶ POST /v1/payment-sessions ──▶ session + realtime.token (bzst_)
        │                                                        │
        └── hands the token to its page ──▶ browser ── Authorization: Bearer bzst_ ──▶ realtime route
                                                     (never the key, never in a URL)
```

## Assets

| Asset | Why it matters |
|---|---|
| A session's public status (`session_id, status, amount_minor, currency, expires_at, terminal, observed_at`) | What a payer's screen shows. Low sensitivity, but it must not be readable for sessions the holder was not given. |
| The Project secret key | Must never reach a browser. The channel exists so a page does not need it. |
| Merchant, wallet, account, Project, binding identifiers | Must not leak through a public route. |
| Gateway capacity | A public, unauthenticated-by-key route is a denial-of-service surface. |

## The token

- `bzst_` + base64url(`{"sid", "env", "exp"}`) + `.` + HMAC-SHA256 signature.
- The key is derived from the gateway signing secret with a domain label
  (`banzami/realtime-status-token/v1`), so a status token is never a valid
  signature for anything else the secret signs, and nothing else is a status token.
- Bound to **one session** (`sid`, constant-time compare) and **one environment**
  (`env`: a Sandbox token is invalid on a Live gateway and the reverse).
- Lives **30 minutes** (`RealtimeTokenTTL`); a token claiming more than the
  ceiling (+1 min skew) is rejected as not minted here. A policy test holds both
  at or below 30 minutes.
- Read-only: it opens the status route and nothing else (`/v1/me`, a session read
  and the Console all answer `401` to it — deployed isolation step 8).
- Minted only where the session's owner reads it with its key.

## Threats and what answers them

| # | Threat | Control | Proof |
|---|---|---|---|
| T1 | Token leaks through access logs, proxies, browser history or `Referer` | Header only. A `token` or `access_token` query parameter is refused `400 REALTIME_TOKEN_IN_URL` **even when valid**, before it is verified. EventSource (which cannot send headers) is not supported; clients use `fetch` streaming. Access logs are redacted (`bz_redacted`). | unit `TestRealtime_AuthorizationRefusals`; deployed realtime step 3; pay page: no query string on the stream request (browser check) |
| T2 | Forged or altered token | HMAC-SHA256, constant-time comparison; malformed, unsigned or re-signed tokens → `401 REALTIME_TOKEN_INVALID` | unit token tests; deployed step 4 (tampered signature, an API key in its place) |
| T3 | A token used on another session (enumeration, confused deputy) | `sid` binding → `403 REALTIME_TOKEN_WRONG_RESOURCE`; an unknown id with a valid token is the same 403, so ids cannot be probed | deployed step 5 |
| T4 | A Sandbox token on Live, or the reverse | `env` claim checked → invalid | unit `realtime_token_test.go` |
| T5 | A stolen token read for longer than intended | 30-minute life, `expired` event closes the stream, refused afterwards with `401 REALTIME_TOKEN_EXPIRED`; re-reading the session with the key mints a new one | deployed `expiry` mode (31 min) |
| T6 | Cross-origin abuse | CORS `*` **without credentials**: no cookie is ever involved, so any origin gains only what the bearer token already grants its holder. Methods `GET, OPTIONS`; headers `Authorization, Accept, Last-Event-ID` | deployed step 7 (preflight from an arbitrary origin: no `Allow-Credentials`, GET only) |
| T7 | Information disclosure | The response is a fixed struct of public fields; no merchant, wallet, account or Project id | unit `TestRealtime_SnapshotIsPublicFieldsOnly`; deployed step 6 |
| T8 | Caching of a status by a proxy or CDN | `Cache-Control: no-store` on snapshots, `no-cache, no-transform` on streams, `X-Accel-Buffering: no` | deployed steps 6 and 8 |
| T9 | Denial of service by opening streams | 3 streams per session, 20 per client (IPv4 address / IPv6 /64), 120 requests a minute per client (Redis), `429 REALTIME_STREAM_LIMIT` with `Retry-After`. **One watcher per session** reads the canonical session once a second for every tab watching it: database load follows sessions watched, not connections. | unit `TestRealtime_PerSessionStreamLimit`; deployed steps 11–12 |
| T10 | Dead connections holding places (reloaded pages behind Cloudflare) | The origin learns a client left only when a write fails; the heartbeat is 5 s, so an abandoned stream frees its place within one beat and `Retry-After` names the same interval. Found on the deployed Sandbox: at 15 s a page reloaded three times was refused for 15.7 s. | unit `TestRealtime_HeartbeatBoundsHowLongADeadStreamHoldsItsPlace` (mutation-proven); deployed step 12 (freed in 5.2 s) |
| T11 | Streams outliving the server's write timeout, or never ending | The route clears its write deadline and bounds itself: terminal status, token expiry, client close. A stream opened on a terminal session sends its snapshot and closes. | deployed steps 13–14 |
| T12 | The page trusting the channel as proof of payment | Documented at every mention (guide, reference, OpenAPI, SDK): fulfil on the signed webhook or a backend `GET`. The hosted pay page only changes what it shows. | docs gates; `REALTIME_IS_FINANCIAL_AUTHORITY=0` |
| T13 | The channel down or blocked (corporate proxy, old browser) | Clients fall back to reading status by polling every 5 s; a refusal about the token or session ends the stream (no retry storm), a 429 or 5xx backs off (3 s × failures, at most 5). | `apps/pay` and SDK realtime tests |
| T14 | A special tenant path | None. DOA, like every application, gets the token from its own session read. `DOA_REALTIME_SPECIAL_CASES=0`. | no tenant name appears in the handler, the token service, the three clients or the pay page (`git grep -i doa`, 2026-09-14); the DOA tutorial E2E reports `DOA_DOC_SPECIAL_CASES=0` |

## Residual risks, accepted

- **A leaked token is readable until it expires.** It shows one session's public
  status for at most 30 minutes; there is no per-token revocation. Rotating the
  gateway signing secret invalidates every token at once (clients re-read the
  session).
- **Carrier-grade NAT.** Many Angolan mobile subscribers share an address; the
  20-streams-per-client limit is counted per address. Past it a page falls back to
  polling, which is slower but correct. `banzami_realtime_stream_events_total{outcome="rate_limited"}`
  is the signal to raise the limit or key it differently.
- **Wildcard CORS** lets any site that holds a token read that session's status.
  That is the token's purpose; no credential or cookie is exposed.

## Observability

- `banzami_realtime_active_streams` (gauge) and
  `banzami_realtime_stream_events_total{outcome}` — `token_in_query`,
  `unauthenticated`, `invalid`, `expired`, `wrong_resource`, `rate_limited`,
  `token_expired_close`, and the lifecycle outcomes.
- Structured logs `realtime.stream_opened` / `realtime.stream_closed` (reason,
  status, seconds). The token is never logged.

## Measured on the deployed Sandbox (2026-09-14, through Cloudflare and nginx)

| Measure | Result |
|---|---|
| PAID event after the payment request | p50 901 ms, max 980 ms (5 samples) |
| Hosted pay page, payment made from another device | page showed "Pagamento confirmado!" 827 ms after the payment request, no reload, no polling |
| Heartbeat interval observed | 4.9 s |
| Abandoned stream place freed | 5.2 s |
