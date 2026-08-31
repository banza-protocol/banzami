# ADR-004 — Idempotency and Rate Limiting with Redis

**Status:** Accepted  
**Date:** 2026-05-13

---

## Context

Two cross-cutting concerns affect every write endpoint in the public API:

1. **Idempotency** — a merchant's server may retry a failed request (network timeout, 5xx response). If the original request actually succeeded, the retry must not create a second charge.
2. **Rate limiting** — the public API must be protected from abuse (accidental or intentional) without blocking legitimate traffic during Redis degradation.

Both concerns require fast, per-request state lookups that must not block on the PostgreSQL critical path.

---

## Decision

**Idempotency:** Redis key-value store with TTL. The api-gateway intercepts requests with an `Idempotency-Key` header, checks Redis before forwarding to the core-api, and caches the response after success.

**Rate limiting:** Redis sliding-window counter per merchant (authenticated) or IP (anonymous). Limits: 1,000 req/min authenticated, 60 req/min anonymous.

**Both fail open** — if Redis is unavailable, requests proceed. A degraded Redis must not block all API traffic.

---

## Architecture

### Idempotency flow

> **Corrected 2026-08-31.** The flow below originally showed key-only replay:
> a cache hit returned the stored response for *any* request body. That is the
> behaviour BANZA ADR-022 explicitly rejects — *"Return the original response for
> any key reuse, ignoring the body. Rejected: it converts a caller error into a
> silent success."* The operator was under-implementing a protocol invariant, and
> the gap was found by the first deployed CAP-PAY-001 E2E (RA-044): reusing a key
> with a different amount returned the original session with 201, so the caller
> believed their new amount had been accepted.
>
> The protocol rule is: same key + same request → replay the original result;
> same key + **different request body** → conflict, never a silent replay. The
> gateway now fingerprints the request and answers **409** on a mismatch.

```
Request arrives with Idempotency-Key: <key>
  │
  ├─ Redis GET "idem:<merchant_id>:<key>"
  │    HIT + fingerprint matches    → return cached response (replay)
  │    HIT + fingerprint differs    → 409 IDEMPOTENCY_KEY_REUSED (BANZA ADR-022)
  │    MISS                         → continue
  │
  ▼
  Forward to core-api → get response
  │
  ├─ Success (2xx) → Redis SET "idem:<merchant_id>:<key>" <response> EX 86400
  │                   (24h TTL — covers all reasonable retry windows)
  │
  └─ Error (4xx/5xx) → do NOT cache (error responses are not idempotent)
```

### Rate limiting flow

```
Request arrives
  │
  ├─ Identify key:
  │    authenticated → "rl:<merchant_id>"
  │    anonymous     → "rl:ip:<remote_ip>"
  │
  ├─ Sliding window (1-minute):
  │    ZADD key <now_ms> <request_id>
  │    ZREMRANGEBYSCORE key 0 <now_ms - 60000>
  │    count = ZCARD key
  │    EXPIRE key 60
  │
  ├─ count > limit → 429 Too Many Requests
  │                   Retry-After: 60
  │
  └─ count ≤ limit → continue
```

---

## Rationale

### Why Redis and not PostgreSQL for idempotency?

A PostgreSQL-backed idempotency check would add a write (insert key) + read (check key) on the hot path, increasing latency and adding load to the critical financial database. Redis provides O(1) operations with sub-millisecond latency and built-in TTL expiry without any application-side cleanup.

Idempotency keys are ephemeral — they only need to survive the retry window (24h). PostgreSQL is the wrong tool for short-lived operational data.

### Why sliding window and not fixed window for rate limiting?

A fixed window (e.g., reset every minute at :00) creates a burst problem: a client can make 1,000 requests in the last second of one window and 1,000 in the first second of the next, sending 2,000 requests in 2 seconds.

A sliding window considers the last 60 seconds from the current request, regardless of clock boundaries. This is fairer and more protective.

