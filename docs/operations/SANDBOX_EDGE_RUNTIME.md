# Sandbox Edge — Stage C runtime

Status: **implemented and serving at the origin**; public routing pending one
external step (§5). Sandbox only — this component never touches LIVE.

Authority: [BANZAMI_STAGE_C_SANDBOX_PUBLIC_ROUTING_DECISIONS.md](../infra/BANZAMI_STAGE_C_SANDBOX_PUBLIC_ROUTING_DECISIONS.md)
(Decision 2 dedicated proxy · Decision 3 website independence · Decision 6 no
pay/checkout, no live rails, no operational Developer Console).

---

## 1. What was actually wrong

The Sandbox application stack was **never down**. All four rt04e services have
been `Up (healthy)` continuously:

| Service | Port | Health |
|---|---|---|
| `…-api-gateway-staging` | 8080 | `{"status":"ok"}` |
| `…-public-api-staging` | 8083 | `ok` |
| `…-core-api-staging` | 8081 | `ok` |
| `…-developer-api` | 8086 | `{"db":"up","env":"sandbox",…}` |

What was missing was **routing**. The only process on host `:443` is the
website-only edge, which serves `banzami.com`, `www` and `developers.banzami.com`
and answers every other host with the deliberate Stage B guard
(`website-default-guard.conf`) — a controlled **503**. `sandbox-api.banzami.com`
and `developer-api.banzami.com` had no server block anywhere, so they hit that
guard. Healthy services, unrouted.

This is worth stating plainly because the earlier assurance record inferred from
the 503 that the containers were down. They were not.

## 2. Topology

```text
Cloudflare
  ├─ banzami.com / www / developers   → origin :443  → website-edge  → website app
  └─ sandbox-api / developer-api      → origin :2053 → sandbox-edge  → rt04e sandbox
                                                        └─ default host → 503 (fail closed)
```

`sandbox-edge` is a separate nginx container on its own host port. The website
edge is never reloaded, reconfigured or depended upon. Independence holds in
**both** directions: if sandbox-edge dies `banzami.com` is unaffected, and if the
website edge dies the sandbox routes are unaffected.

* Source of truth: `infra/nginx/sandbox-edge.conf.template`,
  `infra/docker/docker-compose.sandbox-edge.yml`
* Host: `/srv/banzami/sandbox-edge/`, compose project `bzsbedge`
* Networks: `bzsb-edge-ingress` (published port) + the existing rt04e app network
  (upstreams). **Not** on `banzami_net`, so it cannot reach production
  payment/admin/gateway services even by accident.
* TLS: the existing Cloudflare Origin certificate (SAN `*.banzami.com`,
  valid to 2041). The edge holds no key material of its own.
* No database, no Redis, no secrets, no writable volumes.

### Routes

| Host | Path | Upstream |
|---|---|---|
| `sandbox-api.banzami.com` | `/consumer/*` | public-api `:8083` (prefix stripped) |
| `sandbox-api.banzami.com` | everything else | api-gateway `:8080` |
| `developer-api.banzami.com` | `/*` | developer-api `:8086` |
| any other host | — | **503**, controlled JSON |

## 3. Two failure modes designed against

**Startup fragility.** `infra/nginx/banzami.conf` records a `banzami.com` 522
incident whose root cause was that nginx resolves literal `proxy_pass` hostnames
at *config load*, so one absent upstream stopped the whole proxy from starting.
Every upstream here is held in a variable and resolved at *request* time via
Docker's embedded DNS (`resolver 127.0.0.11`). A missing upstream now degrades to
a 502 for that host alone — never a startup failure, never a false 200, never
website HTML.

**Silent prefix bugs.** With a variable in `proxy_pass`, nginx does **not**
perform the trailing-slash URI replacement. `proxy_pass http://$var/;` forwarded
`/consumer/v1/...` unstripped and every consumer route 404'd. The prefix is
stripped with an explicit `rewrite ^/consumer/(.*)$ /$1 break;`. This was caught
by testing the deployed proxy, not by reading it.

