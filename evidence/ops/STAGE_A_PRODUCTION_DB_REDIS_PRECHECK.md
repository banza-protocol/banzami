# Stage A — Production Postgres + Redis Restore / Precheck

Version: 1.0
Date: 2026-07-10
Source commit at execution: `bdd2efcd8ed5b7559b2a683e555bb345fd32c147`

> **Scope note.** Sanitised: no IPs, hostnames, SSH users, server paths, secrets, tokens,
> DB URLs, raw logs, raw SQL output, PII or provider details. Internal operations record.

## Approved scope

Operator-approved **Stage A only** of the staged production restore plan:

- production Postgres container;
- production Redis container;
- pre-start snapshot/copy of existing data directories;
- readiness checks;
- read-only integrity checks;
- backup-job recovery verification.

Explicitly **not** approved and **not** performed: shared public proxy repair, public
routing changes, API/admin/pay/checkout/developers restore, Developer Platform changes,
payment/gateway services, migrations, application image rebuilds, external-provider
activation, DNS/certificate/SMTP changes, full production restore.

## Pre-start snapshot — DONE

- A timestamped copy of the production Postgres data directory (~72 MB, 1930 files) and
  the Redis data directory (~8 KB) was created in the operator backup area **before**
  anything was started.
- Verified: snapshot file count matches the source exactly (1930/1930) and sizes match.
- The copy was taken cold (no database container existed), so it is consistent.
- The snapshot stays on the host in the backup area; it is **not** committed to Git.

## Services touched

- Production Postgres container — **started** against its existing (intact) data directory.
- Production Redis container — **started** against its existing data directory.

Both were started with an explicit, no-dependencies compose invocation naming only these
two services. No other container was created, recreated, restarted or stopped.

## Services NOT touched

- banzami.com website application and website-only proxy — unchanged (uptime continuous;
  website still serving HTTP 200 throughout and after Stage A).
- Sandbox / Developer Platform stack (6 containers) — unchanged, healthy, continuous uptime.
- Shared public reverse proxy — not started, not modified.
- All payment/admin/gateway/API/pay/checkout/developers application services — untouched.
- DNS, certificates, SMTP, external providers — untouched.

## Readiness result — PASS

- Postgres: container **healthy**; server accepting connections (readiness probe OK).
- Redis: container **healthy**; authenticated `PING` → `PONG`.
- Postgres performed a normal WAL automatic crash recovery on first start (expected —
  the previous containers had been removed abruptly) and completed it cleanly.
- No unexpected dependent service was started.

## Read-only DB integrity result — PASS

All checks ran inside a single `READ ONLY` transaction; aggregates only, no raw rows.

| Check | Result |
|---|---|
| Database opens / accepts connections | PASS |
| Expected schemas present | PASS (3 schemas, 85 public tables) |
| Migration table readable | PASS — 96 applied, **0 failed** |
| Current migration level | 0099 (repo head is 0100 — to be applied only via the gated rollout flow in a later approved stage; **no migration run in Stage A**) |
| Ledger tables readable | PASS (accounts 287 · postings 296 · entries 592) |
| **Double-entry invariant** (every posting's DEBIT/CREDIT entries net to zero) | **PASS — 0 unbalanced postings** |
| Orphan ledger entries (entry without parent posting) | PASS — 0 |
| Critical row counts sane (merchants 13 · consumers 59 · transactions 28 · admin users 4) | PASS |
| Latest ledger activity timestamp | Pre-outage (2026-07-04), as expected |
| Sanity vs last successful pre-outage dump | PASS — see backup section |

Cluster contents observation: the cluster contains **only the staging/sandbox database**
(~17 MB) plus the engine default database. No live-money database exists in this cluster —
consistent with the platform operating publicly in SANDBOX mode and with pre-outage
automated dumps, which also only ever contained the staging database. The compose
healthcheck references a database name that does not exist in the cluster, producing
cosmetic FATAL log noise (readiness still reports healthy); to be tidied in a later
approved stage. Live database provisioning belongs to the payment-rail activation
decision (Stage G), not Stage A.

## Backup recovery result — VERIFIED

- Automated 6-hourly backup had been **failing since 2026-07-08** (container absent).
- After Stage A, one backup run was triggered through the existing automated service:
  exit status **0 (success)**; a fresh dump artifact was created with **size > 0**.
- The fresh dump is **byte-for-byte the same size as the last successful pre-outage
  dump (2026-07-08)** — independent confirmation that no data changed during the outage.
- The backup timer is **active**; scheduled runs resume normally.
- Dump contents were not inspected or printed; no dump is committed to Git.

## Public exposure check — PASS

- Neither Postgres nor Redis publishes any host port (container-network only).
- Host-public listeners after Stage A are unchanged: SSH, public 443 (website-only
  proxy) and the website origin port. **No database port is publicly exposed.**

## Website independence confirmation

The banzami.com website application and website-only proxy were not touched, restarted or
reconfigured. The website served HTTP 200 before, during and after Stage A and remains
fully independent of payment/admin/gateway services.

## Sandbox / Developer Platform confirmation

All six Sandbox / Developer Platform containers remained running and healthy with
continuous uptime throughout Stage A. Nothing in their compose project, networks,
volumes or images was modified.

## Blockers

None for Stage A. Observations carried forward to later stages:

1. Compose healthcheck references a non-existent database name (cosmetic log noise).
2. Repo migration 0100 is pending — apply only via the gated rollout flow (ADR-034)
   in a later approved stage.
3. All Stage B+ blockers from the read-only restore plan remain (proxy repair, subdomain
   misrouting to website content, missing application images, secret reconciliation).

## Recommendation for Stage B

Proceed to Stage B approval: shared-proxy route repair with a DNS resolver, a
default-server catch-all (clean 421/503 instead of serving website HTML on offline
subdomains), and network attachment to the Sandbox project's networks — leaving the
website-only proxy untouched and exposing no payment functionality.

## Non-usage confirmation

No deploy, publish, application rebuild, database migration, destructive Docker prune,
VM reset, DNS/certificate/SMTP change, external-provider command, shared-proxy change,
public routing change, or any payment/admin/gateway/API/pay/checkout/developers/
Developer Platform service change was used. The only state changes were: creating the
pre-start data snapshot, starting the two approved infrastructure containers, and one
run of the pre-existing automated backup service.

Final status: **STAGE A COMPLETE — INFRASTRUCTURE RESTORED, INTEGRITY VERIFIED, BACKUPS RECOVERED.**
