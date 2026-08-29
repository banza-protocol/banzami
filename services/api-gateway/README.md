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
    consumers.go            — consumer identity CRUD
    consumer_wallets.go     — consumer wallet read + balance
    transfers.go            — P2P transfer create + list + get
    qr.go                   — QR code create, decode, mark-used
    payment_links.go        — payment link lifecycle
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

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | No | Liveness — always 200 |
| GET | /readyz | No | Readiness — checks DB + Redis |
| GET | /metrics | No | Prometheus metrics |
| POST | /v1/auth/token | No | Exchange API key for JWT |
| POST | /v1/transactions | JWT | Create transaction |
| GET | /v1/transactions | JWT | List transactions |
| GET | /v1/transactions/{id} | JWT | Get transaction |
| POST | /v1/webhooks/endpoints | JWT | Register webhook endpoint |
| GET | /v1/webhooks/endpoints | JWT | List endpoints |
| GET | /v1/webhooks/endpoints/{id} | JWT | Get endpoint |
| DELETE | /v1/webhooks/endpoints/{id} | JWT | Deactivate endpoint |
| GET | /v1/webhooks/events | JWT | List webhook events |
| GET | /v1/webhooks/events/{id}/deliveries | JWT | List deliveries |
| POST | /v1/merchants | JWT | Create merchant |
| GET | /v1/merchants/{id} | JWT | Get merchant |
| POST | /v1/merchants/{id}/suspend | JWT | Suspend merchant |
| POST | /v1/merchants/{id}/api-keys | JWT | Create API key |
| GET | /v1/merchants/{id}/api-keys | JWT | List API keys |
| DELETE | /v1/merchants/{id}/api-keys/{keyID} | JWT | Revoke API key |
| POST | /v1/wallets | JWT | Create wallet |
| GET | /v1/wallets | JWT | Get merchant's wallet |
| GET | /v1/wallets/{id} | JWT | Get wallet by ID |
| GET | /v1/wallets/{id}/balance | JWT | Get wallet balance |
| POST | /v1/payouts | JWT | Create payout |
| GET | /v1/payouts | JWT | List payouts |
| GET | /v1/payouts/{id} | JWT | Get payout |
| POST | /v1/consumers | JWT | Create consumer |
| GET | /v1/consumers/handle/{handle} | JWT | Lookup consumer by handle |
| GET | /v1/consumers/{id} | JWT | Get consumer |
| POST | /v1/consumer-wallets | JWT | Create consumer wallet |
| GET | /v1/consumer-wallets | JWT | Get consumer's wallet |
| GET | /v1/consumer-wallets/{id} | JWT | Get consumer wallet by ID |
| GET | /v1/consumer-wallets/{id}/balance | JWT | Get consumer wallet balance |
| POST | /v1/qr/static | JWT | Create static QR |
| POST | /v1/qr/dynamic | JWT | Create dynamic QR |
| POST | /v1/qr/decode | JWT | Decode QR payload |
| GET | /v1/qr/{id} | JWT | Get QR code |
| POST | /v1/qr/{id}/use | JWT | Mark QR used |
| POST | /v1/payment-links | JWT | Create payment link |
| GET | /v1/payment-links | JWT | List payment links |
| GET | /v1/payment-links/{id} | JWT | Get payment link |
| DELETE | /v1/payment-links/{id} | JWT | Cancel payment link |
| POST | /v1/payment-links/{id}/mark-used | JWT | Mark payment link used |
| GET | /v1/sandbox/status | JWT (sandbox) | Confirm sandbox mode |
| GET | /v1/sandbox/instruments | JWT (sandbox) | List test instruments |
| POST | /v1/sandbox/fund | JWT (sandbox) | Credit sandbox wallet via ledger |
| POST | /v1/sandbox/simulate/payment | JWT (sandbox) | Inject synthetic transaction |
| POST | /v1/callbacks/emis | HMAC | EMIS acquiring callback |
| GET | /public/pay/{slug} | No | Pay-page: get payment link |
| GET | /public/pay/{slug}/status | No | Pay-page: poll payment status |
| POST | /public/pay/{slug}/pay | No | Pay-page: initiate payment |
| POST | /public/pay/{slug}/test-confirm | No | Pay-page: dev test confirm |

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
