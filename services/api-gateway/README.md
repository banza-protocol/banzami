# services/api-gateway

Go HTTP gateway — authentication, rate limiting, idempotency enforcement, request routing.

## Responsibilities

- TLS termination delegation (handled upstream by Cloudflare/load-balancer)
- Request ID generation and propagation
- Structured request logging
- JWT authentication (middleware stub — not yet enforced)
- Rate limiting (middleware stub — Redis-backed, not yet wired)
- Idempotency key enforcement for mutating routes (stub)
- Routing to versioned API handlers (`/v1/*`)
- Health and readiness probes

## Structure

```
cmd/gateway/main.go         — entry point, logger init, graceful shutdown
internal/
  config/config.go          — env-var configuration with sensible defaults
  server/server.go          — chi router, middleware stack, route table
  middleware/
    requestid.go            — X-Request-ID generation and context propagation
    logger.go               — structured per-request log line (slog)
  handler/
    health.go               — GET /health (liveness) + GET /readyz (readiness)
```

## Endpoints

| Method | Path      | Auth | Description                                |
| ------ | --------- | ---- | ------------------------------------------ |
| GET    | /health   | No   | Liveness — always 200 if the process is up |
| GET    | /readyz   | No   | Readiness — checks DATABASE_URL + REDIS_URL |
| *      | /v1/*     | Yes  | Versioned API (routes added per domain)    |

## Running locally

```bash
# from repo root
cp .env.example .env       # ensure PORT, DATABASE_URL, REDIS_URL, JWT_SECRET are set
make gateway-run
```

Or directly:

```bash
cd services/api-gateway
go run cmd/gateway/main.go
```

## Environment Variables

| Variable      | Default       | Required | Description                              |
| ------------- | ------------- | -------- | ---------------------------------------- |
| PORT          | 8080          | No       | HTTP listen port                         |
| ENVIRONMENT   | development   | No       | development \| staging \| production     |
| LOG_LEVEL     | info          | No       | debug \| info \| warn \| error           |
| LOG_FORMAT    | json          | No       | json \| pretty                           |
| DATABASE_URL  | —             | Yes      | PostgreSQL connection string             |
| REDIS_URL     | —             | Yes      | Redis connection string                  |
| JWT_SECRET    | —             | Yes*     | HMAC secret for JWT verification (*when auth middleware is enabled) |

## Middleware Stack

Applied globally (every request):

1. `RealIP` — resolves client IP from `X-Forwarded-For`
2. `RequestID` — generates or propagates `X-Request-ID`
3. `Logger` — structured log after response: method, path, status, duration, request_id
4. `Recoverer` — converts panics to 500 without crashing the process
5. `Timeout` — 60-second global deadline

Planned (not yet active — see commented-out lines in `server.go`):

6. `Auth` — JWT Bearer token verification
7. `RateLimit` — sliding-window rate limiter backed by Redis
8. `Idempotency` — deduplication for POST/PATCH using Redis

## Dependencies

| Package                  | Version | Purpose              |
| ------------------------ | ------- | -------------------- |
| github.com/go-chi/chi/v5 | 5.2.1   | HTTP router          |
| github.com/google/uuid   | 1.6.0   | Request ID generation |

Standard library only for logging (`log/slog`), HTTP, config, and shutdown.
