# Banzami Website — Deployment

The official Banzami website (`apps/website`) is deployed as a **Next.js standalone
container**, served by its **own dedicated nginx on origin port `8443`**, fully
**isolated from the BANZA stack and the payment runtime**.

## Architecture (Option 2 — custom Cloudflare origin port)

```
Visitor ──HTTPS:443──▶ Cloudflare (separate Banzami zone/account)
                          │  Origin Rule: origin port → 8443
                          ▼
        217.160.9.248:8443  (host)  ──▶  website-nginx (:443 in container, TLS)
                                              │ proxy_pass
                                              ▼
                                       website-frontend:3000  (Next.js standalone)
```

- **Domain:** `banzami.com` (+ `www` → 301 to apex)
- **Origin port:** `8443` (the BANZA/payment `banza-nginx` keeps `:443`, untouched)
- **Stack:** `banzami` project at `/srv/banzami` · network `banzami_net`
- **Containers:** `website-frontend` (Next, internal :3000) + `website-nginx`
  (`nginx:1.27-alpine`, host `8443`→`443`)
- **TLS at origin:** a Cloudflare **Origin Certificate** for `banzami.com` (+ `www`)
  at `/srv/banzami/website-nginx/certs/banzami-com.{pem,key}` (SSL/TLS mode
  *Full (strict)*). A self-signed cert + mode *Full* also works.

> **Separation is deliberate.** banzami.com (Banzami operator) never shares the
> BANZA reverse proxy, network, or Cloudflare zone. No change to `banza-nginx`,
> `:443`, or any payment service.

> **Status guardrail.** The site must always describe Banzami as **not certified**
> and **not launch-ready** ("PASS significa evidência, não certificação").

## Server files

| Path | Purpose |
|------|---------|
| `/srv/banzami/docker-compose.yml` | `website-frontend` + `website-nginx` services (additive) |
| `/srv/banzami/website-nginx/conf.d/website.conf` | website vhost (source: `infra/nginx/website.conf`) |
| `/srv/banzami/website-nginx/conf.d/zz-developers.conf` | developers.banzami.com vhost (source: `infra/nginx/website-developers.conf`) |
| `/srv/banzami/website-nginx/conf.d/zz-zz-default-maintenance.conf` | default server, 503 (source: `infra/nginx/website-default-guard.conf`) |
| `/srv/banzami/website-nginx/certs/banzami-com.{pem,key}` | origin cert |
| `/srv/banzami/src/apps/website/` | rsynced source for the image build |

## Deploy / update

```bash
# 1. Build image on the server
rsync -az --delete --exclude='.git' --exclude='node_modules/' --exclude='.next/' \
  apps/website/ root@217.160.9.248:/srv/banzami/src/apps/website/
ssh root@217.160.9.248 'cd /srv/banzami/src/apps/website && docker build -t banzami/website-frontend:latest .'

# 2. Start ONLY the website services (never touches other services)
ssh root@217.160.9.248 'cd /srv/banzami && docker compose -p banzami up -d --no-deps website-frontend website-nginx'
```

## Cloudflare (Banzami account, separate from BANZA)

1. Zone `banzami.com` active; nameservers at LWS point to Cloudflare.
2. DNS: `A @ → 217.160.9.248` **proxied**; `CNAME www → banzami.com` **proxied**;
   keep `mail`/`MX`/`imap`/`pop`/`smtp` **DNS-only**; **no stray AAAA** to the origin.
3. **Origin Rule:** for `banzami.com` (and `www`), override **origin port → 8443**.
4. **SSL/TLS:** *Full (strict)* with a Cloudflare Origin Certificate (recommended),
   or *Full* with the self-signed origin cert.

## Verify

```bash
# Origin (bypass Cloudflare):
curl -k --resolve banzami.com:8443:217.160.9.248 https://banzami.com:8443/ -I   # 200
# Public (after the Origin Rule is live):
curl -I https://banzami.com            # 200
curl -I https://www.banzami.com        # 301 → apex
for p in /programadores /comerciantes /conformance /sobre /contacto; do curl -I https://banzami.com$p; done
curl -I https://banzami.com/nao-existe # 404
```

## Rollback (isolated — never affects BANZA or payments)

```bash
ssh root@217.160.9.248 'cd /srv/banzami && \
  docker compose -p banzami stop website-nginx website-frontend && \
  docker compose -p banzami rm -f website-nginx website-frontend && \
  cp docker-compose.yml.bak.website.<timestamp> docker-compose.yml'
# Cloudflare: pause the zone or remove the Origin Rule. Nothing to undo on BANZA.
```
