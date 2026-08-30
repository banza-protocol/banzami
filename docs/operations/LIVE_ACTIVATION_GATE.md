# Live Activation Gate — fail-closed protocol

Programme: BANZAMI-SANDBOX-RELEASE-ASSURANCE-001

Live money movement is **not authorized**. This document defines the
fail-closed protocol that must be satisfied — in full — before any real-money
capability is enabled. It is enforced structurally by
`tools/check-live-fail-closed.mjs` (`make check-live-fail-closed`), which asserts
the code-level guards below stay present.

> **Live must be technically prepared and securely disabled — never partially
> enabled.** No single environment variable, flag, deploy, deep link, or admin
> action may move the platform into Live.

## Current state (2026-07-04)

Live has **no data plane**: the host Postgres contains only `postgres` and
`banzami_staging`. There is no live database, no live API keys, no rail
credentials. Platform mode is SANDBOX. The EMIS/Multicaixa rail is a stub that
**errors without credentials** (no phantom success).

## Code-level fail-closed invariants (guarded, must stay true)

| # | Invariant | Enforcement |
|---|---|---|
| 1 | Core environment defaults to **LIVE** when `ENVIRONMENT` is unset (a misconfig cannot silently open Sandbox behaviour); Live sandbox-only test endpoints then reject | `core/api/src/state.rs` (`CoreEnvironment::Live` default + `is_live()` tests) |
| 2 | Sandbox utilities (`/v1/sandbox/*`) hard-enforce SANDBOX | `requireSandbox` in `services/api-gateway/internal/handler/sandbox.go` |
| 3 | A Live write requires **platform_mode agreement**, not just the stack `ENVIRONMENT` var — a LIVE stack refuses writes while platform mode ≠ LIVE | `EnvGate` (`env_gate.go`) → `ENVIRONMENT_MISMATCH` |
| 4 | API keys are environment-bound by prefix (`bz_live_` / `bz_test_`); Sandbox rejects live keys, Live rejects test keys | `core/merchants/src/api_key.rs` |
| 5 | Live rails fail closed without credentials — no simulated success on the live path | `core/acquiring/src/providers/emis.rs` |

These mean Live activation cannot happen through one flag or one deploy:
`ENVIRONMENT=LIVE` alone is refused by EnvGate; platform_mode is a separate,
authenticated, audited admin action; and rails still fail closed without
injected credentials.

## Activation protocol (all required, in order, fail-closed)

1. **Regulatory authorization** — written authorization for real-money operation (external authority).
2. **Formal operator approval** — recorded operator (Banzami) sign-off.
3. **Independent Live environment** — separate host/stack, not the sandbox host.
4. **Independent Live database** — new `banzami` (live) database, created empty; never a copy of sandbox.
5. **Separate Live keys and secrets** — fresh JWT/internal/proof/webhook secrets; distinct from all sandbox secrets; issued to a secrets manager, never in the repo.
6. **Separate hostnames and routing** — live `api.banzami.com` routed to the live stack (not the sandbox stack), with Cloudflare origin controls.
7. **Rail credentials** — EMIS/Multicaixa production credentials injected to the live stack only.
8. **Backup/DR validation** — automated encrypted off-host backups + a proven restore into a scratch target for the live DB (see `infra/deployment/pg-backup.sh` + DR runbook).
9. **Security review** — full security pass on the live configuration (auth, secrets, edge, isolation).
9a. **SEC-019 — progressive-KYC gate on consumer P2P** — decide whether the
    progressive-KYC level/limit gate applies to consumer-initiated P2P transfers
    and, if so, enforce it in the core `send_p2p` path so BOTH surfaces inherit it.
    Today the consumer path enforces sender/recipient identity status (suspended,
    closed, wallet-cannot-receive) and balance, but not KYC level or per-level
    limits. Accepted as a LOW residual while KYC/KYB is not operational — it is a
    regulatory limit, not an access control, since the sender derives from the
    consumer's own token — but it must be settled before real money moves.
    Recorded in `docs/security/BANZAMI_SECURITY_AUDIT.md` (SEC-019). This line is
    asserted by `tools/check-live-fail-closed.mjs`: deleting it fails the gate.
10. **Production E2E** — the deployed-E2E matrix (the sandbox methodology) executed against the live stack with controlled fixtures.
11. **Two-person release approval** — two named operators approve the activation change; recorded.
12. **Rollback plan** — a tested rollback (revert platform_mode, tear down live routing) with the live stack able to be disabled without data loss.

## Automated activation-time checks (must pass before enabling)

- `bz_live_*` rejected by every Sandbox code path; `bz_test_*` rejected by every Live code path (property-tested).
- Live cannot silently fall back to Sandbox, or Sandbox to Live (no default-open path).
- Activation requires ≥2 independent gates (regulatory + platform_mode + rail credentials), never one.
- Backup restore verification is green on the live DB.

Until every item above is satisfied and recorded, Live remains disabled and
`make check-live-fail-closed` guards the envelope.
