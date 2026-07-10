# Website 522 — Incident Recovery (banzami.com)

Version: 1.0

> **Scope note.** Sanitised: no IPs, hostnames, SSH users, server paths, secrets, tokens,
> DB URLs, raw command/Docker output or private endpoints. Public domain names only.
> Internal operations record.

## Symptom

The public institutional website `banzami.com` returned **Cloudflare Error 522 — Connection
timed out**. Cloudflare's edge was reachable ("Browser: working, Cloudflare: working") but
the origin did not answer on the public HTTPS port, so no page could be served.

## Root cause

The origin's **public reverse proxy on port 443 was not running**, and the whole
production application stack was down while its container **images had been removed** (the
public website image was absent and had to be rebuilt). The single public reverse proxy is
also entangled — with no DNS resolver — with payment/admin/gateway upstreams that were down,
so it could not start on its own. The separate Sandbox / Developer Platform stack was
unaffected and healthy throughout. Net effect: nothing listened on public 443 → Cloudflare
522.

## Action taken (website-only, smallest safe intervention)

Approved scope: restore **only** `banzami.com`, without depending on or touching any
payment/admin/gateway/Developer Platform upstream.

1. **Rebuilt only the website image** from the current authorised source of truth and
   started only the website application container (it has **no** payment dependencies). A
   documented emergency flag was used to bypass an unrelated, pre-existing repository-layout
   quality gate (it blocked on an undocumented top-level `tests/` directory, not on the
   website); the website build/start steps themselves were unchanged.
2. **Brought up a dedicated website-only reverse proxy bound to public 443**, whose **only**
   upstream is the website application. This was done via a small, reversible proxy port
   override and a scoped, no-dependencies start — so `banzami.com` serves independently of
   any payment/admin/gateway service.

No image rebuild, restart, or configuration change was applied to any payment, admin,
gateway, API, pay, checkout or Developer Platform service.

## Services touched

- Website application container — **rebuilt and started**.
- Website-only reverse proxy — **created/started on public 443** (single upstream: the
  website).

## Services NOT touched

- Payment, admin, gateway and API services — not started, rebuilt or restarted.
- Pay and checkout services — not touched.
- Database and migrations — not touched.
- Sandbox / Developer Platform stack — left running and healthy (not restarted; unchanged
  uptime).

## Verification result

- `banzami.com` and `www.banzami.com` return **HTTP 200** through Cloudflare.
- **Cloudflare 522 is gone** (no 522 markers in the response; origin answers on public 443;
  local origin check returns 200).
- Only the two website components are new; the full running set is the Sandbox stack (6/6
  healthy, unchanged uptime) plus the two website containers — **zero** production
  payment/admin/gateway/pay/checkout containers were started.
- The Sandbox / Developer Platform stack remained healthy and untouched throughout.

It remains **accepted** that the `api`, `admin`, `pay`, `checkout` and `developers`
subdomains stay offline until a separate, explicitly approved full production restore.

## Prevention recommendations

1. **Website healthcheck + external uptime monitor** on `banzami.com` with alerting on 522.
2. **Restart policy** (`unless-stopped`) confirmed on the website app and website proxy so
   they self-recover after a host/daemon restart.
3. **Decouple the website from the shared proxy**: keep a website-only proxy whose sole
   upstream is the website, so `banzami.com` never depends on payment/admin/gateway health.
   Alternatively add a DNS `resolver` to the shared proxy so a down upstream cannot prevent
   it from starting and serving healthy vhosts.
4. **Separate website deploy from Sandbox/payment deploy** so a full stack outage or an
   image cleanup cannot silently take the public site down.
5. **Guard image lifecycle**: never run a broad image prune on the host without confirming
   the production image set is rebuildable/retained; keep the last-known-good website image.
6. **Documented website-only recovery command** (rebuild website image → start website app →
   start website proxy on 443 → verify 200) kept in the runbook.

## Follow-up — RESOLVED

- **RESOLVED: the website build/recovery assurance gate no longer requires an
  assurance-skip for unrelated checks.** The deploy-time gate is now **scope-aware** — a
  website-only deploy runs global-safety + website-specific checks only and no longer runs
  the unrelated manifest/asset-inventory/docs-claims/SDK-contract checks; the legitimate
  top-level `tests/` directory is now documented and accepted. Global safety (single
  source-of-truth guard, wrong-checkout / `banzami-canonical` rejection, no local QEMU
  fallback) is unchanged. `BANZAMI_SKIP_ASSURANCE=1` remains **break-glass only**. See
  [WEBSITE_ASSURANCE_GATE_FIX.md](WEBSITE_ASSURANCE_GATE_FIX.md) and
  `tests/ops/website-assurance-gate.test.sh`.

See [../../docs/infra/BANZAMI_WEBSITE_RECOVERY_RUNBOOK.md](../../docs/infra/BANZAMI_WEBSITE_RECOVERY_RUNBOOK.md)
and [../../docs/infra/BANZAMI_PUBLIC_WEBSITE_ARCHITECTURE.md](../../docs/infra/BANZAMI_PUBLIC_WEBSITE_ARCHITECTURE.md).

## Non-usage confirmation

No payment/admin/gateway/Developer Platform service change, database change, migration, VM
reset, destructive Docker prune, DNS change, certificate change, SMTP change, or
external-provider command was used. The recovery was limited to rebuilding the website image
and starting the website application and a dedicated website-only proxy on public 443.
