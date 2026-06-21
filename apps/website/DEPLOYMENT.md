# Banzami Website — Deployment

The official Banzami website (`apps/website`) deploys as a **Next.js standalone
container** to the existing production server, following the same pattern as the
other Next.js frontends (`pay`, `checkout`, `dashboard`, `admin`).

It is **isolated from the payment runtime**: the container has no `depends_on`,
makes no API calls, and exposes no payment endpoints. Deploying or rolling it
back never affects `core-api` or the Go payment services.

- **Domain:** `banzami.com` (+ `www.banzami.com` → 301 redirect to apex)
- **Container:** `website-frontend` · internal port **3000** · network `banzami_net`
- **Image:** `banzami/website-frontend:latest`
- **Reverse proxy:** host nginx (`infra/nginx/banzami.conf`) → `website-frontend:3000`

> **Status guardrail.** The site must always describe Banzami as **not certified**
> and **not launch-ready** ("PASS significa evidência, não certificação"). Do not
> introduce certification / launch-ready / production-ready claims at deploy time.

---

## 1. Build & run locally (Docker)

```bash
# from repo root
docker build -t banzami/website-frontend:latest apps/website
docker run --rm -p 3000:3000 banzami/website-frontend:latest
# → http://localhost:3000
```

Or the plain dev server (no Docker): `make website` → http://localhost:3005

---

## 2. Pre-deploy checks (run before deploying)

```bash
cd apps/website
npm run build           # production build OK
npm run typecheck       # tsc --noEmit OK
cd ../.. && make check-repo-layout
```

Content guardrails (must stay clean): Portuguese only, no `/internal/v1`, no
secrets, no `banzami.org`, BANZA link → `github.com/banza-protocol/banza`,
`banzami.com` + `contact@banzami.com` present, no forbidden claims.

---

## 3. DNS (must happen first — done outside the repo)

`banzami.com` currently points to LWS shared hosting (a parking page), **not**
this server. Before the site can serve on the domain:

1. In the DNS provider (registrar / Cloudflare), point **`banzami.com`** and
   **`www.banzami.com`** at the production server `217.160.9.248`
   (or proxy through Cloudflare to that origin — the nginx config already reads
   `$http_cf_connecting_ip`, consistent with the existing `.org` setup).
2. Provision a TLS certificate for `banzami.com` on the server at
   `/etc/nginx/certs/banzami-com.pem` and `/etc/nginx/certs/banzami-com.key`
   (e.g. a Cloudflare origin certificate for `banzami.com`).

TLS for `banzami.com` cannot be issued until DNS resolves to the server, so DNS
comes first.

---

## 4. Deploy

```bash
# from repo root, after committing + pushing changes
./deploy.sh website-frontend
```

This rsyncs `apps/website/` to `/srv/banzami/src/apps/website/`, builds the image
on the server, and recreates only the `website-frontend` container. No other
service is touched.

Then apply the nginx config (the `banzami.com` server block is in
`infra/nginx/banzami.conf`) and reload nginx **only after** the cert exists:

```bash
ssh root@217.160.9.248 'nginx -t && systemctl reload nginx'   # validate then reload
```

---

## 5. Verify

```bash
curl -I https://banzami.com                 # 200
curl -I https://banzami.com/programadores    # 200
curl -I https://banzami.com/comerciantes     # 200
curl -I https://banzami.com/conformance      # 200
curl -I https://banzami.com/sobre            # 200
curl -I https://banzami.com/contacto         # 200
curl -I https://banzami.com/nao-existe        # 404
curl -I http://banzami.com                   # 301 → https
```

Visual smoke test on desktop + mobile; check no console errors, no broken links,
email `contact@banzami.com` visible.

---

## 6. Rollback

The website is independent, so rollback is safe and isolated:

```bash
# Stop the site (other services unaffected)
ssh root@217.160.9.248 'cd /srv/banzami && docker compose stop website-frontend'

# Or roll back to a previous image / commit and redeploy
git revert <commit> && ./deploy.sh website-frontend

# DNS-level rollback: point banzami.com back to the previous host.
```

Removing the `banzami.com` nginx server block (and reloading) returns the domain
to its prior state. None of these steps affect the payment runtime.
