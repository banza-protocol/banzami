# Stage E0 — Sandbox Deployment Identity, Configuration & Readiness Closure

- **Date:** 2026-08-30 / 2026-08-31
- **Final commit deployed:** `e5357c2bfa440084aaf0b41a8b2d402082c0d456`
- **Verdict: `STAGE E0: HOLD`** — three of four objectives closed; credential
  acquisition remains open (§8).

No secrets, tokens, DSNs or key material appear in this record.

---

## 1. Outcome

| Objective | Result |
|---|---|
| Redeploy Sandbox from current `main` | **DONE** — all four services on `e5357c2bfa44` |
| Deployed build identity provable | **DONE** — reported at runtime, asserted by the gate |
| `/readyz` a real proof, not a stub | **DONE** — real bounded probes, 8 regression tests |
| Provision required configuration | **N/A — the premise was wrong** (§3) |
| An authorised credential path works | **NOT ACHIEVED** (§8) — Stage E stays blocked |

Stage E may **not** resume: without credentials no authenticated capability E2E
can run, which was the original Stage E blocker and is the one thing E0 did not
clear.

## 2. Deployment identity — before and after

| | Before | After |
|---|---|---|
| api-gateway | `bzrelease-20260709…:local`, built 2026-07-09 | `banzami-sandbox/api-gateway-staging:e5357c2bfa44` |
| core-api | `bzrelease-20260709…:local`, built 2026-07-09 | `banzami-sandbox/core-api-staging:e5357c2bfa44` |
| public-api | `bzrelease-20260709…:local`, built 2026-07-09 | `banzami-sandbox/public-api-staging:e5357c2bfa44` |
| developer-api | `banzami-sandbox/developer-api:e50c48e6c0d0` (105 commits behind) | `banzami-sandbox/developer-api:e5357c2bfa44` |
| Runtime-reported build | **nothing served could say** | `/health` + `/readyz` report `e5357c2bfa44` |

`GET /readyz` now answers:

```json
{"build":"e5357c2bfa44","checks":{"database":"ok","redis":"ok"},
 "environment":"sandbox","status":"ok"}
```

and `make assure-sandbox-runtime` with `BANZAMI_SANDBOX_EXPECTED_COMMIT` set
compares it against the revision under assurance. The expected commit is an
**input**; a SHA baked into the script would go stale on the next merge and start
passing for the wrong reason.

**SE-002 CLOSED.** The deployed build corresponds to the current approved source
revision, and that correspondence is now machine-checkable over the public
surface rather than by reading an image tag over SSH.

## 3. SE-001 — WITHDRAWN. The finding was wrong.

Stage E reported that the deployed services were "missing required configuration"
— `DATABASE_URL`, `OTP_PEPPER`, `SESSION_SECRET`, `DEVELOPER_INTERNAL_KEY`. That
conclusion came from reading `docker inspect .Config.Env`.

**That is the wrong place to look, by design.** This deployment mounts every
secret as a file at `/run/secrets/*` and exports it in-process in the entrypoint,
specifically so it never appears in container config, image metadata or
`docker inspect`. All eight secrets are present and non-empty, and the gateway's
new real database probe now proves the DSN works by opening a connection.

The correct reading of the original evidence was "these variables are absent from
container env", which in this architecture is the expected state. I inferred
absence of configuration from absence in one metadata view, and repeated it in two
reports before checking the mounts.

**Disposition: withdrawn, not downgraded.** The credential failures it was offered
to explain are real and remain open, but they have a different cause.

## 4. SE-003 CLOSED — readiness now probes what it claims

Before: `"database": checkStub(cfg.DatabaseURL != "")` — true whenever a config
string was non-empty — under a doc comment claiming reachability, beside a TODO
admitting the gap.

After: bounded 2-second probes against the **same pool the gateway itself uses**.
Probing a private connection would prove PostgreSQL accepts callers, not that this
gateway can reach it. Driver errors are never surfaced: a DSN, host or credential
can appear in one, and this endpoint faces the Internet. Nil clients fail closed.

Regression tests assert that readiness can say **no** — a suite proving only the
happy path would reproduce the vacuity it closes:

| Case | Result |
|---|---|
| Configured DSN, unreachable DB | 503 `unreachable` |
| Unconfigured DB | 503 `not_configured` |
| DSN set, pool nil | 503 `not_configured` |
| Unreachable Redis | 503 `unreachable` |
| Listener that accepts and never speaks | 503, bounded |
| Real PostgreSQL, valid user | `ok` |
| Same live DB, wrong user | `unreachable` + 503 |
| Build identity reported / absent | `e5357…` / `unknown` |

## 5. SE-004 — regression guard holds

Public `/internal/v1/fixture-projects` returns **404** with no key and with a
bogus key, refused at the edge before reaching the service.

