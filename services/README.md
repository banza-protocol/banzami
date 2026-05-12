# services

Go services for APIs, gateway, and orchestration.

## Contents

- `api-gateway/` — Edge gateway. TLS termination delegation, authentication, rate limiting, idempotency enforcement, request routing.
- `public-api/` — External-facing REST API consumed by merchants, SDKs, and plugins.
- `admin-api/` — Internal API consumed by `apps/admin/` and operations tooling.

## Stack

Go · PostgreSQL · Redis

## Conventions

- Services are stateless. All durable state belongs in PostgreSQL; transient state in Redis.
- Every endpoint must be **idempotent** (CLAUDE.md §8.3) and emit structured logs, metrics, and traces (§9).
- **No direct database writes for monetary state.** All money movement is delegated to `core/` via the financial core boundary.
- API contracts must be documented in [`docs/api/`](../docs/api/) before exposure. Request schemas, response schemas, error responses, and examples are mandatory.
- Authentication and authorization are enforced at the gateway. Downstream services trust verified principals from the gateway but enforce their own scope checks.
- All external requests carry a request ID propagated through OpenTelemetry context.
