# Stage E0.2 — account_identity Schema Reality & Migration Assurance

- **Date:** 2026-08-31
- **Deployed commit:** `a042511fc975` (matches `main`)
- **Verdict: `STAGE E0.2: GO`** — SE-005 closed by correction and repair; the
  developer identity path works. One separate blocker remains (§8).

No secrets, peppers, OTP values, PINs or DSNs appear in this record.

---

## 1. SE-005 was wrong, and the correction matters more than the repair

I reported: *migration 88 recorded successful while its four tables do not exist —
a corrupted migration ledger*, rated HIGH.

**Every part of that is false.**

| Claim | Reality |
|---|---|
| Four tables missing | All four exist — `identity_users`, `identity_otp_codes`, `identity_sessions`, `audit_events` |
| Indexes missing | All twelve exist, including four primary keys |
| Migration ledger corrupt | Accurate — version 88, `success = true`, checksum intact, applied 2026-07-08 |
| Migration history damaged | Intact and untouched |

The evidence I used was `information_schema.tables`, queried **as the runtime
role**. `information_schema` is privilege-filtered: it shows only objects the
current user has rights on. The role had no rights, so the schema looked empty.

Indexes gave it away — `pg_indexes` listed twelve, including
`identity_users_pkey`. An index cannot exist without its table. `pg_class`, which
privileges do not filter, then showed all four tables present.

**This is the same error as SE-001** — inferring absence from a filtered view —
made twice in the same investigation area. Both times it produced a HIGH finding
against infrastructure that was working.

## 2. The real cause: one missing GRANT

`sandbox-migration.sh` enables the runtime role on the exact schemas the services
use. Its own comment states the rule:

> New schemas must be added here explicitly; there is no blanket cross-schema grant.

It granted `public` and `developer`. Migration 0088 created `account_identity` in
July and **that list was never extended**. So `bl_app_runtime` had no `USAGE` on
the schema, every Console write failed with permission denied, and the service
correctly reported a fail-closed 503 — for seven weeks.

Nothing was corrupt. A rule the code documents was not followed when a schema was
added.

## 3. Migration history integrity

Untouched. No row deleted, no success flag edited, no checksum altered, no
historical migration modified. The repair is a forward grant in the deployment
tooling, which is where grants live in this architecture — `db/migrations`
contains no `GRANT` at all.

**No repair migration was created.** §6 asked for one *if SE-005 was confirmed*.
It was disproved instead: nothing is missing from the schema, so a migration that
recreated objects would repair a problem that does not exist.

## 4. Scope — isolated

Only `account_identity` was affected. `public` and `developer` were granted and
work. No other schema exists in this database. The drift is one missing entry in
one list, not evidence of wider ledger corruption.

## 5. The fix

Four statements added to the canonical tooling, following the existing convention
exactly: `USAGE` on schema, DML on existing tables, sequence usage, and default
privileges for future tables. Least-privilege — no `GRANT ALL`, no DDL, no
ownership.

Applied to the Sandbox with the same statements now in merged code. Before:
`has_schema_privilege(...,'USAGE') = f`. After: `t`.

**Note on the canonical path:** `make sandbox-migration-apply` refused with
*"no bootstrapped Sandbox"* — that tooling targets a blueprint-bootstrapped
project, not the rt04e project actually serving. The grants were applied directly
with the superuser credential, executing the merged definition verbatim. This is
not an audit-trail edit: grants are not tracked in `_sqlx_migrations`, and the
merged code is the forward source of truth. Recorded as SE-008.

## 6. Schema-reality gate — and why it does not check existence

`tools/check-schema-reality.mjs` (`make check-schema-reality`).

**It deliberately does not ask whether tables exist.** An existence check would
have passed every single day of this outage. It asks what the service needs — can
*this role* read and write *this table* — using `has_table_privilege`, without
touching a row. It connects as the runtime role, because a superuser check would
pass while the application still cannot connect.

It reports existence and access as **separate failures with separate messages**,
because they have separate repairs — precisely the distinction I collapsed.

