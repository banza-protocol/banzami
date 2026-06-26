# BANZADMIN — Security Hardening Phase 1

Version: 1.0
Scope: `services/admin-api` + `apps/admin` (BANZADMIN only). No changes to the
Gateway, Ledger, Settlement core, Merchant Lifecycle, Doa or R2.

This document records the design and operational notes for the RBAC, audit,
session-security and anti-abuse work delivered in Phase 1. It resolves the P1
(RBAC not enforced) and the main P2 findings from the BANZADMIN security audit.

> Migrations are written but **not applied**. No deploy, no env changes.

---

## 1. RBAC — central capability matrix

Before: any authenticated operator (including `READ_ONLY`) could call almost
every action endpoint — only operator-management routes checked
`role == SUPER_ADMIN` inline.

Now: a single permission matrix in
[`services/admin-api/internal/auth/rbac.go`](../../services/admin-api/internal/auth/rbac.go)
maps each role to a set of `Capability` values, and one middleware,
`RequireCapability(cap)`
([`internal/middleware/rbac.go`](../../services/admin-api/internal/middleware/rbac.go)),
gates every mutating route in
[`internal/server/server.go`](../../services/admin-api/internal/server/server.go).
There are **no scattered `if role == …` checks** — `auth.Can(role, cap)` is the
only authorization decision point.

### Role → capability summary

| Capability group | SUPER_ADMIN | OPERATIONS | COMPLIANCE | SUPPORT | READ_ONLY |
|---|:--:|:--:|:--:|:--:|:--:|
| Dashboards / list views | ✓ | ✓ | ✓ | ✓ | ✓ |
| Operator **read** | ✓ | — | — | ✓ | ✓ |
| Operator **manage** (create/role/suspend/activate) | ✓ | — | — | — | — |
| Operator **reset / resend / terminate sessions** | ✓ | — | — | ✓ | — |
| Application approve / reject | ✓ | ✓ | — | — | — |
| KYB accept / reject, AML flag, merchant suspend | ✓ | — | ✓ | — | — |
| Compliance approve / reject merchant | ✓ | — | ✓ | — | — |
| Consumer suspend | ✓ | — | ✓ | — | — |
| Settlements / payouts / wallet credit / reconciliation run | ✓ | — | — | — | — |
| Dispute resolve | ✓ | ✓ | — | — | — |
| Risk resolve / freeze | ✓ | freeze: — / resolve: — | ✓ | — | — |
| Audit log read | ✓ | — | ✓ | ✓ | ✓ |

`SUPER_ADMIN` is short-circuited to "all" in `Can`; unknown roles get nothing
(deny by default). The matrix is the single source of truth and is unit-tested
(`auth/rbac_test.go`).

---

## 2. Immutable audit log

Migration [`0061_admin_audit_log.sql`](../../db/migrations/0061_admin_audit_log.sql)
adds an append-only `admin_audit_log` table. The application never updates or
deletes rows.

- A central middleware, `Audit`
  ([`internal/middleware/audit.go`](../../services/admin-api/internal/middleware/audit.go)),
  records **one row per state-changing request** (POST/PUT/PATCH/DELETE) in the
  authenticated group. The action name is derived from the matched chi route, so
  a new route is audited even before it is added to the action map (it falls back
  to `METHOD pattern` — nothing is silently unaudited).
- Login success/failure are audited in the auth handler (login is a public
  route, outside the middleware).
- Handlers may enrich a row with a redacted before/after snapshot via
  `auth.AuditAnnotation` (never passwords, hashes or tokens).
- **Auditing never blocks the action.** A failed audit insert is logged
  (`admin.audit_write_failed`) but the request still succeeds.

Captured per row: actor (id/email/full name/role), action, entity type/id,
before/after JSON, HTTP status, IP, user-agent, request id, timestamp.

---

## 3. Session revocation (token_version)

Migration [`0060_admin_token_version.sql`](../../db/migrations/0060_admin_token_version.sql)
adds `token_version INT DEFAULT 1` to `admin_users`.

- The admin JWT carries `token_version`. `AdminJWT`
  ([`internal/middleware/jwt.go`](../../services/admin-api/internal/middleware/jwt.go))
  re-loads the operator on every request and rejects the token (401) when the
  JWT's version no longer matches the row.
- `token_version` is incremented on: change-password, password-reset / invite
  completion, suspend, activate, and the explicit "terminate sessions" actions.
