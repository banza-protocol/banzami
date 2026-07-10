# Banzami — Website Recovery Runbook (banzami.com, website-only)

Version: 1.0

> **Scope note.** Sanitised: no IPs, hostnames, SSH users, server paths, secrets, tokens,
> DB URLs, raw logs or private endpoints. Public domain names only. Commands are shown as
> sanitised placeholders — substitute concrete values operationally, never in Git.

## When to use

The public institutional website `banzami.com` is unavailable — typically **Cloudflare
Error 522** (edge reachable, origin not answering on public 443). This runbook restores
**only** the website, independently of payment/admin/gateway/Developer Platform services.
See [BANZAMI_PUBLIC_WEBSITE_ARCHITECTURE.md](BANZAMI_PUBLIC_WEBSITE_ARCHITECTURE.md) for the
independence rule.

## Boundaries

- Do **not** touch payment/admin/gateway/API/pay/checkout/Developer Platform services.
- Do **not** run migrations, database commands, VM reset, destructive Docker prune, or
  DNS/certificate/SMTP changes.
- Do **not** restore the full production stack.
- The website-only proxy's **sole upstream is the website application**.

## Website-only recovery procedure

1. **Verify symptom** — `banzami.com` returns Cloudflare 522 (origin not answering on
   public 443).
2. **Verify origin/proxy status** — confirm nothing is listening on public 443 and the
   public reverse proxy is not running (read-only).
3. **Verify website image/container presence** — check whether the website application
   image and container exist (read-only).
4. **Rebuild only the website image if absent** — build the website image from the single
   authorised repository; do **not** rebuild any other service.
   ```
   # from the authorised local repository only:
   ./deploy.sh website-frontend
   # if an UNRELATED pre-existing assurance/layout gate blocks an emergency restore,
   # the documented emergency skip may be used and MUST be recorded in the incident note:
   BANZAMI_SKIP_ASSURANCE=1 ./deploy.sh website-frontend
   ```
5. **Start only the website application** — the website container has no payment
   dependencies; starting it does not start payment/admin/gateway services.
6. **Start the website-only proxy on public 443** — a proxy whose sole upstream is the
   website application, bound to public 443 (a small, reversible override; started with no
   dependencies so nothing else is touched).
   ```
   # sanitised shape of the reversible override (no real paths/values):
   # services:
   #   <website-proxy>:
   #     ports:
   #       - "443:443"
   # start ONLY the website proxy, no dependencies:
   #   docker compose -f <base> -f <website-restore-override> up -d --no-deps <website-proxy>
   ```
7. **Verify** — `banzami.com` and `www.banzami.com` return **HTTP 200** (or the expected
   redirect); the origin answers on public 443; **no Cloudflare 522**.
8. **Verify scope** — payment/admin/gateway/Developer Platform services remain untouched;
   the Sandbox / Developer Platform stack stays healthy and unchanged (not restarted).
9. **Record evidence** — write/update the sanitised incident note
   ([../../evidence/website/WEBSITE_522_INCIDENT_RECOVERY.md](../../evidence/website/WEBSITE_522_INCIDENT_RECOVERY.md)).

## Follow-up

- **FOLLOW-UP:** fix the website build/recovery assurance gate so an emergency website
  restore does not require an assurance-skip for **unrelated** repository-layout checks (the
  gate failed on an undocumented top-level `tests/` expectation). Until fixed, the emergency
  skip is the documented path and every use must be recorded in the incident note. This is a
  tracked follow-up, not a silent normalisation.

## Prevention checklist

- ☐ Website-only healthcheck on the website application.
- ☐ External uptime monitor for `banzami.com`.
- ☐ Cloudflare **522** alert wired to the operator.
- ☐ Restart policy (`unless-stopped`) on the website application and the website-only proxy.
- ☐ Retained / rebuildable website image policy (keep last-known-good).
- ☐ No broad image prune without a website recovery plan and a rebuildable website image.
- ☐ Website-only proxy remains independent (sole upstream = website; no payment coupling).
- ☐ Periodic website-only restore drill.
- ☐ Incident note required after any outage.
