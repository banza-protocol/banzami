# RT04E — Secure Operator Rollout (preparation)

> **SUPERSEDED — do not follow this procedure.**
>
> RT04E was the rollout of migration `0100`. It is kept as a record of how that
> rollout was performed and reviewed, not as an instruction.
>
> The only sanctioned path that migrates the Sandbox database is
> `infra/blueprint/sandbox-ops/scripts/sandbox-migration.sh`, which says so in
> its own header: *"the ONLY controlled path that migrates banzami_staging …
> never the legacy RT04E path"*. It binds the target to the generated Sandbox
> project's own network and secrets, so it cannot reach a database that merely
> shares the name — which is the failure this path allowed.

**Status:** prepared, reviewed — **not executed**. Sandbox-only.
**Version:** 1.0

This document specifies the secure procedure for executing the RT04E payment-binding
rollout (migration `0100` → Core/Developer-API/Gateway deploy → fixture E2E →
release) **without ever exposing the sanctioned Sandbox migration credential to the
agent (Claude/Bash) execution context, the deployment host at rest, or any
application runtime**.

It exists to eliminate an unsafe assumption from earlier trains — that the
migration credential must be readable from the general Bash/Claude environment. It
must not. The credential is handed off **once, ephemerally, by the operator**, from
the operator-controlled secure tunnel/secret environment, and the agent receives
only sanitised results.

Deliverables in this change:
- `infra/deployment/rt04e-secure-rollout.sh` — the reviewed root-owned runner template.
- `tools/check-rollout-secret-hygiene.mjs` — static leakage gate (`make check-rollout-secret-hygiene`).
- this runbook + threat model.

---

## 1. Trust-boundary model

```
┌─ operator secure environment ─────────────┐        ┌─ Sandbox deploy host ─────────────┐
│ sanctioned migration credential           │        │ Core / Developer-API / Gateway     │
│ (tunnel / secret manager) — NEVER copied  │        │ runtime config (per-service env)   │
│                                            │        │  · CORE_PAYEE_VALIDATION_KEY        │
│   one-shot handoff via protected stdin ────┼──────▶ │    (Core + Developer-API only)      │
│   (no argv, no profile, no shared env)     │        │  · CORE_API_URL (Developer-API)    │
└────────────────────────────────────────────┘        │  · PAYMENT_CAPABILITY_RELEASED=false│
        ▲ sanitised results only                       └────────────────────────────────────┘
        │
┌─ agent (Claude/Bash) ─┐   never reads the migration credential; never sources it;
│ orchestration + gates │   receives only presence/absence + pass/fail status.
└────────────────────────┘
```

The migration credential (`BANZAMI_MIGRATE_URL`) must **never** be:
available to the general Bash/Claude environment · persisted on the deploy host ·
placed in a shared application `.env` · injected into Core/Gateway/Developer-API/
Console/browser/SDK/DOA/BanzAI runtime · passed as an argv · printed/logged/
committed/included in evidence.

It is required by exactly **one** subprocess — `tools/migrate-and-verify.sh` (which
reads `DATABASE_URL`) — and only for the migration step. After that step the runner
clears it from memory; all subsequent deploy/E2E/release steps use ordinary runtime
config and never see it.

---

## 2. The runner (`infra/deployment/rt04e-secure-rollout.sh`)

Security design (enforced by `make check-rollout-secret-hygiene`):

1. **Runs only on the approved Sandbox target.** Refuses unless
   `BANZAMI_DB_TARGET=banzami_staging`; hard-refuses any `*prod*`/`*live*`/`banzami`
   target and any `I_ACK_PRODUCTION_TARGET`.
2. **Protected, ephemeral handoff only.** The credential is read via
   `IFS= read -rs BANZAMI_MIGRATE_URL` from **stdin** (an approved secret-manager
   pipe, or a hidden interactive prompt). Passing it as an argument is an explicit
   error (`[ "$#" -eq 0 ]` guard).
3. **No leakage surface.** `set +x` (never `set -x`); `PS4=''`; `umask 077`; the
   value is validated with pure bash parameter expansion and a `grep <<<` here-string
   — it is **never** given to `echo`/`printf`, never rendered to a terminal/file/log.
4. **Transient, minimum lifetime — not a memory wipe.** The credential is held
   only transiently, in one shell variable in the runner process, and injected
   into the single `migrate-and-verify` subprocess via an inline `DATABASE_URL=…`
   **environment** assignment (never an argv). On exit (success, error, or signal)
   an `EXIT/INT/TERM/HUP` trap `unset`s the variable, **removing it from the runner
   environment**. This is a scope/lifetime control: **Bash cannot provide a
   cryptographic guarantee of physical memory zeroization**, and the runner does
   not claim to. It guarantees only that the value is not persisted to disk,
   runtime configuration, logs, arguments or shared environment, and does not
   outlive the process. The runner opens **no** separate `psql` connection (that
   would place the URL in a process argv); the migration gate opens the only
   connection.
5. **Fail-closed validation.** Aborts (non-zero, nothing released) if the credential
   is absent/empty, does not target `banzami_staging`, carries a live/prod marker,
   or cannot reach the Sandbox database.
