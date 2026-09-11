# Log retention — Banzami Sandbox host

Version: 1.0

## What is logged where

| Source | Where | Contains |
|---|---|---|
| Go services (gateway, public-api, admin-api, developer-api, core) | container stdout → Docker `json-file` | structured request lines; paths pass through `obs.RedactPath` |
| nginx edges (`banzami-website-nginx-1`, `bzsbedge-sandbox-edge`) | container stdout/stderr → Docker `json-file` | access lines in the `bz_redacted` format |
| Financial and operator audit trails | PostgreSQL (append-only tables) | **the audit record** — not container logs |

Container logs are operational diagnostics. They are **not** audit evidence:
every audited action (operator decisions, proof corrections, verifications,
money movement) is recorded in the database, which has its own backup and
retention (BACKUP_DR_RUNBOOK.md).

## Policy

- **Live logs are never truncated from outside.** Docker's `json-file` logger
  counts its own write position; a live log truncated by logrotate
  (`copytruncate`) leaves `docker logs --tail` hanging until the container
  restarts (RA-085). Live logs are bounded by Docker itself when a container is
  created with `log-opts` `max-size`/`max-file`; the Sandbox stack services are
  recreated on every deploy, so each deploy starts their logs afresh.
  **Open:** the long-lived containers (both nginx edges, `website-frontend`,
  `webhook-sink`, the stack PostgreSQL and Redis) were created without
  `log-opts`, so their live logs have no size cap until they are recreated
  with one (the website edge grew about 0.8 MB/day). Adding
  `logging: {driver: json-file, options: {max-size: 50m, max-file: "3"}}` to
  their compose definitions takes effect at their next planned recreate.
- **Rotated copies expire after 14 days** (the host's local backup retention):
  `/etc/cron.daily/banzami-container-log-retention`
  (`infra/sandbox/log-retention/banzami-container-log-retention`) deletes
  `<id>-json.log-*` files older than 14 days and nothing else. Guard:
  `tests/ops/container-log-retention.test.mjs`. Files are `root`-only, as
  Docker writes them.
- Bearer values are never written whole: proof references (any route, any
  spelling, any host) keep their first group; API keys are replaced; no
  Referer is logged. Every nginx server block logs with `bz_redacted` or not
  at all — a server without its own `access_log` would inherit nginx's `main`
  format (request whole, Referer included). Go:
  `services/common/obs/redact.go`; nginx: `map $request $bz_request_redacted`
  (keys on the token, not the route). Guards:
  `services/common/obs/redact_test.go`, `tests/ops/nginx-proof-log-redaction.test.mjs`.
- `/r/` pages send `Referrer-Policy: no-referrer`, so a proof URL is not
  carried to any request the page makes (`apps/website/lib/proof-referrer.test.ts`).

## History

Until 2026-09-11 there was no container-log limit or rotation on this host, and
the nginx masks keyed on the route, so a mistyped or altered proof path could be
written whole (docs/quality/REPAIR_LOG.md RA-082); six other nginx servers
logged the request and the Referer unredacted. On 2026-09-11, after every
server logged through `bz_redacted`, one rotation was forced: the active logs of
the two nginx edges went from 223 and 96 lines naming a reference to **0**; the
pre-fix content sits in two root-only rotated files that the retention job
deletes on 2026-09-25. Nothing was edited line by line.

That rotation used `copytruncate` and broke `docker logs --tail` for every
container on the host (RA-085). The logrotate stanza was removed the same hour
and the edges (`bzsbedge-sandbox-edge`, `banzami-website-nginx-1`) and
`banzami-webhook-sink` restarted; the stack services recover on their next
deploy. `bzsandbox-…-postgres-1` and `banzami-redis-1` were deliberately not
restarted: until their next restart use `docker logs --since …`, not `--tail`.

## Check

```bash
# active logs: full proof references written since the last rotation (want 0)
P='BZM(-[0-9A-Za-z]{4}){2}'   # any reference longer than its first group
for c in $(docker ps --format '{{.Names}}'); do
  n=$(grep -ciE "$P" "$(docker inspect -f '{{.LogPath}}' "$c")"); [ "$n" = 0 ] || echo "$c $n"
done
```
