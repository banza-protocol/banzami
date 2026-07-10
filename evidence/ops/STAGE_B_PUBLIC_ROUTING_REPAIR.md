# Stage B — Public Routing Repair (honest offline subdomain responses)

Version: 1.0
Date: 2026-07-10
Source commit at execution: `7873f38785499e200e157faf98859a8a40720cad`

> **Scope note.** Sanitised: no IPs, hostnames, SSH users, server paths, secrets, tokens,
> DB URLs, raw logs, raw Docker output, private endpoints, provider details or PII.
> Public domain names only. Internal operations record.

## Approved scope

Operator-approved **Stage B only**: repair public routing behaviour so offline
subdomains return an intentional maintenance/error response instead of the
institutional website HTML, while banzami.com/www keep serving the website and the
website-only proxy remains independent. Explicitly **not** approved and **not**
performed: restoring API/admin/gateway/pay/checkout/developers services, Developer
Platform changes, application image rebuilds, migrations, database writes,
external-provider activation, DNS/certificate/SMTP changes, full production restore.

## Pre-change symptom (verified read-only)

- `banzami.com` → HTTP 200 website (correct); `www.banzami.com` → 301 redirect (correct).
- **All seven offline/sandbox subdomains** (api, admin, pay, developer-api, sandbox-api,
  sandbox-operator, and any unknown host) → **HTTP 200 with the website HTML**, because
  the website-only proxy was the sole public 443 listener and nginx fell through to the
  first server block for unmatched hosts (implicit default).
- `developers.banzami.com` was already served by its own **intentional** SNI vhost
  (from the merged developer-public-hygiene work) proxying to the website app's
  host-guarded, non-operational developer pages — not part of the accidental catch-all.
- Sandbox / Developer Platform stack healthy; Postgres + Redis healthy post-Stage A;
  no production application containers running.

## Routing fix chosen

**Preferred (smallest safe) option:** keep the website-only proxy as the public 443
listener and make it host-aware by adding **one additional config file** containing a
`default_server` guard block:

- static `503 Service Unavailable` + `Retry-After` + controlled Portuguese maintenance
  page for every host not explicitly served;
- **zero upstream dependencies** (static response only — cannot fail on missing services);
- the website's own server block untouched;
- TLS via the existing wildcard origin certificate already present on the proxy;
- no shared-proxy reintroduction, no old coupling.

One consistent behaviour was chosen and applied: **503 + maintenance page** for all
offline and unknown hosts (chosen over 421/404 because it is the honest signal for
temporarily offline services and machine-readable for API clients and monitors).

## Change applied

1. Pre-change rollback copy of the proxy config directory taken (kept on host, not in Git).
2. Guard config file added to the website proxy's config directory
   (source of truth committed as `infra/nginx/website-default-guard.conf`).
3. Config validated (`nginx -t` passed) and the proxy **reloaded in place** — the proxy
   container was not restarted or recreated (continuous uptime).

## Services touched

- Website-only proxy — one config file added + in-place reload (no container restart,
  no image rebuild).

## Services NOT touched

- Website application container — untouched (continuous uptime, still serving 200).
- Sandbox / Developer Platform stack (6 containers) — untouched, healthy, continuous uptime.
- Production Postgres + Redis — untouched since Stage A, healthy; no reads or writes.
- Shared public reverse proxy — not started, not modified.
- All payment/admin/gateway/API/pay/checkout/developers application services — untouched.
- DNS, certificates (existing files reused, none changed/added), SMTP, external providers — untouched.

## Verification result — PASS

| Host | Before | After |
|---|---|---|
| banzami.com | 200 website | **200 website** (unchanged) |
| www.banzami.com | 301 → banzami.com | **301** (unchanged) |
| api.banzami.com | 200 website HTML ❌ | **503 maintenance** ✅ (also on deep paths, e.g. `/health`) |
| admin.banzami.com | 200 website HTML ❌ | **503 maintenance** ✅ |
| pay.banzami.com | 200 website HTML ❌ | **503 maintenance** ✅ |
| developer-api.banzami.com | 200 website HTML ❌ | **503 maintenance** ✅ |
| sandbox-api.banzami.com | 200 website HTML ❌ | **503 maintenance** ✅ |
| sandbox-operator.banzami.com | 200 website HTML ❌ | **503 maintenance** ✅ |
| developers.banzami.com | 200 intentional dev surface | **200 intentional dev surface** (unchanged — see below) |
| unknown hosts | 200 website HTML ❌ | **503 maintenance** ✅ (default_server) |

`developers.banzami.com` note: this host is deliberately served by its own vhost to the
website app's host-guarded developer pages — a **demo/documentation, non-operational**
surface whose operational-console ambiguity was removed in the merged
developer-public-hygiene changes. It makes no operational Developer Console, API or
payments availability claim. It was intentionally left unchanged in Stage B (website
surfaces are out of scope); exposing an operational Developer Console remains
**not approved** and gated on later stages.

## Public exposure result — PASS

- Host-public listeners unchanged: SSH, public 443 (website-only proxy), website origin port.
- No database or application port exposed; Postgres/Redis remain container-network only.
- No new container, image, network or volume created.

## Website independence confirmation

The website-only proxy still has the website application as its **sole upstream**; the
guard block is static and depends on nothing. banzami.com served HTTP 200 before, during
and after the change (in-place reload, zero downtime).

## Sandbox / Developer Platform confirmation

All six containers untouched, healthy, continuous uptime throughout Stage B.

## Postgres / Redis confirmation

Untouched since Stage A; both healthy; no database commands, reads or writes performed
in Stage B.

## Rollback plan (recorded)

1. Delete the single guard config file from the proxy config directory.
2. Reload nginx in place (no restart).
3. Result: exact pre-Stage-B behaviour returns; banzami.com website availability and
   independence are unaffected in both directions. A timestamped pre-change copy of the
   full config directory is retained on the host as a belt-and-braces restore point.
4. No application service, payment/API/admin/gateway activation, or data change is
   involved in either direction.

## Remaining blockers for Stage C+

1. All production application images remain absent (rebuilds required per stage).
2. Shared proxy remains down and unrepaired (resolver-less upstream coupling; network
   split vs the running sandbox project) — Stage C public routing of sandbox surfaces
   needs the repaired-route design (host-aware proxying to the sandbox project network),
   not the old shared proxy as-is.
3. Secret reconciliation pending before any service restore (Stages C–F).
4. Compose ↔ deploy tooling ↔ sandbox-project drift (three definitions of staging
   upstreams) to reconcile before Stage E.
5. Developer Console UI remains non-operational — `developers.banzami.com` must keep its
   demo/non-operational character until a real console is implemented, tested and approved.
6. Postgres compose healthcheck references a non-existent database name (cosmetic,
   carried from Stage A).
7. Payment-rail / external-provider activation decision outstanding (Stage G).

Final status: **STAGE B COMPLETE — PUBLIC ROUTING REPAIRED, OFFLINE SUBDOMAINS NO LONGER RETURN WEBSITE HTML.**
