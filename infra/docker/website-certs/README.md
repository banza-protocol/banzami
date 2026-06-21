# website-certs

Origin TLS certificate for the Banzami website (`banzami.com`), mounted into the
`website-nginx` container at `/etc/nginx/certs`.

**Certificates and keys are NOT committed.** At deploy time the files live on the
server at `/srv/banzami/website-nginx/certs/`:

- `banzami-com.pem` — Cloudflare Origin Certificate for `banzami.com` (+ `www`)
- `banzami-com.key` — its private key

For Cloudflare SSL/TLS mode *Full (strict)* use a Cloudflare Origin Certificate;
*Full* mode also works with a self-signed cert. See `apps/website/DEPLOYMENT.md`.
