# Host Secret-Hygiene Cleanup

Version: 1.0
Date: 2026-07-10
Source commit at execution: `38ff6a668e81c206e8ffeb3c55b0d11d5a4db44d`

> **Scope note.** Sanitised: no IPs, private hostnames, SSH users, server paths,
> secrets, tokens, DB URLs, raw env, raw logs, raw Docker output, private endpoints,
> provider details or PII. Sanitised labels only. No env content was printed, copied
> or committed. Internal operations record.

## Approved scope

Identify and quarantine stale, unreferenced, secret-bearing env/compose backup files
on the production host; preserve the active env/config untouched; verify runtime
unchanged; record evidence. Explicitly **not** performed: secret rotation, active env
changes, compose runtime changes, deploys, rebuilds, service starts/restarts, Docker
compose apply operations, DNS/cert/SMTP changes, proxy routing changes, migrations,
database writes, application service restore, Stage C implementation.

## Inventory summary (read-only, sanitised labels)

**Active configuration set (5 files, preserved untouched):**

| Label | Role | Confirmed active by |
|---|---|---|
| active-env | Interpolation source for the shared compose project | Compose project renders from it; content hash identical before/after cleanup |
| active-compose | Shared compose project definition | Runtime container labels reference it |
| active-healthcheck-override | Postgres/Redis healthcheck override (applied in PR #43 operation) | Runtime container labels reference it |
| active-website-restore-override | Website-only proxy 443 binding | Runtime container labels reference it |
| active-sandbox-gateway-overlay | Gateway overlay (non-backup config file) | Kept untouched (not a backup) |

The running Sandbox / Developer Platform project uses its own configuration in a
separate managed location — unaffected by and unrelated to this cleanup.

**Stale backups found (31 files, none referenced anywhere):**

- stale-env-backups: **8** timestamped env backup files (dated late May – late June).
- stale-compose-backups: **23** timestamped/suffixed compose backup files
  (dated late May – early July), including feature-era and rename-era copies.

**Reference check:** no running container, compose project label, systemd unit,
backup job or host script references any of the 31 backup files. The safety gates
("stale backup may be active" / "active source unknown") did **not** trigger — the
active set was identified confidently from runtime labels and render checks.

## Cleanup action

All 31 stale backups were **quarantined** (moved, not yet destroyed) into a single
timestamped, root-only (mode 700) quarantine directory inside the host's designated
backup area, with individual files set to mode 600. The compose project root now
contains **zero** backup-like files — only the 5 active configuration files remain.

Quarantine (rather than deletion) was chosen deliberately: the live-era keys these
backups contain have not been rotated yet, so the quarantine preserves a recovery
option while removing the sprawl and restricting access. Final destruction is
scheduled together with the key rotation follow-up below.

## Services touched

None. This operation moved inert files only — no container, service, network, volume
or configuration in use was created, modified, started, stopped or restarted.

## Services NOT touched

Website app + website-edge (continuous uptime), production Postgres/Redis (healthy,
uptime continuous through the cleanup), Sandbox / Developer Platform stack (6/6
healthy), shared proxy, all payment/admin/gateway/API/pay/checkout/developers
services, DNS, certificates, SMTP, external providers.

## Verification — PASS

- `banzami.com` → 200; `www` → 301; offline subdomains → controlled 503 (Stage B guard).
- Production Postgres + Redis healthy (new authenticated healthchecks working).
- Sandbox / Developer Platform: 6/6 healthy, continuous uptime.
- No application services started.
- Stale backup count at the compose root: **0**.
- Active env and active compose content hashes identical before/after; all 5 active
  files present; the compose configuration still renders cleanly (read-only check).

## Retained items (justified)

- **Quarantine directory** (root-only) holding the 31 moved backups — retained until
  live-era key rotation completes, then to be destroyed.
- **Stage A pre-start data snapshot** and **automated database dumps** in the backup
  area — operational backups, deliberately retained (not env/compose sprawl).
- Two legacy database dump files and an overlay archive in the backup area — data
  backups outside this task's env/compose scope; flagged for review in the rotation
  follow-up.

## Follow-ups

1. **Rotate live-era orphan keys** (live JWT signing, webhook encryption, KYB storage
   credentials) **before any Stage E/F/live restore** — the quarantined backups carry
   older values of some of these; rotation makes both quarantine and backups inert.
2. Destroy the quarantine directory after rotation is confirmed.
3. Review the legacy data dumps in the backup area during the same rotation window.

## Final status

**HOST SECRET HYGIENE CLEANUP COMPLETE — ACTIVE RUNTIME UNCHANGED.**
