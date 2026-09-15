# Hosting App Banzami Web at app.banzami.com

Version: 1.0 · WEB-APP-001 (ADR-064).

> **LIVE and blueprint-managed since 2026-09-15.** `https://app.banzami.com`
> serves the real Flutter Consumer app with the opaque server-side session,
> verified end-to-end over the public path (register → 10 000 Kz grant → opaque
> cookie, no JWT in JS → logout revocation; TLS floor 1.2, Full (strict);
> CSP/HSTS/noindex).
>
> **Canonical deployment.** `app-frontend` is a first-class Sandbox service:
> `./deploy.sh app-frontend` bundles the commit, builds it natively on the amd64
> server (repo-root context → the Flutter Web target + the Node host), and
> `sandbox-deploy.sh deploy-one` creates/redeploys it. It runs on the application
> plane only, mounts ONE non-financial secret (the at-rest session-store key,
> `keep_or_mint_key32` — minted once, never rotated, so a normal deploy never
> invalidates live sessions), and owns a dedicated app-plane session Redis
> (`<project>-app-session-redis`; losing it only logs Web sessions out). Redeploy
> is proven session-surviving; the other sandbox hosts are untouched.
>
> **Cloudflare (infra truth — do not rely on chat history):**
> - DNS `A app.banzami.com → 217.160.9.248`, **Proxied**, TTL auto (record
>   `3b22a13eba8a686a932eb8d70593c2cc`).
> - Origin Rule ruleset `215b731da0d54cbabb56f2be052ede09`, rule
>   `0b6455ac2dbb40f1ba3071835d389c4f` ("Sandbox hosts → :2053") now includes
>   `app.banzami.com`; the website/developers rules (:8443) are untouched.
> - SSL/TLS **Full (strict)**; the wildcard Cloudflare Origin CA (`*.banzami.com`)
>   already covers app. Verified: TLS 1.0 refused, 1.2/1.3 OK.
>
> **Known follow-up — the edge block is still additive, not generated.** The
> `app.banzami.com` server block is currently a hand-added
> `conf.d/zz-app-banzami.conf` on `bzsbedge-sandbox-edge` (pointing at the
> canonical container), because the **deployed edge config has drifted ahead of
> the repo** (it serves `admin.banzami.com` via `SB_ADMIN_API`/`SB_ADMIN_APP`
> that the committed `docker-compose.sandbox-edge.yml` does not yet declare).
> Re-rendering the edge from the repo would drop admin, so the additive block is
> the safe interim. Moving app into the generated render (`SB_APP` is now declared
> in the compose; the template already has the block) must be done together with
> reconciling that pre-existing admin drift, during a deliberate edge redeploy.

## Verified infrastructure (inspected 2026-09-15, not assumed)

- **Origin:** the VPS `217.160.9.248`. Two edges run there, split by host port:
  `:443` → `banzami-website-nginx-1` (serves `banzami.com`, `www`, `developers`);
  `:2053` → `bzsbedge-sandbox-edge` (serves the **sandbox** hosts: `pay`,
  `sandbox-api`, `admin`, `checkout`, `developer-api`, `sandbox-webhook`).
- **Cloudflare reaches the sandbox hosts on origin port `2053`, per hostname.**
  Proven on the origin: `pay.banzami.com` returns 200 on `:2053` and 503 on
  `:443`; `developers.banzami.com` is served on `:443`. There is no blanket
  `*.banzami.com → 2053` rule (developers would break). **`app.banzami.com` must
  be added to the same origin-port-2053 routing as `pay`** — a DNS record alone
  sends it to `:443` (the website edge), which 503s for app.
- **TLS/cert:** the sandbox edge presents a Cloudflare **Origin CA** certificate,
  SAN `*.banzami.com, banzami.com`, valid to 2041 — it already covers
  `app.banzami.com`. Full (strict) is satisfied; no new certificate is needed.
- **Edge block:** the `server { server_name app.banzami.com; … proxy_pass
  http://$sb_app; }` block is staged in `infra/nginx/sandbox-edge.conf.template`
  (wildcard cert, variable upstream — absent `SB_APP` only 502s app).

## The exact Cloudflare records the owner creates

1. **DNS** — `TYPE: A · NAME: app · TARGET: 217.160.9.248 · PROXY: Proxied ·
   TTL: Auto`, with SSL/TLS **Full (strict)**.
2. **Origin port** — route `app.banzami.com` to origin port **2053** (the sandbox
   edge), the same mechanism (Cloudflare Origin Rule) that already routes `pay`
   and `sandbox-api`. This is a separate, required action from the DNS record.

## Provisioning `app-frontend` (executed at cutover)

Registering the service is a validator-gated blueprint change (mirroring
`pay-frontend`), done as one supervised operation with the deploy:

- `remote-native-build.sh` build map: `app-frontend) echo "$REL|$REL/apps/app-banzami/Dockerfile|3007"` — **build context is the repo root** (the image builds the Web target from `sdk/flutter` + `apps/mobile`), unlike pay/admin whose context is their app dir;
- add `app-frontend` to `SANDBOX_SERVICES` (source-deploy) and to the sandbox service allow-lists the blueprint validators enforce (`check-sandbox-operational.mjs`, `check-sandbox-release-package.mjs`);
- define the `app-frontend` container on the app plane with env `CONSUMER_API_BASE=https://sandbox-api.banzami.com/consumer` (or the internal public-api address), `NODE_ENV=production`, `SESSION_REDIS_ADDR` (a Redis the app plane can reach — the stack `redis` is data-plane, so give app-frontend reachability or provision an app-plane session Redis), `APP_WEB_SESSION_STORE_KEY` (dedicated secret), optionally `SESSION_REDIS_PASSWORD`;
- set the edge `SB_APP` env to `app-frontend:3007` and reload the edge.

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
     a single-node file store (fine for one replica, not for scale). Set
     `SESSION_REDIS_PASSWORD` if that Redis requires AUTH/ACL; the Redis must have
     no host-published port (network-isolated, as the stack `redis` already is);
   - inject **`APP_WEB_SESSION_STORE_KEY`** — a dedicated AES-256-GCM secret that
     encrypts the session record (and the Bearer it holds) at rest. Required in
     production; distinct from every other secret; never in the browser, never
     baked. The browser holds only an opaque id, so there is no cookie-sealing
     secret;
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
