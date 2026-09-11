# services/api-gateway

Go HTTP gateway — authentication, rate limiting, idempotency enforcement, request routing.

## Responsibilities

- CORS enforcement (Go middleware layer — see CORS architecture below)
- Client IP resolution (`X-Forwarded-For`)
- Request ID generation and propagation
- Structured request logging (slog + OpenTelemetry)
- JWT authentication (enforced on all `/v1/*` routes)
- Sliding-window rate limiting (Redis-backed, per API key)
- Idempotency key enforcement for mutating routes (Redis-backed, 24 h TTL)
- Routing to versioned API handlers (`/v1/*`)
- Health and readiness probes
- Sandbox utilities (`/v1/sandbox/*`) — enforced sandbox-only via JWT environment claim
- EMIS acquiring callbacks (`/v1/callbacks/emis`) — HMAC-signed, no JWT
- Public pay-page endpoints (`/public/pay/*`) — no auth, consumed by `apps/pay`

## Structure

```
cmd/gateway/main.go         — entry point, logger init, graceful shutdown
internal/
  config/config.go          — env-var configuration with sensible defaults
  server/server.go          — chi router, middleware stack, route table
  apierror/                 — structured JSON error helpers
  middleware/
    auth.go                 — JWT Bearer verification + principal extraction
    cors.go                 — CORS headers for allowed origins
    idempotency.go          — Redis-backed deduplication for POST/PATCH
    logger.go               — structured per-request log line (slog)
    ratelimit.go            — sliding-window rate limiter (Redis)
    requestid.go            — X-Request-ID generation and propagation
    tracing.go              — route span labelling for OpenTelemetry
  handler/
    health.go               — GET /health (liveness) + GET /readyz (readiness)
    auth.go                 — POST /v1/auth/token
    transactions.go         — transaction CRUD
    wallets.go              — wallet read + balance
    payouts.go              — payout create + list + get
    merchants.go            — merchant CRUD, API key management
    consumers.go            — consumer identity; @banza resolution for a project key
    consumer_wallets.go     — handler kept, routes unmounted (RA-058)
    qr.go                   — QR code create, decode, mark-used
    payment_sessions.go     — payment sessions (merchant JWT or project key)
    payment_links.go        — payment link lifecycle + the public payer view
    wallet_accounts.go      — segregated wallet accounts
    refunds.go              — typed-source refunds
    webhooks.go             — webhook endpoint + event management
    acquiring.go            — EMIS callback + pay-page initiate/confirm
    sandbox.go              — sandbox utilities (fund, simulate, instruments, status)
  service/
    wallets.go              — WalletService interface + stub + CoreApi implementation
    (other services follow the same pattern)
  notify/
    fcm.go                  — Firebase Cloud Messaging push notifications
```

## Route Table

Read from `internal/server/server.go` — the router is the source of truth; this
table is kept in step with it. Routes that are not listed are not mounted (an
unknown path answers `404 NOT_FOUND` in the error envelope). Notably **not
mounted**: `/v1/transfers` (SEC-015 / RA-053), `/v1/payment-requests`
(RA-057) and `/v1/consumer-wallets` (RA-058).

### Public (no credential)

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Liveness — always 200 |
| GET | /readyz | Readiness — checks DB + Redis |
| GET | /metrics | Prometheus metrics |
| GET | /v1/platform-mode | Platform Mode (LIVE / SANDBOX, ADR-025) |
| GET | /v1/public/proofs/{ref} | Public proof verification (exact reference; rate-limited) |
| GET | /public/pay/{slug} · /v1/public/pay/{slug} | Payer-safe payment-link view (no internal ids) |
| GET | /public/pay/{slug}/status · /v1/public/pay/{slug}/status | Has the link's payment been made? |
| POST | /public/pay/{slug}/pay · /v1/public/pay/{slug}/pay | Initiate an acquiring payment (per-IP limited) |
| POST | /public/pay/{slug}/test-confirm · /v1/public/pay/{slug}/test-confirm | Dev-only simulated confirmation |
| GET | /public/profiles/{handle} | Public Business profile |
| GET | /public/consumer-pay-links/{code} | Public P2P pay-request view |
| POST | /v1/callbacks/emis | EMIS acquiring callback (HMAC-signed body, verified in core) |