6. **Refuses destructive/down migrations.** Aborts if `0100` contains
   `DROP/TRUNCATE/ALTER…DROP` DDL or if any `*down*.sql` exists (forward-only).
7. **Refuses pre-released state.** Aborts if the payment capability is already
   released before the E2E release decision (operator `rt04e_release_state` hook).
8. **Exclusive lock (§4).** Acquires a root-owned `flock` (`exec 9>…; flock -n 9`,
   default `/run/lock/rt04e-rollout.lock`) before any action and holds it for the
   whole run (auto-released when fd 9 closes at exit). A second concurrent rollout
   **fails closed** (`another rollout is already in progress`) with no host path in
   the message. The lock's stderr redirection is scoped so it never silences
   `die()`.
9. **Revision pinning (§5).** Requires `RT04E_RELEASE_REV` (a non-secret approved
   git SHA); verifies `git rev-parse HEAD` matches it and the worktree is clean
   (`git status --porcelain` empty); **never** runs an unbounded repository update;
   records the pinned short SHA in sanitised evidence, so Core/Dev-API/Gateway/
   Checkout all build from one reviewed release set.
10. **Sanitised output only.** Emits `present/absent`, target class and step status
   — never a value; connection failures reduce to `migration failed — target
   unreachable, credential rejected, or schema drift`.

Root-owned install, restrictive permissions:

```bash
install -o root -g root -m 0700 \
  infra/deployment/rt04e-secure-rollout.sh /root/rt04e-secure-rollout.sh
```

---

## 3. Operator runbook (manual, one-time)

The **operator** performs the one-time secret handoff manually from the existing
secure tunnel/secret environment. The agent is not involved in the handoff and
never sees the value.

1. Open the sanctioned Sandbox DB tunnel from the operator secure environment (as
   today). Do **not** export the URL into a shared shell or profile.
2. Provision the persistent runtime secrets **once** (see §4) through the approved
   per-service mechanism — Core + Developer-API only. Keep
   `PAYMENT_CAPABILITY_RELEASED=false`.
3. Run the runner, feeding the migration credential via protected stdin from the
   secret manager (preferred) or the hidden prompt:

   ```bash
   # check out the approved revision first (the runner verifies, never pulls):
   git -C /srv/banzami/repo checkout <approved-git-sha>

   # preferred — from an approved secret manager, no echo/argv/history:
   RT04E_RELEASE_REV=<approved-git-sha> BANZAMI_DB_TARGET=banzami_staging \
     /root/rt04e-secure-rollout.sh < <(operator-secret-get banzami/staging/migrate_url)

   # or interactively (input hidden, not stored in history):
   RT04E_RELEASE_REV=<approved-git-sha> BANZAMI_DB_TARGET=banzami_staging \
     /root/rt04e-secure-rollout.sh
   ```
4. The runner applies `0100` via `migrate-and-verify`, clears the credential, then
   deploys Core → Developer-API → Gateway (quarantined), runs the deployed E2E, and
   stops **before** release.
5. Only if every E2E item passes, enable the payment-release control as a **separate**
   approved operator action, then flip `CAP-PAY-001/002` + `CAP-APP-004` to
   `released` and regenerate assurance docs.
6. The agent receives only the sanitised status stream and the gate outputs
   (`make assure-project-payment-binding`, `make assure-payments-foundation`).

**No secret is copied into the agent's shell context at any point.**

---

## 4. Persistent runtime-secret boundary (provision once, per-service)

`docker-compose*.yml` uses per-service `environment:` blocks, so each variable is
scoped to named services.

### `CORE_PAYEE_VALIDATION_KEY` (dedicated, least-privilege — RT04C §3)
- Inject **only** into: Sandbox **Core** and Sandbox **Developer API** service blocks
  (both reference the same `${CORE_PAYEE_VALIDATION_KEY}` from the root-owned `.env`).
- **Absent** from: Gateway, Developer Console frontend, browser/client bundles, SDKs,
  DOA, BanzAI, public env files, logs/diagnostics.
- Core accepts it **only** on `POST /internal/v1/wallet-accounts/validate-payee`; it
  authorizes nothing else (no settle/transfer/refund/payout/wallet-mutation/
  merchant impersonation). Distinct from `CORE_INTERNAL_KEY`. Missing/invalid →
  fail closed. Enforced at rest by check **E**.

### `CORE_API_URL` (Developer-API → Core)
- Inject **only** into the Sandbox Developer-API service block; value
  `http://core-api-staging:8081` (Sandbox internal boundary only).
- Do **not** alter the Gateway's existing independent Core configuration.
- Developer-API fails closed at startup if missing/malformed when payee validation
  is enabled.

### Payment release
- `PAYMENT_CAPABILITY_RELEASED=false` until the deployed E2E passes. Ordinary
  developers cannot receive payment scopes before then. Enforced at rest by check **F**.

---

## 5. Threat model

