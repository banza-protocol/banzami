# Production Postgres/Redis Healthcheck Override — Server Application

Version: 1.0
Date: 2026-07-10
Source commit at execution: `ad586603a5c6d94fad35ee7e19289c8a2ed4933c`

> **Scope note.** Sanitised: no IPs, private hostnames, SSH users, server paths,
> secrets, tokens, DB URLs, raw logs, raw Docker output, private endpoints, provider
> details or PII. Internal operations record.

## Approved scope

Apply the merged, versioned healthcheck override
(`infra/docker/production-healthchecks.override.yml`, PR #42) on the production host;
recreate **only** production Postgres and production Redis (required for Docker
healthcheck definitions to take effect); verify healthchecks and backups; record
evidence. Explicitly **not** approved and **not** performed: application service
restore, API/admin/gateway/pay/checkout/developers restore, Developer Platform
changes, Stage C or sandbox-edge implementation, migrations, database writes,
DNS/cert/SMTP changes, proxy routing changes, Docker prune, VM reset,
external-provider commands.

## Pre-change state (verified read-only)

- `banzami.com` → 200; `www` → 301; offline subdomains → controlled 503 (Stage B guard).
- Sandbox / Developer Platform stack: 6/6 healthy.
- Production Postgres + Redis: healthy (with the old, drifted healthchecks).
- Automated backups running on schedule (fresh scheduled dump present).
- No application containers beyond the approved website/Sandbox/DB groups.
- No compose auto-override file existed on the host before this operation.

## Override applied

1. The versioned override was copied to the compose project as the standard compose
   auto-override file, so every future plain compose invocation from the project
   directory picks it up automatically (the fix is sticky — no extra flags needed).
2. The merged configuration was validated read-only before any change: the rendered
   healthchecks matched the repo source exactly.
3. Only Postgres and Redis were recreated (`--no-deps`, explicit service names). Data
   directories are bind mounts and were untouched; both containers returned healthy
   within seconds.

## Services touched

- Production Postgres container — recreated with the corrected healthcheck.
- Production Redis container — recreated with the corrected healthcheck (+ the env
  variable its authenticated probe reads at runtime).

## Services NOT touched

Website app + website-edge (continuous uptime), Sandbox / Developer Platform stack
(6/6 healthy, continuous uptime), shared proxy (still down/deprecated), all
payment/admin/gateway/API/pay/checkout/developers services (still offline, 503),
DNS, certificates, SMTP, external providers.

## Healthcheck verification — PASS

| Check | Result |
|---|---|
| Postgres probe targets the existing database (staging DB) — nonexistent name gone | PASS (verified in the running container's healthcheck definition) |
| Postgres probe proves the database opens (read-only `SELECT 1`) | PASS (healthcheck exit 0) |
| No more FATAL "database does not exist" log noise after recreate | PASS (0 occurrences) |
| Redis probe authenticates and requires a literal PONG | PASS (healthy) |
| Redis wrong-password probe fails (exit 1) | PASS — auth failure is no longer "healthy" |
| Redis unauthenticated probe fails (exit 1) | PASS — the old false-positive is gone |

## Backup verification — PASS

A backup run was triggered through the existing automated service after the recreate:
exit 0, fresh dump artifact created (size > 0). The 6-hourly timer remains active and
had already produced its scheduled dump earlier the same day.

## Public exposure — PASS

No host-listening database ports; host-public listeners unchanged (SSH, public 443
website proxy, website origin port).

## Website independence confirmation

`banzami.com` served HTTP 200 before, during and after the operation; `www` redirect
unchanged; offline subdomains still return the controlled 503 maintenance response.
The website containers were not restarted (continuous uptime).

## Sandbox / Developer Platform confirmation

All six containers untouched, healthy, continuous uptime throughout.

## Rollback plan

Remove the auto-override file from the compose project directory and recreate only
Postgres and Redis — the previous healthcheck definitions return. Data is unaffected
in both directions (bind-mounted directories; the Stage A pre-start snapshot and the
automated dumps also remain available on the host).

## Final status

**PRODUCTION DB/REDIS HEALTHCHECK OVERRIDE APPLIED — NO APPLICATION SERVICES RESTORED.**