### Credential exchange (per-IP limited)

| Method | Path | Description |
|--------|------|-------------|
| POST | /v1/auth/token | Exchange a merchant API key for a JWT |
| POST | /v1/merchant/auth/token · /lookup · /refresh · /logout | Business app sign-in (@negócio + PIN) |

### Business onboarding (public, per-IP limited)

| Method | Path | Description |
|--------|------|-------------|
| POST | /v1/merchant/applications/check-handle | Is this @banza available? |
| POST | /v1/merchant/applications | Submit a Business application (30/day per IP) |
| GET | /v1/merchant/application-requirements | The requirements policy |
| GET | /v1/merchant/applications/{id} | The applicant's status view, by full application id |
| POST | /v1/merchant/applications/{id}/resubmit | Answer a request for information |
| POST | /v1/merchant/applications/{id}/documents/upload-url | Presigned document upload |
| POST | /v1/merchant/applications/{id}/documents/{document_id}/confirm | Confirm an upload |
| GET | /v1/merchant/applications/{id}/documents | List the application's documents |
| POST | /v1/merchant/activation/validate | Is this activation link good? |
| POST | /v1/merchant/activation/complete | Set the Business app PIN |

### Project key only (mounted when developer-key auth is active)

| Method | Path | Description |
|--------|------|-------------|
| GET | /v1/me | The key's own identity (CAP-DEV-002) |
| GET | /v1/financial-setup | The Project's financial readiness |

### Merchant JWT or project key (dual-credential, ADR-047)

A project key's payee comes only from its Project binding, and owner
identifiers are redacted from what it reads (ADR-057). Idempotency applies.

| Method | Path | Description |
|--------|------|-------------|
| POST · GET | /v1/payment-sessions | Create · list payment sessions |
| GET | /v1/payment-sessions/{id} · /{id}/link · /{id}/qr | Read a session and its interfaces |
| POST | /v1/application-settlements | Settle a wallet account's funds out |
| GET | /v1/application-settlements/{id} | Read a settlement |
| GET | /v1/integration | The integration's resolved state |
| POST · GET | /v1/wallet-accounts | Open · list wallet accounts |
| GET | /v1/wallet-accounts/{id} | Read a wallet account |
| POST | /v1/wallet-account-transfers | Move money between two accounts of the same owner |
| GET | /v1/consumers/handle/{handle} | Resolve a @banza (handle + display name only) |
| POST · GET | /v1/refunds | Refund a typed source · list refunds |
| GET | /v1/refunds/{id} | Read a refund |
| POST · GET | /v1/webhooks/endpoints | Register · list endpoints |
| GET · DELETE | /v1/webhooks/endpoints/{id} | Read · deactivate an endpoint |
| GET | /v1/webhooks/endpoints/{id}/health | Delivery health |
| POST | /v1/webhooks/endpoints/{id}/rotate-secret | Rotate the signing secret |
| GET | /v1/webhooks/events | List events |
| GET | /v1/webhooks/events/{id}/deliveries | An event's deliveries |
| POST | /v1/webhooks/deliveries/{id}/replay | Replay a delivery |
| POST · GET | /v1/payment-links | Create · list payment links |
| GET · DELETE | /v1/payment-links/{id} | Read · cancel a payment link |
| POST | /v1/payment-links/{id}/mark-used | Mark a link used |

### Merchant JWT (a consumer token is refused)