| Vector | Mitigation |
|---|---|
| **Command-line leakage** (argv in `ps`) | The runner never accepts the credential as an argv (refuses `$#>0`, check **C**) and never passes it as an argv — it opens no `psql` of its own; it hands the value to `migrate-and-verify` only through an **environment** assignment. |
| **Shell-history leakage** | Read via `read -rs` from stdin/secret-manager pipe; never typed as a command with the value; interactive input hidden. |
| **Process-list leakage** | Only `migrate-and-verify` receives it, via inline **env** assignment (visible in `/proc/<pid>/environ` to **root only**, for the migration's lifetime). Its internal libpq connection is standard; the runner adds no additional argv exposure. |
| **Concurrent rollout** | Exclusive `flock`; a second run fails closed (`another rollout is already in progress`), no host path leaked; checks **I**, harness Test 2. |
| **Unapproved / dirty revision** | Runner pins `RT04E_RELEASE_REV`, rejects a mismatched HEAD or dirty worktree, never pulls; checks **J**, harness Tests 3–4. |
| **Shared-env leakage** | Never written to `/srv/banzami/.env` or any app env; static checks **A/B**. |
| **Docker inspection leakage** | Never placed in any Compose runtime env; `docker inspect`/`printenv` on Core/Gateway/Dev-API never shows it; static check **B**. |
| **Log leakage** | `set +x`; value never echoed/printf'd; the `migrate-and-verify` log (which may embed the URL) is discarded, never surfaced; static check **D**. |
| **Incorrect target database** | Hard requirement `db==banzami_staging`; reachability probe; live/prod marker rejection; fail closed. |
| **Production/Live invocation** | `BANZAMI_DB_TARGET` case-refuses prod/live/`banzami`; refuses `I_ACK_PRODUCTION_TARGET`; the underlying `migrate-and-verify` production guard is a second layer. |
| **Interrupted rollout** | `EXIT/INT/TERM/HUP` trap clears the credential; each step fails closed; deploys are idempotent; release is a separate later action, so an interrupt never leaves capabilities released. |
| **Partial migration** | `migrate-and-verify` is transactional per migration + runs the drift detector; a failure blocks all downstream steps; forward-only (no down migrations). |
| **Credential lifetime** | In memory only, in one process, for the migration step; cleared immediately after; never persisted. |
| **Rollback boundaries** | Application code/config rollback only; **never** destructive/down migrations; **never** delete binding/payment/ledger/audit data; `PAYMENT_CAPABILITY_RELEASED` stays false on any failure. |
| **Payee-key over-reach** | `CORE_PAYEE_VALIDATION_KEY` is Core+Dev-API only, authorizes only `validate-payee`, distinct from `CORE_INTERNAL_KEY`; static check **E**. |
| **Default-on release** | `PAYMENT_CAPABILITY_RELEASED` defaults false (config forces false outside sandbox); static check **F**. |

---

## 6. Static gate + canary harness

```bash
make check-rollout-secret-hygiene      # static gate over the whole chain + compose
make test-rollout-runner               # harmless canary / lock / revision harness
```

**Static gate** (`tools/check-rollout-secret-hygiene.mjs`) rejects, across all tracked
files and the whole chain (runner + `migrate-and-verify.sh` + `deploy.sh`): (A) a
literal `BANZAMI_MIGRATE_URL` connection string; (B) `BANZAMI_MIGRATE_URL` in any
Compose service; (C) argv intake; (D) tracing/printing the credential; (E)
`CORE_PAYEE_VALIDATION_KEY` on Gateway/frontend/SDK/plugin; (F) default-on release;
(G) any chain script enabling tracing; (H) any chain script echoing an **unredacted**
credential; (I) missing exclusive lock; (J) missing revision pin / dirty-worktree
rejection / an unbounded pull; (K) a runner that fails to discard the migrate output
or writes a temp file holding the credential; and the §6 compose boundary — (L)
`CORE_PAYEE_VALIDATION_KEY` on Gateway/frontend, (M) `BANZAMI_MIGRATE_URL` on any
service, (N) `CORE_API_URL` on a browser-frontend.

**Canary harness** (`tools/test/rt04e-rollout-verify.sh`) runs the **real** runner
against a clearly-fake sentinel URL and a fully **stubbed** chain in an isolated temp
dir (no DB / VM / Docker / Sandbox service, no runner modification, no `--dry-run`
backdoor). It proves: (T1) the canary never appears in stdout/stderr/temp files even
when the stubbed migration deliberately over-shares its `DATABASE_URL` (the runner
discards it); (T2) lock contention fails closed; (T3) an unapproved revision and (T4)
a dirty worktree fail closed; (T5) an argv-smuggled secret is refused; (T6) an absent
stdin credential fails closed.

## 7. Manual operator handoff prerequisites (summary)

- Operator holds the sanctioned migration credential in the secure tunnel/secret
  environment; provides it to the runner via protected stdin only.
- Persistent secrets (`CORE_PAYEE_VALIDATION_KEY`, `CORE_API_URL`) provisioned once,
  per-service, Core+Dev-API scoped; `PAYMENT_CAPABILITY_RELEASED=false`.
- Runner installed root-owned `0700` on the Sandbox host.
- Agent receives only sanitised results and gate outputs — never a secret.