The tradeoff is slightly higher Redis memory usage (storing individual request timestamps in a sorted set vs a single counter). Acceptable at expected traffic volumes.

### Why fail open on Redis degradation?

Two choices: fail open (allow requests through) or fail closed (return 503 when Redis is down).

Failing closed means a Redis outage stops all API traffic. For a payment infrastructure platform, this is unacceptable — merchants cannot process payments because of a caching layer failure. The consequence of failing open is that rate limits and idempotency checks are temporarily unenforced, which is a recoverable operational state.

The correct operational response to Redis degradation is alerting and rapid recovery, not blocking traffic.

### Why 24h TTL for idempotency keys?

The TTL must cover the merchant's entire retry window — the period during which they might retry a request they believe failed. Industry standard is 24 hours. Shorter TTLs risk missing legitimate retries; longer TTLs waste Redis memory.

---

## Consequences

**Positive:**
- Double-charge prevention covers network timeout retries transparently.
- Rate limiting protects the system from abuse without DB involvement.
- Both mechanisms degrade gracefully (fail open) during Redis unavailability.

**Negative:**
- Idempotency is not guaranteed if Redis loses data (e.g., restart without persistence). Mitigated by Redis persistence configuration (`save 60 1`) and by the core-api's own `UNIQUE(idempotency_key)` constraint as a last-resort defence.
- Sliding window rate limiting stores per-request timestamps. Memory usage scales with request rate. Acceptable at expected scale; switch to approximate counting if needed.

---

## Alternatives Considered

| Option | Rejected Because |
|--------|-----------------|
| PostgreSQL idempotency table | Hot path latency; load on financial DB |
| In-process memory (single instance) | Not horizontally scalable; lost on restart |
| Fixed window rate limiting | Burst problem at window boundaries |
| Fail closed on Redis degradation | Redis outage would stop all payment processing |
| Token bucket algorithm | More complex to implement in Redis; sliding window sufficient |


---

## Request equivalence — what counts as "the same request" (2026-08-31)

BANZA ADR-022 mandates conflict-on-different-body but states the invariant as
*observable behaviour*, without prescribing how equivalence is computed. This
operator computes it **structurally**, over the canonicalised request body:

| Difference | Treated as | Rationale |
|---|---|---|
| Key order, whitespace | **same** | Serialiser variation is not caller intent |
| Optional field explicitly `null` or `""` vs omitted | **same** | Both express "not supplied" |
| Any value change, at any depth | **different** | This is the case ADR-022 exists for |
| Field omitted vs sent with its default value | **different** | See below |

That last row is deliberate and worth stating plainly, because it is the one that
looks like a false conflict.

`purpose` defaults to `GENERIC` when absent, but **that default is an internal
implementation detail** — it lives only in the core handler. It is not declared in
the BANZA payment-session schema (where `purpose` is nullable with no `default`),
not in the protocol OpenAPI, and not in the public developer documentation. No
published contract tells a caller that omitting `purpose` and sending `"GENERIC"`
are the same request, so treating them as the same request would be the operator
inventing an equivalence its own API never promised.

Two further reasons to keep it structural:

- **Layering.** The fingerprint is computed in generic middleware, before any
  handler has parsed or defaulted the body. Teaching that middleware each
  endpoint's defaults would duplicate business rules in a second place, and the
  two copies would drift.
- **Failure direction.** A false conflict *refuses* a request the caller can
  immediately retry with a fresh key. A missed conflict *returns the wrong
  resource* and tells the caller a different operation succeeded — the exact harm
  ADR-022 names. Where the two cannot both be avoided, erring toward refusal is
  the safe asymmetry on a money surface.

If a defaulted field should ever become part of the published contract, the
correct fix is to declare the default in the schema and normalise **before**
fingerprinting — not to special-case it in middleware.

Verified against the deployed Sandbox: identical request, reordered keys, explicit
`null` and explicit `""` all **replay**; omitted-vs-explicit-`GENERIC`, a changed
amount and a changed wallet account all **conflict**.