| Method | Path | Description |
|--------|------|-------------|
| POST | /v1/merchant/auth/claim | Claim a merchant session |
| POST | /v1/merchant/project-link-codes | Issue a consent code for a Project (ADR-055) |
| POST · GET | /v1/transactions | Create · list transactions |
| GET | /v1/transactions/{id} | Read a transaction |
| GET | /v1/merchant/wallet-payments | Wallet payments received |
| GET | /v1/merchant/transactions/{id}/receipt.pdf | Receipt PDF |
| POST | /v1/merchants | Create merchant — **Sandbox fixture route only**; not mounted on LIVE (ADR-058) |
| GET | /v1/merchants/{id} | Read merchant |
| POST | /v1/merchants/{id}/suspend | Suspend merchant |
| POST · GET | /v1/merchants/{id}/api-keys | Create · list API keys |
| DELETE | /v1/merchants/{id}/api-keys/{keyID} | Revoke an API key |
| POST · GET | /v1/compliance/customers/verify · /status | Consumer KYC (the one route a consumer token may use) |
| POST · GET | /v1/compliance/merchants/verify · /status | Business KYB |
| GET | /v1/merchant/kyb/status · /documents · /documents/{id} | KYB state and documents |
| POST | /v1/merchant/kyb/documents/{id}/upload-url · /complete | KYB upload ({id} = document type) |
| GET · POST | /v1/team/members | List · invite team members |
| DELETE | /v1/team/members/{id} | Remove a member |
| GET | /v1/team/access-log | Team access log |
| POST · GET | /v1/wallets | Create · read the merchant's wallet |
| GET | /v1/wallets/{id} · /{id}/balance · /{id}/analytics | Wallet, balance, analytics |
| POST · GET | /v1/payouts | Create · list payouts |
| GET | /v1/payouts/{id} | Read a payout |
| POST | /v1/consumers | Create consumer |
| GET | /v1/consumers/{id} | Read consumer |
| POST | /v1/qr/static · /dynamic · /decode | Create · decode QR |
| GET | /v1/qr/{id} | Read a QR code |
| POST | /v1/qr/{id}/use | Mark a QR used |
| ANY | /v1/splits · /v1/splits/* | 410 — superseded by Collections (ADR-036) |
| POST · GET | /v1/collections | Create · list collections |
| GET · PATCH | /v1/collections/{id} | Read · update |
| POST | /v1/collections/{id}/close · /cancel | Close · cancel |
| GET | /v1/collections/{id}/events | Collection events |
| POST · GET | /v1/collections/{id}/shares | Create · list shares |
| POST | /v1/collection-shares/{id}/surface | Surface a share |
| POST · GET | /v1/disputes | Open · list disputes |
| GET | /v1/disputes/{id} | Read a dispute |
| POST · GET | /v1/disputes/{id}/evidence | Submit · list evidence |
| GET | /v1/sandbox/status · /instruments | Sandbox status and test instruments (SANDBOX only) |
| POST | /v1/sandbox/fund · /simulate/payment | Credit a Sandbox wallet · simulate a payment (SANDBOX only) |

### Internal (X-Internal-Key — admin-api, public-api, developer-api)

| Method | Path | Description |
|--------|------|-------------|
| POST | /internal/v1/proofs/ensure · /internal/v1/proofs/reverse | Mint · reverse a proof |
| POST | /internal/v1/receipts/transfer · /wallet-payment | Canonical receipts |
| GET | /internal/v1/businesses/{id}/public-identity | A Business's public name and @banza |
| GET | /internal/v1/businesses/{merchantID}/state | Business state |
| POST | /internal/v1/businesses/{merchantID}/app-pin-reset | Fresh activation link (when configured) |
| POST | /internal/v1/business-link-codes/redeem | Spend a Business consent code for a Project |
| GET | /internal/v1/merchant-applications · /{id} | Review queue |
| POST | /internal/v1/merchant-applications/{id}/approve · /reject · /start-review · /request-information | Review decisions |
| POST · GET | /internal/v1/merchant-applications/for-project · /for-project/{projectID} | Project applications |
| POST | /internal/v1/merchant-applications/{id}/link-existing · /reissue-activation | Provisioning steps |
| GET | /internal/v1/merchant-applications/{id}/link-candidates · /business-state · /documents | Review context |
| POST | /internal/v1/merchant-applications/{id}/documents/{document_id}/read-url · /accept · /reject | Document review |
| GET | /internal/v1/merchant-kyb/documents · /merchants · /merchants/{id}/documents · /merchants/{id}/context · /merchants/{id}/timeline | KYB review |
| POST | /internal/v1/merchant-kyb/documents/{id}/approve · /reject · /read-url | KYB decisions |
| GET | /internal/v1/attention-summary | BANZADMIN attention badges |

## Running locally

```bash
# from repo root
cp .env.example .env
make gateway-run
```

Or directly:

```bash
cd services/api-gateway
go run cmd/gateway/main.go
```

## Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| PORT | 8080 | No | HTTP listen port |
| ENVIRONMENT | development | No | development \| staging \| production |
| LOG_LEVEL | info | No | debug \| info \| warn \| error |
| LOG_FORMAT | json | No | json \| pretty |
| DATABASE_URL | — | Yes | PostgreSQL connection string |
| REDIS_URL | — | Yes | Redis connection string |
| JWT_SECRET | — | Yes | HMAC secret for JWT signing and verification |
| CORE_API_URL | — | Yes | Base URL for the Rust core-api (e.g. `http://localhost:8081`) |
| OTLP_ENDPOINT | — | No | OpenTelemetry collector endpoint; tracing disabled when empty |
| FIREBASE_CREDENTIALS_JSON | — | No | Firebase service-account JSON (minified); push notifications disabled when empty |

## Middleware Stack

Applied globally (every request):

1. `CORS` — sets `Access-Control-Allow-*` headers for allowed origins
2. `RealIP` — resolves client IP from `X-Forwarded-For`
3. `RequestID` — generates or propagates `X-Request-ID`
4. `Logger` — structured log after response: method, path, status, duration, request_id
5. `Recoverer` — converts panics to 500 without crashing the process
6. `Timeout` — 60-second global deadline
7. `RouteSpan` — enriches the otelhttp span with the chi route pattern
8. `RequestSize` — 4 MB global payload cap

Applied to all `/v1/*` routes:

9. `Auth` — verifies JWT Bearer token; extracts principal (merchant ID, environment)
10. `RateLimit` — sliding-window limiter backed by Redis (per API key)
11. `Idempotency` — deduplicates POST/PATCH using `X-Idempotency-Key` (Redis, 24 h TTL)

## CORS Architecture

CORS is handled at two layers. An origin must appear in exactly one layer — never both (duplicate `Access-Control-Allow-Origin` headers cause browsers to reject the request).

| Origin | Layer |
|--------|-------|
| `https://admin.banzami.com` | nginx (`/srv/banzami/nginx/banzami.conf`) |
| `https://business.banzami.com` | nginx |
| `https://pay.banzami.com` | Go middleware (`internal/middleware/cors.go`) |
| `http://localhost:3010/3002/3003/3004` | Go middleware (local dev only) |

When adding a new production frontend, choose one layer and add it there only.

## Sandbox Environment

All routes under `/v1/sandbox/*` enforce that the caller holds a `SANDBOX` JWT (obtained by authenticating with a `bz_test_…` API key). Live keys receive `403 SANDBOX_ONLY`.

`POST /v1/sandbox/fund` credits the merchant wallet via a direct ledger entry in the Rust core-api (same pattern as consumer wallet test credits). The balance update is immediate, persistent, and reflected in all downstream operations (QR payments, transfers, payouts). Virtual balance — no real funds are moved.

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| github.com/go-chi/chi/v5 | 5.2.1 | HTTP router |
| github.com/google/uuid | 1.6.0 | Request ID generation |
| github.com/redis/go-redis/v9 | 9.x | Rate limiting, idempotency |
| github.com/golang-jwt/jwt/v5 | 5.x | JWT signing and verification |
| go.opentelemetry.io/otel | 1.x | Distributed tracing |
| go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp | 0.x | HTTP trace spans |
| github.com/prometheus/client_golang | 1.x | Prometheus metrics |
| firebase.google.com/go/v4 | 4.x | Firebase Cloud Messaging (push notifications) |