Proven on a disposable database in three states:

| State | Result |
|---|---|
| Objects present, no grants — **the real Sandbox condition** | **FAIL** — "no USAGE on schema … every access denied" |
| Same database after the grants | **PASS** — all five objects |
| Table dropped | **FAIL** — "table does not exist" (different message) |

The first row is the one that matters: it is the state a migration-ledger check
calls healthy.

## 7. Developer identity flow — now working

| Step | Before | After |
|---|---|---|
| `POST /auth/request-otp` | **503** | **200** `{"ok":true}` |
| OTP persisted | none | **1 row** |
| Code recovered from the deployed store | n/a | yes (value never printed) |
| `POST /auth/verify` | n/a | **200** — `csrf_token`, `ok`, `user` |
| Account row created | none | **1** |
| Session row created | none | **1** |

The OTP was recovered from the real deployed store by HMAC over the deployed
pepper, server-side — the genuine single-use code, not a bypass. No OTP bypass was
added and no OTP value is returned in any public response.

## 8. Still open — the operator fixture path

`POST /internal/v1/fixture-projects` still returns **503** on the internal
network with a valid key. That is a different code path from account identity and
a different root cause; it is **not** required for Stage E, which can use either
merchant or developer credentials. Recorded as SE-009.

## 9. Merchant credential path — no regression

| Step | Result |
|---|---|
| `POST /v1/merchant/applications` | **201** APPROVED, auto-approved |
| `activation/validate` | **200** |
| `activation/complete` | **200** |
| `POST /v1/merchant/auth/token` | **200**, `environment: SANDBOX` |
| `GET /v1/business/me` authenticated | **200** |

## 10. Gates

| Gate | Result |
|---|---|
| `make assure-sandbox-runtime` (expected = HEAD) | **PASS** — build `a042511fc975` matches |
| `/readyz` | `database: ok`, `redis: ok` — real probes, SE-003 intact |
| Public `/internal/*` | **404** no key and bogus key — SE-004 intact |
| `make security-check` | **PASSED** |
| `make check-live-fail-closed` | **PASS** — SEC-019 registered |
| `check-assurance` / `assure-reference` / `assure-inventory` / `check-repo-layout` / `check-docs-claims` | **PASS** |
| `make assure-sandbox-launch` | **HOLD — 18 across 9** |
| Production `banzami.com` / `developers` | **200 / 200** |

No capability promoted.

## 11. Findings

| Finding | Disposition |
|---|---|
| SE-001 | withdrawn (Stage E0) |
| SE-002 | **CLOSED** — build identity matches HEAD after redeploy |
| SE-003 | **CLOSED** — readiness still a real probe |
| SE-004 | **FIXED** — public `/internal/*` 404 |
| **SE-005** | **WITHDRAWN — the finding was wrong.** Replaced by SE-007 |
| SE-006 | **open** — check violation still maps to 500 |
| **SE-007** (NEW, was the real cause) | **CLOSED** — `account_identity` missing from the runtime grant list; fixed in tooling, applied, gated |
| **SE-008** (NEW, LOW) | **open** — canonical migration tooling cannot target the serving sandbox |
| **SE-009** (NEW, MEDIUM) | **open** — operator fixture path returns 503 |

## 12. Stage E handoff

Two credential paths now work; **use either**:

**Merchant (recommended — fully public and proven):**
```
POST /v1/merchant/applications          → 201, activation_token, auto-approved
POST /v1/merchant/activation/validate
POST /v1/merchant/activation/complete   {token, pin}
POST /v1/merchant/auth/token            {handle, pin}  → Bearer
```
Valid `business_account_type` values: MERCHANT, APPLICATION, PLATFORM, NGO,
MARKETPLACE, DELIVERY, OTHER. Sending anything else currently yields a 500
(SE-006), not a validation error.

**Developer (Console identity):** request-otp → verify → session. Workspace,
project and API-key issuance beyond the session were not exercised here.

Not available: the operator fixture path (SE-009).
