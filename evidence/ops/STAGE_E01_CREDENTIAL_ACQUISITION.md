# Stage E0.1 — Sandbox Credential Acquisition Closure

- **Date:** 2026-08-31
- **Deployed commit:** `2f4e6f9d7cf6` (matches `main`)
- **Verdict: `STAGE E0.1: HOLD`** — the merchant credential path is fully proven
  and Stage E is unblocked by it; the developer-key path is blocked by a new
  finding (SE-005).

No secrets, tokens, PINs, DSNs or OTP values appear in this record.

---

## 1. Headline

Two of the three blocked paths turned out to have different explanations, and one
of them was **my own error**:

| Path | Before | After | Cause |
|---|---|---|---|
| Merchant onboarding → credential | 500 | **WORKS end to end** | my test payload was invalid |
| Developer OTP → credential | 503 | still 503, now **explained** | SE-005: schema recorded but absent |
| Operator fixture keys | unavailable | still 503 | same root cause |

## 2. Schema drift is NOT the explanation — the ledger is

The canonical tooling reports the sandbox database as fully current: **97 of 97
migrations applied, max version 100** matching `db/migrations/0100_*`, **zero
failures**, nothing pending.

That record is wrong. See SE-005.

## 3. Merchant onboarding — the 500 was my invalid test data

Structured diagnostics added to the failure path named it immediately:

```
merchant.application.submit_failed  stage=persist  error_kind=postgres
sqlstate=23514  constraint=merchant_applications_business_account_type_check
```

`23514` is **check_violation**. The constraint allows `MERCHANT`, `APPLICATION`,
`PLATFORM`, `NGO`, `MARKETPLACE`, `DELIVERY`, `OTHER`. Every probe I ran across
Stage E and E0 sent `business_account_type: "COMPANY"` — a value that does not
exist in this product.

**I reported "merchant onboarding returns 500" as a deployment blocker in two
stages. It was my payload.** The flow was never broken. What the failure did
expose is genuine: a check violation on client-supplied data is answered with a
500, when the API's own contract has a `VALIDATION_ERROR` shape for exactly this.
Recorded as SE-006 (LOW).

With a valid value the full path completes:

| Step | Result |
|---|---|
| `POST /v1/merchant/applications` | **201** — `status: APPROVED`, `sandbox_auto_approved: true`, activation token returned |
| `POST /v1/merchant/activation/validate` | **200** — `valid: true` |
| `POST /v1/merchant/activation/complete` | **200** — `status: activated` |
| `POST /v1/merchant/auth/token` | **200** — token, `environment: SANDBOX`, expiry |

Sandbox auto-approval is the product's own declared behaviour
(`WithAutoApprove`, gated to sandbox); nothing was added or weakened to make this
pass.

## 4. Credential usability — proven

| Check | Result |
|---|---|
| `GET /v1/business/me` with the issued token | **200** — own identity, `environment: SANDBOX`, `kyb_status: APPROVED` |
| Same endpoint, no credential | **401** `UNAUTHORIZED` |
| Same endpoint, bogus credential | **401** `INVALID_TOKEN` |

Issuance → authentication → authorised sandbox response, with both negatives
correct. No payment operation was executed.

## 5. FINDING SE-005 (HIGH) — the migration ledger asserts a schema that does not exist

**The developer OTP 503 is not a configuration problem.** Diagnostics named it:

```
auth.request_otp.failed  stage=request_otp  error=account identity unavailable
```

`RequestOTP` returns that sentinel from five branches. Eliminated by measurement:
the OTP pepper is mounted and non-empty, Redis answers `PONG`, and the database is
reachable. The surviving branch is persistence — and this is why:

| Object | Expected | Actual |
|---|---|---|
| schema `account_identity` | present | **present** |
| `account_identity.identity_users` | created by migration 0088 | **absent** |
| `account_identity.identity_otp_codes` | created by migration 0088 | **absent** |
| `account_identity.identity_sessions` | created by migration 0088 | **absent** |
| `account_identity.audit_events` | created by migration 0088 | **absent** |
| `_sqlx_migrations` row for version 88 | — | **present, `success = true`** |

