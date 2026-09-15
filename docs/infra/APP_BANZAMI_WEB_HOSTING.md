# Hosting App Banzami Web at app.banzami.com

Version: 1.0 · WEB-APP-001 (ADR-064).

App Banzami Web is the shared Flutter Consumer app compiled to the Web target,
served by a lean Node host (`apps/app-banzami`) that is also the same-origin
session BFF. Bringing it live at `app.banzami.com` is the one step that needs
owner infrastructure access. This runbook is the exact checklist; nothing here
is destructive.

## What is already in place

- The Flutter Web target (`flutter build web -t lib/main_consumer_web.dart
  --no-web-resources-cdn`), proven booting and transacting against the live
  Sandbox through the BFF (register → 10 000 Kz grant → Home → P2P → logout).
- The host: `server.mjs` + `lib/bff.mjs` + `lib/session_store.mjs` (pure Node
  built-ins — no npm install), serving the bundle same-origin and mediating
  `/consumer/*` with an **opaque server-side session** (Redis or file store,
  Bearer never in the cookie), allow-list, CSRF, rotation, idle/absolute timeout
  and server-side revocation at logout. Unit tests in `test/` (`node --test`, 11).
- One reproducible build definition, `apps/app-banzami/build-web.sh`, shared by
  CI and the Docker image; it fails closed on an unknown environment.
- The Dockerfile builds the Web target from the shared Flutter sources and runs
  the Node host. **Its build context is the repository root** (it needs
  `sdk/flutter` and `apps/mobile`):
  `docker build -f apps/app-banzami/Dockerfile -t app-banzami-web .`
- The edge server block for `app.banzami.com` is staged in
  `infra/nginx/sandbox-edge.conf.template` (variable upstream `${SB_APP}`,
  wildcard cert). An absent upstream only 502s this host; the edge still starts.
- TLS: `app.banzami.com` is covered by the existing `*.banzami.com` wildcard cert
  and the Cloudflare zone's TLS 1.2 floor — no new certificate is needed.
- `/healthz` returns readiness only (no session, consumer, secret or upstream
  detail) for the container HEALTHCHECK and the edge.

## Owner steps to go live

1. **Cloudflare DNS (owner-only).** Create a **proxied** record for
   `app.banzami.com` pointing at the same origin as `pay.banzami.com` (the host
   holds only a DNS-01 ACME token that cannot create records, so this must be
   done in the Cloudflare dashboard/API). Keep SSL/TLS = Full (strict); the zone
   TLS floor (1.2) already applies. Add `app.banzami.com` to the public security
   checks alongside the other hosts.

2. **Provision the `app-frontend` service** in the Sandbox deploy blueprint,
   mirroring `pay-frontend`:
   - add `app-frontend` to `SANDBOX_SERVICES` in
     `infra/blueprint/sandbox-ops/scripts/sandbox-source-deploy.sh` and the
     server-side build map (service → `apps/app-banzami/Dockerfile`, **build
     context = repo root**);
   - define the container in the Sandbox compose on the app plane (same network
     as `pay-frontend`), exposing port 3007;
   - inject env: `CONSUMER_API_BASE=https://sandbox-api.banzami.com/consumer`,
     `NODE_ENV=production`, and **`SESSION_REDIS_ADDR`** (`host:port`) pointing at
     a Redis the app plane can reach — the opaque Web session store (durable
     across a host restart, safe across replicas). The stack `redis` is on the
     data plane, so either give `app-frontend` reachability to it or provision a
     small session Redis on the app plane. Without the env the host falls back to
     a single-node file store (fine for one replica, not for scale). No
     cookie-sealing secret is needed — the browser holds only an opaque id;
   - set the edge upstream env `SB_APP` to the app container's `name:3007`.

3. **Deploy**: `./deploy.sh app-frontend` (routes to the Sandbox source-deploy),
   then reload the edge: `docker exec bzsbedge-sandbox-edge nginx -s reload`.

4. **Verify**: `curl -s https://app.banzami.com/healthz` → `{"status":"ok","session_store":true}` (503 if the store is unreachable — the host will not claim ready when it cannot authenticate); open the app,
   register a consumer, see the 10 000 Kz grant, send to another consumer. Then
   run the deployed-host acceptance (below).

## After the host is live (unblocked work)

- Homepage integration (§42–§46): the hero becomes a portal into the real Web app
  (`app.banzami.com`), keeping the mobile-beta buttons; a top-level transition is
  preferred over an iframe where third-party-cookie rules would break the session
  (§43).
- Developer Console integration (§48–§53): "Testar na App Banzami Web" from
  Payment Sessions / Links / QR (public target only, no Project secret).
- Deployed browser E2E on WebKit + Chromium (§60/§61), the Consumer, homepage,
  developer, multiuser, cross-client and QR cleanrooms (§72–§77), and the
  cross-device (real iOS/Android) proofs (§27/§28).

## Security floor for the deployed host

The host sets a financial-app CSP (self-hosted CanvasKit, `frame-ancestors`
limited to the marketing origins), HSTS, `no-store` on private state, and
`noindex`. Confirm the edge does not add a conflicting `X-Frame-Options: DENY`
(the homepage portal relies on the CSP `frame-ancestors` allow-list). The
Consumer Bearer is never exposed to the browser; the session is an HttpOnly
cookie mediated entirely by the host.
