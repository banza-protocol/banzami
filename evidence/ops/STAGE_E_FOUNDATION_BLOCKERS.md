# Stage E — Deployed Sandbox E2E: foundation blockers

- **Date:** 2026-08-30
- **Baseline:** `main` @ `a10749c7`, clean tree
- **Verdict: `Full External Sandbox Launch: HOLD`** — unchanged, 18 failures
  across 9 capabilities, `public released: 5/14`
- **Capabilities promoted: none.** No capability E2E was executed, because none
  could be executed honestly. Why is below.

No secrets, tokens or keys appear in this record.

---

## 1. Where Stage E stopped, and why

Stage E requires deployed E2E through the canonical public perimeter. Every
payment capability route is authenticated:

```
POST /v1/business/payment-sessions   → DualAuth (developer key OR merchant JWT) + Idempotency
POST /v1/payment-links               → same
```

So the first requirement is a credential obtained through an authorised flow.
**All three credential paths are unavailable in the deployed Sandbox.** This was
established by probing the real public perimeter, not by reading configuration.

| Path | Probe | Result |
|---|---|---|
| Developer Console account → project → API key | `POST developer-api/auth/request-otp` | **503 UNAVAILABLE** |
| Merchant onboarding → activation → merchant JWT | `POST sandbox-api/v1/merchant/applications` | **500 INTERNAL_ERROR** (4 ms, never reached core) |
| Operator fixture keys (the path built for E2E) | `POST developer-api/internal/v1/fixture-projects` | **401** — internal key not held, and not configured on the container |

`admin.banzami.com`, which would approve a merchant application manually, is
**503** — not served.

Handle availability (`check-handle`) returns 200, so onboarding *looks* alive
from outside; it fails at persistence.

## 2. FINDING SE-001 — deployed services run without database and secret configuration

**Severity: HIGH** (blocks all Stage E capability E2E) · deployment/config, not code

Container environments, read from `docker inspect .Config.Env` (names only):

| Service | Vars | `DATABASE_URL` | `OTP_PEPPER` / `SESSION_SECRET` | `DEVELOPER_INTERNAL_KEY` |
|---|---|---|---|---|
| api-gateway | 15 | **absent** | n/a | n/a |
| developer-api | 14 | **absent** | **absent** | **absent** |

The code paths match the observed failures exactly: developer-api falls back to
an **in-memory** account store without `DATABASE_URL`, and
`main.go` warns that "OTP_PEPPER / SESSION_SECRET not set — auth fails closed
until configured" — which is the 503. The gateway cannot persist a merchant
application, which is the 500 in 4 ms with no core call.

Consequence beyond Stage E: the Developer Console cannot issue keys at all, so
this is not only a testing obstacle — the sandbox developer onboarding advertised
to external integrators is non-functional.

## 3. FINDING SE-002 — the deployed Sandbox is not running `main`

**Severity: HIGH** (would invalidate any evidence gathered) · release/deployment

| Container | Image | Started |
|---|---|---|
| api-gateway | `bzrelease-20260709190348-45557-26598-api-gateway-staging:local` | 2026-07-09 |
| developer-api | `banzami-sandbox/developer-api:e50c48e6c0d0` | 2026-07-09 |

Roughly **7.5 weeks** behind `main` (`a10749c7`). Independent corroboration, not
just image tags: under current `main`, a gateway with no `DATABASE_URL` would
compute `checkStub(false)` and `/readyz` would return **503 degraded**. The
deployed gateway returns **200** with `"database":"ok"`. The running binary
therefore cannot be built from `main`.

This matters more than the credential blocker. Even with credentials, E2E against
this stack would evidence a 2026-07-09 build, and the manifest would then record
capability evidence for code that is not the code in the repository. That is
precisely the "green capability without deployed behavioural evidence" the Stage E
brief exists to prevent — one layer further back.

## 4. FINDING SE-003 — `/readyz` dependency checks are stubs, and my gate trusted them

**Severity: MEDIUM** (assurance vacuity) · found in `main`, and it is my own gate that relied on it

`services/api-gateway/internal/handler/health.go`:

```go
"database": checkStub(cfg.DatabaseURL != ""),
"redis":    checkStub(cfg.RedisURL != ""),
// TODO: replace stubs with real connection probes once the DB and
// Redis clients are injected into the server.
```

`checkStub` returns `"ok"` when a **config string is non-empty**. It never opens a
connection. The handler's own doc comment says *"Returns 200 when all critical
dependencies are reachable"* — which is not what it does.

Every Stage C/D report in this repository, including mine, cited
`{"database":"ok","redis":"ok"}` as evidence the Sandbox was healthy. That
specific claim was vacuous throughout.

What survives: the runtime gate's other assertions are real — HTTP 200 from live
endpoints, `environment=sandbox`, and `/consumer/v1/consumers/search` returning
`{"data":[]}` from an actual query through public-api → core → PostgreSQL. A dead
database cannot produce that response, so the *conclusion* that the Sandbox was
operational still holds; one of its stated reasons did not.

**Fixed here:** `tools/check-sandbox-runtime.mjs` no longer presents the readyz
db/redis fields as dependency evidence and records why. **Not fixed here:** the
stub itself, which needs DB/Redis clients injected into the gateway — a service
change, and one the 2026-07-09 deployment would not carry anyway.

## 5. FINDING SE-004 — internal operator endpoints were publicly reachable (FIXED)

**Severity: MEDIUM** (unnecessary public exposure of an authenticated control plane) · introduced by the Stage C sandbox-edge

`developer-api` mounts `/internal/v1/fixture-projects`,
`/internal/v1/projects/{id}/fixture-keys` and
`/internal/v1/fixture-keys/{id}/revoke`. The Stage C edge forwarded everything, so
these were reachable from the Internet at `developer-api.banzami.com`.

The guard held — no key and a wrong key both returned **401 "internal auth
required"**, failing closed — so this was exposure, not a breach. But an
authenticated operator control plane published on the public perimeter is a
brute-force and auth-amplification target that gains nothing from being reachable.

**Fixed:** the edge now refuses `/internal/` with **404** before the request
reaches the service (404 rather than 403 — a 403 confirms the path exists).
Verified after the change: both endpoints **404**, while
`developer-api/health`, `sandbox-api/health`, `/readyz` and the `/consumer` route
all still return **200**, production `banzami.com` and `developers.banzami.com`
still **200**, and `make assure-sandbox-runtime` still **PASS**.

## 6. What was NOT done, deliberately

- **No capability was promoted.** Not one of the nine.
- **No E2E was fabricated** against a stack that cannot authenticate a caller.
- **No credential was manufactured** by editing the database, seeding rows, or
  configuring secrets on the deployed host — Stage E requires credentials from
  authorised flows, and inventing one would have made every downstream result
  meaningless.
- **No gate was weakened** and no failure count was targeted.
- **Stage D/D.1 infrastructure was not modified** except the SE-004 security fix,
  which was verified not to regress routing, TLS or production.

## 7. Order of work to unblock Stage E

1. **Redeploy the Sandbox from current `main`** (SE-002). Until the deployed
   build is the build under assurance, no evidence gathered is about `main`.
2. **Provision the missing configuration** (SE-001): `DATABASE_URL` for gateway
   and developer-api, `OTP_PEPPER`, `SESSION_SECRET`, `DEVELOPER_INTERNAL_KEY`.
   Then the Console can issue keys and the fixture-key path — built precisely for
   this — becomes usable.
3. Re-run the credential probes in §1; all three should stop failing.
4. Only then begin slice E1 (CAP-PAY-001/002/003).

Steps 1 and 2 are operator/deployment actions, not repository changes. Stage E's
engineering work cannot start before them.

## 8. Gates at time of this record

| Gate | Result |
|---|---|
| `make assure-sandbox-runtime` | **PASS** — 4/4, `environment=sandbox` |
| `make assure-sandbox-launch` | **HOLD — 18 failures across 9 capabilities**, `public released: 5/14` |
| `make check-live-fail-closed` | **PASS** — SEC-019 registered |
| Production `banzami.com` / `developers` | **200 / 200** |
| Public Sandbox routing / Full (strict) / direct origin | intact / intact / **blocked** |