The migration ledger records 0088 as successfully applied while **none of its four
tables exist**. Only the empty schema was created.

**Why this is worse than ordinary drift:** the tooling cannot self-heal. Because
88 is marked applied, `sandbox-migration plan` reports nothing pending and will
never re-run it, so the tables can never appear through the canonical path. Every
migration check in this repository reports the database as current, and it is not.
This is the same record-versus-reality failure the programme has hit repeatedly —
now in the schema ledger, which is the layer everything else trusts.

**Impact:** the entire Developer Console identity product — accounts, OTP,
sessions, audit — has no storage in Sandbox. That is not only a testing obstacle:
the developer onboarding advertised to external integrators cannot work.

**Not repaired here, deliberately.** The remedies are either editing
`_sqlx_migrations` to force a re-run or hand-applying DDL, and the brief forbids
fabricating migration records and manual schema mutation. Both are data-layer
repairs on a shared environment and belong to an explicit, authorised migration
action. 0088 uses `CREATE TABLE IF NOT EXISTS` throughout, so re-application is
idempotent once authorised.

## 6. FINDING SE-006 (LOW) — client-caused check violation answered as 500

`POST /v1/merchant/applications` maps an unrecognised `business_account_type` to
`INTERNAL_ERROR` 500. The value is client-supplied and the constraint is known, so
the correct answer is the `VALIDATION_ERROR` 400 the handler already uses for
other invalid input. Currently a caller sending a wrong enum is told the server
broke.

Cost measured rather than assumed: it sent two assurance stages looking for a
deployment defect that did not exist.

## 7. Observability added (no change to public responses)

Both failures were previously invisible. The merchant path logged nothing beyond
the request line; the OTP path logged **nothing at all**.

Public contracts are unchanged — generic `INTERNAL_ERROR` with a request id, and a
uniform `UNAVAILABLE` that still reveals nothing about whether an account exists.
No SQL, constraint or column reaches a client.

Operator-side, the merchant path logs stage plus SQLSTATE/constraint/column/table
where PostgreSQL supplies them; a SQLSTATE names the failure class without
carrying row data, and the driver's raw message is deliberately not logged because
it can quote submitted values. The OTP path logs error type, message and email.
The OTP code, pepper and session secret never pass through either branch.

**Both root causes in this document were found within minutes of that logging
reaching the Sandbox.**

## 8. Findings carried forward

| Finding | Status |
|---|---|
| SE-001 | **withdrawn** — no new evidence of missing configuration; secrets confirmed working |
| SE-002 | **CLOSED** — deployed build `2f4e6f9d7cf6` matches `main`, asserted by the gate |
| SE-003 | **CLOSED** — `/readyz` still probes a real database |
| SE-004 | **FIXED** — public `/internal/*` returns 404 with no key and with a bogus key |
| SE-005 | **NEW, HIGH, open** |
| SE-006 | **NEW, LOW, open** |

## 9. Gates

| Gate | Result |
|---|---|
| `make assure-sandbox-runtime` (expected = HEAD) | **PASS**, build matches |
| `make assure-sandbox-launch` | **HOLD** — unchanged |
| `make security-check` | **PASSED** |
| `make check-live-fail-closed` | **PASS** — SEC-019 registered |
| Production `banzami.com` / `developers` | **200 / 200** |
| Public `/internal/*` | **404** |

No capability was promoted.

## 10. Stage E handoff — how to obtain isolated Sandbox credentials

Use the **merchant** path. It is public, authorised, self-service in Sandbox, and
proven end to end above. Every payment route accepts `DualAuth`, so a merchant JWT
authenticates them without needing a developer key.

```
POST /v1/merchant/applications      → 201, activation_token, sandbox_auto_approved
POST /v1/merchant/activation/validate
POST /v1/merchant/activation/complete   {token, pin}
POST /v1/merchant/auth/token            {handle, pin}  → Bearer token
```

Harness requirements: e2e-tagged handles and emails, a valid
`business_account_type` from the constraint list, PINs generated per run and never
logged, and one merchant per run for isolation.

**Not yet available:** developer API keys (SE-005) and the operator fixture path,
which fails for the same reason. Stage E should not depend on either until SE-005
is repaired.
