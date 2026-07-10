# Website Recovery Assurance Gate — Fix Evidence

Version: 1.0

> **Scope note.** Sanitised: no IPs, hostnames, SSH users, server paths, secrets, tokens,
> DB URLs, raw logs or private endpoints. Internal operations record.

## Prior problem

The `banzami.com` Cloudflare 522 recovery had to set the break-glass emergency flag
`BANZAMI_SKIP_ASSURANCE=1` to run a **website-only** deploy. This skipped the entire
deploy-time assurance gate, weakening enforcement on an emergency path — the exact situation
recorded as a follow-up in `WEBSITE_522_INCIDENT_RECOVERY.md` and the website recovery
runbook.

## Root cause of the assurance failure

The deploy-time assurance gate ran the **full** check set for **every** deploy, including a
website-only deploy. One of those checks — the repository-layout check — failed because the
legitimate top-level `tests/` directory (cross-cutting E2E harnesses) was **not** in the
accepted top-level list nor documented in the layout freeze. That single unrelated failure
aborted the website deploy, so the only way through was to skip the whole gate. In short:
the gate was **not scope-aware**, and an unrelated layout expectation blocked an emergency
website restore.

## Fix applied

Two focused changes, no global safety weakened:

1. **Root cause** — the legitimate top-level `tests/` directory is now **documented and
   accepted**: added to the layout check's accepted set, to the repository-layout freeze in
   `CLAUDE.md` §19.1, and to the `README.md` structure table (per the "document in three
   places" rule).
2. **Scope-aware gate** — the deploy-time assurance gate now branches by scope:
   - **website-only** (`./deploy.sh website-frontend`) runs **global-safety + website-specific**
     checks only: repository layout, Live fail-closed, and a new
     `tools/check-website-recovery-preflight.mjs` (website source present, build command
     present, website architecture/recovery docs present). It does **not** run the unrelated
     manifest / asset-inventory / docs-claims / SDK-contract checks.
   - **general/full** deploys keep the complete, stricter set (unchanged).
   - A safe gate-only mode (`BANZAMI_ASSURANCE_ONLY=1`) evaluates the gate and exits before
     any build/deploy — used for testing without Docker or network.

**Global safety is preserved and unchanged:** the single source-of-truth preflight guard
(wrong-checkout / `banzami-canonical` rejection) still runs unconditionally before the gate,
the no-local-Mac-QEMU-fallback rule is intact, and `BANZAMI_SKIP_ASSURANCE=1` remains a
**break-glass** escape only, not the normal website recovery path.

## Validation performed

- Shell syntax checks pass (`deploy.sh`, the new test).
- `tests/ops/website-assurance-gate.test.sh` — **pass 7 / fail 0**:
  1. website-only assurance passes from the authorised repo **without** an assurance-skip;
  2. website recovery preflight passes; website scope runs only global-safety + website
     checks (no unrelated checks); legitimate `tests/` is accepted;
  3. wrong-checkout / `banzami-canonical` still rejected;
  4. the full/general gate still runs the stricter check set;
  5. no local Mac QEMU amd64 build fallback path exists.
- No Docker, network, database, migration or external provider was used by the tests.

## Services not touched

No payment/admin/gateway/API/pay/checkout/Developer Platform service was touched. No deploy,
publish, migration, database command, VM reset, Docker prune, or DNS/certificate/SMTP change
was performed. The full production stack was not restored.

## Final result

The website-only recovery/build path now passes the assurance gate **without** a skip, while
the stricter full-deploy gate and all global safeguards remain in force. The follow-up
recorded after the 522 incident is **resolved**.