## 4. Verified

From the host, against the running runtime:

```text
banzami.com origin                                 200   (unchanged throughout)
sandbox-api  /health                               200   {"status":"ok"}
sandbox-api  /readyz                               200   environment=sandbox, db ok, redis ok
sandbox-api  /consumer/v1/consumers/search?q=a     200   {"data":[]}
developer-api /health                              200   env=sandbox, db up
unauthorised Host                                  503   controlled JSON
postgres / redis / 8080 / 8081 / 8083 / 8086 on host    not exposed
```

## 5. The one external step — public routing

Two changes, which must be made **together**:

1. **Cloudflare Origin Rule** — for `sandbox-api.banzami.com` and
   `developer-api.banzami.com`, rewrite the origin destination **port to 2053**
   (a Cloudflare-supported HTTPS origin port). Without it Cloudflare keeps
   sending these hosts to `:443`, where the website guard correctly answers 503.
2. **Host firewall** — allow 2053 **from Cloudflare IP ranges only**:
   ```bash
   for c in $(curl -s https://www.cloudflare.com/ips-v4); do ufw allow from "$c" to any port 2053 proto tcp; done
   for c in $(curl -s https://www.cloudflare.com/ips-v6); do ufw allow from "$c" to any port 2053 proto tcp; done
   ```

`ufw` currently allows only 22/80/443 (hardening RA-005). **It was deliberately
not opened to the world** during Stage C: a world-reachable origin port lets
callers bypass Cloudflare's WAF and DDoS protection entirely, so the port must
be opened *only* alongside the Origin Rule and *only* to Cloudflare.

Verify afterwards:

```bash
make assure-sandbox-runtime          # public hostnames must go green
```

## 6. Operating it

Deployment variables live in `/srv/banzami/sandbox-edge/.env` — container
names, container-internal ports and the docker network name. **No secrets**;
they are there so the deploy is reproducible. The first deployment passed them
inline on the command line, and recreating the container later meant
reconstructing a command that existed only in a shell history.

```bash
# deploy / update (host) — reads .env from the same directory
cd /srv/banzami/sandbox-edge
docker compose -p bzsbedge -f docker-compose.sandbox-edge.yml up -d

# rollback — removes only this proxy; the website edge is untouched
docker compose -p bzsbedge -f docker-compose.sandbox-edge.yml down
```

**After a sandbox redeploy** the rt04e container names change (they embed the
deploy timestamp), so `SB_GATEWAY` / `SB_PUBLIC_API` / `SB_DEVELOPER_API` /
`BZSB_APP_NET` must be refreshed in `.env` and the edge restarted. This drift is
*detected*, not silent: `make assure-sandbox-runtime` proxies through the edge
and fails when the upstream names go stale.

### Container health vs runtime assurance

The container healthcheck answers only *"is nginx up and serving THIS config"*,
via a health endpoint bound to the container loopback (unreachable from the host,
the ingress network and the sandbox app network — verified from a peer
container). Whether the **sandbox** is serving is a different question, answered
by `make assure-sandbox-runtime`. Keeping them apart is deliberate: an alive
proxy must never be mistakable for a serving sandbox.

The first deployment got this wrong in an instructive direction. Its healthcheck
probed `https://127.0.0.1/` with busybox `wget`, the only HTTP client in
`nginx:alpine` — which has no TLS support, so the check exited 1 on every run.
The container reported `unhealthy` for its entire life while serving every
request correctly: a false negative, found only by re-checking the host rather
than trusting the earlier verification.

## 7. What this does not establish

A healthy runtime means the environment **can be tested**. It is not evidence
that any capability behaves correctly. Capability release still requires the
`e2e_sandbox` test IDs and evidence artifacts the assurance manifest demands, and
`Full External Sandbox Launch` stays **HOLD** until those exist.
