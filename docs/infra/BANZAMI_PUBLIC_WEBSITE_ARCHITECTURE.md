# Banzami — Public Website Architecture (independence rule)

Version: 1.0

> **Scope note.** Sanitised: no IPs, hostnames, SSH users, server paths, secrets, tokens,
> DB URLs, raw logs or private endpoints. Public domain names only. Governs how the
> institutional website `banzami.com` is served and why it must stay independent of the
> payment stack.

## The rule

**The institutional website `banzami.com` must be able to start independently of
payment/admin/gateway/API/pay/checkout/Developer Platform services.**

A down payment stack must **not** prevent the institutional website from serving. Restoring
`banzami.com` must **not** require a full production restore. Website deploy/recovery is a
**separate concern** from payment/Sandbox deploy.

## Forbidden coupling

- `banzami.com` must **not** depend on payment/admin/gateway/API/pay/checkout/Developer
  Platform upstream availability to start or to serve its own pages.
- The website's public proxy must **not** fail to start because an unrelated upstream is
  down.

## Required posture (one of)

The public proxy that terminates TLS on port 443 for `banzami.com` must either:

1. **be website-only** — its sole upstream is the website application; or
2. **use a resolver-based configuration** — so a down/unresolvable upstream for other
   vhosts cannot prevent the proxy from starting and serving the website vhost.

A single shared proxy with **static** upstreams and **no DNS resolver** is the failure mode
that caused the incident (see
[BANZAMI_WEBSITE_RECOVERY_RUNBOOK.md](BANZAMI_WEBSITE_RECOVERY_RUNBOOK.md)): it refuses to
start while payment/admin/gateway upstreams are down, taking the public site down with them.

## Current recovery topology (as restored)

```
Cloudflare (public 443)
        │
        ▼
website-only reverse proxy  ── sole upstream ──▶  website application (Next.js)
   (TLS on public 443)                              (serves banzami.com / www)
```

- **Website-only proxy on public 443.**
- **Sole upstream = the website application.**
- **No dependency on payment/admin/gateway upstreams** — `banzami.com` serves whenever the
  website application is healthy, regardless of the rest of the stack.

The `api`, `admin`, `pay`, `checkout` and `developers` subdomains are served by the separate
production stack and remain intentionally offline until a separately approved full
production restore. Bringing the website up does not bring those up, and does not require
them.

## Relationship to the source of truth

Website images are rebuilt from the single authorised local repository (see
[BANZAMI_SINGLE_SOURCE_OF_TRUTH.md](BANZAMI_SINGLE_SOURCE_OF_TRUTH.md)); the server holds no
Git history. Website recovery rebuilds the website image and starts the website application
and the website-only proxy — nothing else.
