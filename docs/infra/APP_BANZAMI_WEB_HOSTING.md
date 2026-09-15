# Hosting App Banzami Web at app.banzami.com

Version: 1.0 · WEB-APP-001 (ADR-064).

App Banzami Web (`apps/app-banzami`) is built, tested and Dockerised. Bringing it
live at `app.banzami.com` is the one step that needs owner infrastructure access.
This runbook is the exact checklist; nothing here is destructive.

## What is already in place

- The application, its BFF, the Dockerfile (standalone Next, port 3007), and CI
  (`App Banzami Web — typecheck, test, build`).
- The edge server block for `app.banzami.com` is staged in
  `infra/nginx/sandbox-edge.conf.template` (variable upstream `${SB_APP}`,
  wildcard cert). An absent upstream only 502s this host; the edge still starts.
- TLS: `app.banzami.com` is covered by the existing `*.banzami.com` wildcard cert
  and the Cloudflare zone's TLS 1.2 floor — no new certificate is needed.

## Owner steps to go live

1. **Cloudflare DNS (owner-only).** Create a **proxied** record for
   `app.banzami.com` pointing at the same origin as `pay.banzami.com`
   (the host holds only a DNS-01 ACME token that cannot create records, so this
   must be done in the Cloudflare dashboard/API). Keep SSL/TLS = Full (strict);
   the zone TLS floor (1.2) already applies.

2. **Provision the `app-frontend` service** in the Sandbox deploy blueprint,
   mirroring `pay-frontend`:
   - add `app-frontend` to `SANDBOX_SERVICES` in
     `infra/blueprint/sandbox-ops/scripts/sandbox-source-deploy.sh` and the
     server-side build map (service → `apps/app-banzami/Dockerfile`);
   - define the container in the Sandbox compose on the app plane (same network
     as `pay-frontend`), exposing port 3007;
   - inject env: `CONSUMER_API_BASE=https://sandbox-api.banzami.com/consumer`,
     `NODE_ENV=production`, and a **`SESSION_SECRET`** (≥32 bytes, generated once
     and stored as a deploy secret — the app refuses to seal sessions without it
     in production);
   - set the edge upstream env `SB_APP` to the app container's `name:3007`.

3. **Deploy**: `./deploy.sh app-frontend` (routes to the Sandbox source-deploy),
   then reload the edge: `docker exec bzsbedge-sandbox-edge nginx -s reload`.

4. **Verify**: `curl -sI https://app.banzami.com/` → 200; open it, register a
   consumer, see the 10 000 Kz grant, send to another consumer. Then run the
   deployed-host acceptance (below).

## After the host is live (unblocked work)

- Homepage integration (§12–15): the hero phone becomes a portal into the real
  Web app (`app.banzami.com`), keeping the mobile-beta buttons.
- Developer Console integration (§70–80): "Testar na App Banzami Web" from
  Payment Sessions / Links / QR (public target only, no Project secret).
- Deployed browser E2E on WebKit + Chromium (§117–131), the Consumer, homepage,
  developer, multiuser, cross-client and QR cleanrooms (§159–164), and the
  cross-device (real iOS/Android) proofs (§115–116).

## Security floor for the deployed host

The app already sets HSTS, a per-request nonce CSP with `frame-ancestors`
limited to the marketing origins, `no-store` on private state, and noindex. Confirm
the edge does not add a conflicting `X-Frame-Options: DENY` (the homepage embed
needs the CSP `frame-ancestors` allowlist to win).
