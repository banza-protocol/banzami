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

- Rotated daily, or sooner at 50 MB, by the host's `logrotate.service`
  (`infra/sandbox/logrotate/banzami-container-logs`, installed as
  `/etc/logrotate.d/banzami-container-logs`). `copytruncate`: containers are
  never restarted to rotate.
- Rotated files are kept **14 days** (the host's local backup retention), then
  deleted by logrotate. Files are `root`-only, as Docker writes them.
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
written whole (docs/quality/REPAIR_LOG.md RA-082). On 2026-09-11 the policy
above was installed and one rotation forced: the pre-fix content moved out of
the active logs into root-only rotated files, which expire under the same
14-day rule. Nothing was edited line by line.

## Check

```bash
# active logs: full proof references written since the last rotation (want 0)
P='BZM(-[0-9A-HJKMNP-TV-Z]{4}){6}'
for c in $(docker ps --format '{{.Names}}'); do
  n=$(grep -cE "$P" "$(docker inspect -f '{{.LogPath}}' "$c")"); [ "$n" = 0 ] || echo "$c $n"
done
```
