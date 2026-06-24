# Domain Consolidation & `.com` Canonicalization

Status: **approved** (PR #4). This is the binding domain architecture for Banzami.
`banzami.org` is reserved for the **BANZA protocol**; everything Banzami
payment/product/runtime is `.com`, kept intentionally small.

## 1. Final approved domain architecture

The **complete** set of Banzami hosts — nothing else exists:

| Host | Purpose |
|------|---------|
| `banzami.com`, `www.banzami.com` | Public website |
| `api.banzami.com` | **Single** public API (live) |
| `sandbox-api.banzami.com` | Sandbox API |
| `pay.banzami.com` | Payments / hosted checkout |
| `banzami.org` | BANZA protocol only (docs/site) |

### No new subdomains

Do **not** create any other subdomain. Explicitly forbidden without a separate
architecture review **and** explicit approval:

- `consumer.banzami.com`
- `business.banzami.com`
- `admin.banzami.com`
- `staging.banzami.com`

Before proposing any new subdomain, produce a justification report covering:
why an existing host/path cannot solve it, operational impact, DNS impact, TLS
impact, mobile deep-link impact, and maintenance cost.

## 2. `api.banzami.org` decommission plan

`api.banzami.org` is **legacy and temporary**. It must **never** become a
permanent runtime endpoint.

1. **Keep serving** for compatibility — **do NOT redirect** it. A 30x on an API
   host breaks programmatic POST/auth clients (body/headers don't survive).
2. **Migrate all clients** to `api.banzami.com` (done in-code: mobile, merchant
   SDK config, admin/checkout CSP, dockerfiles).
3. **Monitor** `api.banzami.org` request volume.
4. When **no active clients remain → return `410 Gone`**.
5. Then **remove** the host from the nginx `server_name` entirely.

(Encoded as a NOTE on the api server block in `infra/nginx/banzami.conf`.)

## 3. API simplification

`api.banzami.com` is the **single** public API endpoint. Do **not** introduce
separate API hosts for consumer / business / merchant / admin audiences.
Separate audiences via **scopes, permissions, authentication, and routing — not
DNS**. (The mobile public-API default and merchant gateway default both point at
`api.banzami.com`.)

> Priority-2 cleanup: the nginx CORS allow-list still references
> `admin|business.banzami.org` origins for the existing admin/business
> frontends. Folding those into `banzami.com/<path>` (or scoped auth) is part of
> the architecture review — left serving until then to avoid breaking them.

## 4. Canonical payment link

**Approved canonical:** `https://pay.banzami.com/pay/<slug>`
Supported routes on `pay.banzami.com`: `/pay/<slug>`, `/r/<code>`, `/u/<handle>`.

**Legacy — must disappear after migration:**
- `pay.banzami.org/*` — currently 301-redirects to `pay.banzami.com` (browser GET,
  safe); remove once old links are drained.
- bare `/<slug>` — currently 308-redirects to `/pay/<slug>`; remove once no longer hit.

## 5. Mobile gate before SDK rollout (HARD GATE)

Do **NOT** publish the SDK update and do **NOT** update Doa's vendored SDK until
**both** are confirmed **on real devices**:

- [ ] **iOS** — tapping `https://pay.banzami.com/pay/<slug>` opens the Banzami app
      directly (Universal Link), after the AASA propagates on `pay.banzami.com`.
- [ ] **Android** — tapping `https://pay.banzami.com/pay/<slug>` opens the Banzami
      app directly (App Link); requires the **release-keystore SHA256** added to
      `assetlinks.json` (currently a `TODO(ops)`).
- [ ] **Web fallback** — with the app NOT installed, the link opens the
      `pay.banzami.com/pay/<slug>` web page.

Only after all three pass: publish the SDK, then re-sync Doa's vendored
`vendor/banzami-sdk` so its CTA emits `/pay/<slug>`.

## 6. Rollout sequence

1. Merge PR #4 (after `flutter analyze` + build pass on a Flutter host).
2. Deploy pay app (`/pay/<slug>` + bare-slug redirect); reload nginx
   (`pay.banzami.com` canonical, `pay.banzami.org` 301). `nginx -t` on the server.
3. Add release SHA256 to `assetlinks.json`; verify
   `pay.banzami.com/.well-known/{apple-app-site-association,assetlinks.json}`
   return 200 with no redirect.
4. Ship mobile app (associated domains + App Links + `/pay/<slug>` handler).
5. **Mobile gate (§5)** — confirm iOS + Android + web fallback on devices.
6. Publish SDK; re-sync Doa vendored SDK; verify Doa CTA on doadoa.app.
7. API cutover: confirm all clients on `api.banzami.com`; later `410 Gone` then
   remove `api.banzami.org` (§2).
8. Architecture review (separate) for consumer/business/admin before any change
   to those hosts.
