# website-certs

Origin TLS certificate for the Banzami website (`banzami.com`), mounted into the
`website-nginx` container at `/etc/nginx/certs`.

**Certificates and keys are NOT committed.** At deploy time the files live on the
server at `/srv/banzami/website-nginx/certs/`:

- `banzami-com.pem` — the certificate served for `banzami.com` (+ `www`)
- `banzami-com.key` — its private key

> **Correction (2026-08-30, Stage D.1).** This file previously described
> `banzami-com.pem` as a *Cloudflare Origin Certificate*. **It is not.** The
> certificate actually deployed is **self-signed** — `subject == issuer ==
> CN=banzami.com`, `CA:TRUE`, expiring 2028-09-23 — verified by connecting to the
> live origin on `:8443` with SNI `banzami.com`. It fails chain verification
> against Cloudflare's Origin CA root while covering the right hostnames, which
> is exactly the shape that passes casual inspection.
>
> This is why the zone is on SSL mode **`full`** and not `full (strict)`: under
> strict, `banzami.com` and `www.banzami.com` would return **526 Invalid SSL
> certificate**. Every other proxied origin path already presents the Cloudflare
> Origin CA wildcard (`banzami-wildcard.pem`) and passes.

For Cloudflare SSL/TLS mode *Full (strict)* use a Cloudflare Origin Certificate;
*Full* mode also works with a self-signed cert — which is the mode this host is
in today. See `apps/website/DEPLOYMENT.md` and
[STAGE_D1_CLOUDFLARE_FULL_STRICT_PREFLIGHT.md](../../../evidence/ops/STAGE_D1_CLOUDFLARE_FULL_STRICT_PREFLIGHT.md).