## 6. Three deployment defects found and fixed

None of these were known before Stage E0; all three surfaced because deploying
current `main` was attempted for the first time in seven weeks.

**E0-D1 — deploy attached a network to a running container.** `deploy_one` ran
`docker run -d --network DATA` then immediately `docker network connect APP`.
Attaching a network to a running container reconfigures Docker's embedded
resolver underneath it. Fixed: create → attach → start.

**E0-D2 — services aborted on a boot-time DNS blip.** public-api exited and
core-api panicked (exit 101) with `server misbehaving` / `Temporary failure in
name resolution` for a hostname that resolves seconds later. A freshly created
container can run its first instruction before Docker's resolver is serving for
it. The failure mode is worse than a slow start: the deploy rolls back, and the
rolled-back container boots through the same window, so the service stays down
until a human restarts it — which happened three times during this work.

Fixed with a bounded retry in both services: six attempts over ~10s, each
individually timed out, then still fail. An absent database must still stop the
process. **Confirmed working in production** — core-api logged
`database not reachable yet, retrying attempt=1 of=6` on its next deploy and came
up healthy.

Note E0-D1 was a genuine fix but did **not** close E0-D2: the container now starts
with both networks attached and still loses the first lookup. The remaining window
belongs to container creation.

**E0-D3 — build identity froze on the first deploy that used it.** `cmd_deploy_one`
clones the previous container's env and swaps only the image, so it re-applied the
old container's `BANZAMI_BUILD_COMMIT` as an explicit `-e`, shadowing the new
image's ENV. The container was created from image `:9c2d0f428fec`, whose ENV says
`9c2d0f428fec`, while `/readyz` answered `4a924e764024`.

Caught by the runtime gate on the first deploy after the identity work landed.
Cloudflare caching and a wrong image were ruled out (origin-direct and
cache-busted requests both returned the stale value; container `.Image` matched
the new tag's id exactly). **A build identity that silently freezes is worse than
none, because it looks like an answer** — it would have certified stale
deployments as current, which is what Stage E found had already happened once by
other means.

## 7. Migrations

Not run. The deploy path used (`sandbox-source-deploy.sh`) explicitly performs no
migration, and no migration was required for the services to come up healthy —
the gateway's own boot-time schema validation passed on the new build. Whether
the sandbox schema is current with respect to `main` is **not established by this
stage** and is a candidate cause for §8.

## 8. OPEN — credential acquisition still fails

Retested after all four services were on `e5357c2bfa44`:

| Path | Result |
|---|---|
| `POST developer-api/auth/request-otp` | **503 UNAVAILABLE** |
| `POST sandbox-api/v1/merchant/applications` | **500 INTERNAL_ERROR** |
| Operator fixture path | not publicly reachable by design (SE-004) |

What has been **eliminated** as the cause:

- stale code — all services now run current `main`;
- missing secrets — all eight are mounted and the DB probe proves the DSN works;
- unreachable database — `/readyz` opens a real connection and it succeeds;
- missing table — `public.merchant_applications` exists with 37 columns;
- missing privilege — the runtime role holds `INSERT` on it;
- platform-mode gate — `GET /v1/platform-mode` returns `SANDBOX` and the handler
  returns 409 on mismatch, not 500;
- core-api — no corresponding error; the gateway fails in ~7 ms without calling it.

What remains untested: schema drift between `main` and the sandbox database
(§7), and the developer-api OTP path, which logs nothing at all for a failed
request — itself worth fixing, because a 503 with no log entry is not diagnosable
from outside.

**Neither failure is a Stage E capability defect.** Both are in the setup path
that Stage E needs before it can begin.

## 9. Gates at close

| Gate | Result |
|---|---|
| `make assure-sandbox-runtime` (expected commit set) | **PASS** — 4 surfaces + identity |
| `make check-assurance` | **PASS** |
| `make assure-reference` | **PASS** |
| `make check-live-fail-closed` | **PASS** — SEC-019 registered |
| `make check-repo-layout` / `assure-inventory` / `check-docs-claims` | **PASS** |
| `make assure-sandbox-launch` | **HOLD — 18 failures across 9 capabilities** |
| Production `banzami.com` / `www` / `developers` | **200 / 301 / 200** |
| Direct origin `:2053` | **blocked** |
| Public `/internal/*` | **404** |

No capability status was changed.

## 10. Next actions to resume Stage E

1. Diagnose the merchant-application 500 — most likely schema drift; compare the
   sandbox schema against `main` and run migrations through the canonical tooling.
2. Add error logging to the developer-api OTP path; a 503 with no log line cannot
   be diagnosed from outside.
3. Re-run the §8 probes. Stage E resumes when at least one authorised credential
   path works end to end.