- **Terminate all sessions**:
  - Self — `POST /admin/v1/auth/terminate-sessions` (topbar account menu).
  - Operator — `POST /admin/v1/operators/{id}/terminate-sessions` (operators
    table, SUPER_ADMIN/SUPPORT).

Effect: a stale or stolen token stops working immediately, without waiting for
the 12h JWT TTL.

---

## 4. Anti-enumeration login

The login path is now uniform
([`internal/handler/auth.go`](../../services/admin-api/internal/handler/auth.go)):

- Unknown email, wrong password, no-password (INVITED) and **suspended** accounts
  all return the same generic `401 INVALID_CREDENTIALS`.
- Every rejection spends one bcrypt comparison (a fixed dummy hash for
  unknown/no-password accounts via `auth.DummyVerify`) so response time does not
  reveal whether an account exists.
- The **only** non-generic response is a true lockout (`429 TOO_MANY_ATTEMPTS`),
  which an attacker can only trigger against a known-existing account anyway.

The login-attempt audit trail still records the precise internal reason
(`UNKNOWN_EMAIL`, `NOT_ACTIVE`, `BAD_PASSWORD`, …) — it just isn't exposed to the
caller.

---

## 5. Per-IP rate limiting

`IPRateLimiter`
([`internal/middleware/ratelimit.go`](../../services/admin-api/internal/middleware/ratelimit.go))
allows **20 requests/minute/IP** and is mounted only on the unauthenticated auth
surface: `POST /auth/login`, `/auth/password-reset/validate`,
`/auth/password-reset/complete`, and `/auth/change-password`. Over-limit requests
get `429` + `Retry-After`. Authenticated operators are never throttled on normal
endpoints. In-memory and per-instance — sufficient for the single admin-api
process; a distributed limiter is the scale-out follow-up.

---

## 6. JWT claims minimized

The admin JWT now carries only `sub`, `email`, `role`, `token_version`, `iat`,
`exp`, `iss`. The full name, any permission list, and all password material are
gone — identity and live role/status are re-loaded from the database on every
request.

---

## 7. Password policy

Floor raised to **≥ 12 characters** (`auth.MinPasswordLen`) with **no**
uppercase/number/symbol requirement — a long passphrase is encouraged. Enforced
in change-password, reset/invite completion and the bootstrap CLI; mirrored in
the BANZADMIN UI copy.

---

## 8. Confirmation modals for critical actions

Themed confirmation dialogs (`useDialog().confirm`) now gate the
critical/irreversible actions, each explaining the impact: approve application,
reject application (reason prompt), suspend operator, terminate sessions
(self + operator), suspend/AML merchant, accept/reject KYB document, confirm
payment, and resolve dispute. Action buttons remain `disabled` while a request is
in flight.

---

## 9. CSP hardening

`apps/admin/next.config.mjs` adds `object-src 'none'` and `frame-src 'none'` and
keeps the existing `frame-ancestors 'none'`, `base-uri 'self'`,
`form-action 'self'`. `script-src`/`style-src` still allow `'unsafe-inline'`:
Next.js 14 (app router) emits inline bootstrap/hydration scripts and `next/font`
injects inline styles. Removing it safely requires a per-request nonce served
from a Next middleware and a runtime verification pass — deferred to a follow-up
so we don't risk breaking hydration under the no-deploy constraint of this phase.

---

## 10. Idempotency assessment

Goal: an action accidentally invoked twice (double-click, retry) must not create
a second wallet / API key / merchant / settlement, nor double-confirm a payment.

Current protection, after this phase:

1. **UI** — every critical action now requires an explicit confirmation modal and
   disables its button while the request is in flight, removing the common
   double-submit vector.
2. **State machine** — the financial/lifecycle actions are guarded by status
   preconditions in the core / gateway they proxy to: an application already in a
   terminal state, or a payout/settlement already in `CONFIRMED`/`RETURNED`/…,
   rejects re-submission. Re-running an action on an already-final entity is a
   no-op error rather than a duplicate side effect.

Gap / follow-up (out of scope for this phase, and would touch the Gateway/core
which this phase must not modify): first-class `Idempotency-Key` header support
with a persisted key→result store, so a retried POST returns the original result
instead of relying on state preconditions. Recommended for the next increment;
must be opened as work in the owning service.

---

## 11. Tests

`go test ./...` (admin-api) and `tsc --noEmit` + `next build` (admin) are green.
New backend tests cover: the capability matrix, `RequireCapability` allow/deny,
token_version revocation, the IP rate limiter, anti-enumeration login, and the
audit middleware. Existing operator/reset/auth tests were updated to exercise the
new middleware-based authorization.
