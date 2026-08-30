# Stage D.1 — Cloudflare Full (strict) Preflight

- **Date:** 2026-08-30
- **Zone:** `banzami.com` — `474867913af985e647cfcf09da452f9e`
- **Starting SSL mode:** `full`
- **Final SSL mode:** `full` — **unchanged**
- **Verdict: `CLOUDFLARE FULL STRICT: HOLD`**

No secrets, private keys or certificate key material appear in this record.

---

## 1. Outcome

**`FULL STRICT PREFLIGHT: HOLD`. No Cloudflare setting was written.**

Two of nine proxied origin paths would fail Full (strict) validation:
`banzami.com` and `www.banzami.com` are served from a **self-signed**
certificate. Under strict they would return **526 Invalid SSL certificate** —
the two most important production hostnames, taken down by a single zone-wide
toggle.

This is the case the preflight exists to catch, and it contradicts what this
repository previously recorded. See §7.

## 2. Proxied host inventory — derived from Cloudflare, not assumed

Nine proxied records, all A/CNAME to `217.160.9.248`:

`banzami.com` · `www.banzami.com` · `developers.banzami.com` ·
`sandbox-api.banzami.com` · `developer-api.banzami.com` · `api.banzami.com` ·
`admin.banzami.com` · `pay.banzami.com` · `sandbox-operator.banzami.com`

Non-proxied and therefore unaffected by the zone SSL mode: `mail` (a different
host), `ftp`, `imap`, `pop`, `smtp`, and the MX/TXT records.

## 3. Hostname → origin mapping

Three distinct origin ports, from the zone's `http_request_origin` ruleset plus
the default:

| Origin port | Hostnames | Terminates at |
|---|---|---|
| **8443** | `banzami.com`, `www`, `developers` | `banzami-website-nginx-1` |
| **2053** | `sandbox-api`, `developer-api` | `bzsbedge-sandbox-edge` |
| **443** (default, no rule) | `api`, `admin`, `pay`, `sandbox-operator` | `banzami-website-nginx-1` default block |

Note that port 8443 is **not** one certificate: the website container serves
different certificates per `server_name` on the same port. Assuming one origin
port means one certificate is precisely the error that made this migration look
safe.

## 4. Certificate preflight — chain-verified, not issuer-string-inspected

Each origin path was probed with its real SNI, and the leaf verified against
Cloudflare's published Origin CA root (`origin_ca_rsa_root.pem`), not merely read
for a plausible issuer name.

| Hostname | Port | Chain vs Origin CA root | Hostname coverage | Strict-ready |
|---|---|---|---|---|
| `banzami.com` | 8443 | **verification failed** | matches | **NO** |
| `www.banzami.com` | 8443 | **verification failed** | matches | **NO** |
| `developers.banzami.com` | 8443 | OK | matches | yes |
| `sandbox-api.banzami.com` | 2053 | OK | matches | yes |
| `developer-api.banzami.com` | 2053 | OK | matches | yes |
| `api.banzami.com` | 443 | OK | matches | yes |
| `admin.banzami.com` | 443 | OK | matches | yes |
| `pay.banzami.com` | 443 | OK | matches | yes |
| `sandbox-operator.banzami.com` | 443 | OK | matches | yes |

**7 of 9 pass. 2 fail — and they are the production website.**

### The blocking certificate

| Property | Value |
|---|---|
| Served for | `banzami.com`, `www.banzami.com` on `:8443` |
| Subject | `CN = banzami.com` |
| Issuer | `CN = banzami.com` — **subject == issuer, self-signed** |
| Basic Constraints | `CA:TRUE`, critical |
| Validity | 2026-06-21 → **2028-09-23** |
| SAN | `DNS:banzami.com, DNS:www.banzami.com` |
| Config | `conf.d/website.conf` → `/etc/nginx/certs/banzami-com.pem` |

It covers the right hostnames and is not expired, so hostname and validity checks
pass. Only chain verification fails — the shape that survives casual inspection.

### The certificate every other path uses

| Property | Value |
|---|---|
| Issuer | `CloudFlare, Inc.` — `CloudFlare Origin SSL Certificate Authority` |
| SAN | `DNS:*.banzami.com, DNS:banzami.com` |
| Expires | **2041-06-20** |
| Config | `banzami-wildcard.pem` |

Cloudflare Origin CA certificates are supported under Full (strict), which the
seven passing paths demonstrate rather than assume.

## 5. Public baseline (pre-change; nothing was changed after it)

| Hostname | HTTP | TLS verify |
|---|---|---|
| `banzami.com` | 200 | 0 |
| `www.banzami.com` | 301 | 0 |
| `developers.banzami.com` | 200 | 0 |
| `sandbox-api.banzami.com` | 404 at `/` (200 on `/health`, `/readyz`) | 0 |
| `developer-api.banzami.com` | 404 at `/` (200 on `/health`) | 0 |
| `api` / `admin` / `pay` / `sandbox-operator` | 503 | 0 |

The 503s are application-level guards, not TLS failures — the distinction that
matters when reading post-change results. All nine terminate TLS successfully
today, because mode `full` does not check the certificate.

## 6. Cloudflare change

**None.** The preflight failed, so under §7/§8 of the brief no write was made.
DNS, Origin Rules, WAF, proxy state, certificates and destination ports are all
untouched. Read-after-write is not applicable; the zone remains on `full`,
re-confirmed by direct read.

Rollback is not applicable — there is nothing to roll back.

## 7. Corrections to this repository's own record

The preflight disproved statements written here, including by me in Stage D:

- **`infra/docker/website-certs/README.md`** described `banzami-com.pem` as "a
  Cloudflare Origin Certificate for banzami.com (+ www)". It is self-signed.
- **Stage D evidence §13.6** said switching to strict "looks low-risk (all
  proxied hosts terminate on nginx with that Origin CA certificate)". Wrong —
  `banzami.com` and `www` do not. The hedge that followed it ("that is
  unverified, and being wrong means a production outage") is what held.
- **Two "Full (strict) preserved" lines** asserted more than was true: nothing
  was downgraded, but the zone has been on `full` throughout, so the origin
  certificate was never being validated.

`infra/nginx/website.conf`'s comment describing the *target* (an Origin
Certificate for strict) is left standing as target architecture, with the current
reality recorded beside it.

## 8. Remediation — narrow, and not performed here

No new certificate is needed. `banzami-wildcard.pem` is **already mounted in the
same container**, already serves `developers.banzami.com` on the **same port**,
and its SAN covers `*.banzami.com` **and** `banzami.com`. Pointing the
`banzami.com`/`www` server block at it makes all nine paths strict-ready.

Sequence, when authorised:

1. change `infra/nginx/website.conf` to the wildcard cert + key; deploy;
2. re-run the §4 chain verification — all nine must return OK;
3. verify `banzami.com` / `www` still serve 200/301 on mode `full`;
4. only then set the zone to `strict` via MCP, read-after-write;
5. re-test all nine, watching for 525/526;
6. rollback = zone `strict → full`, which needs no origin change.

Deliberately not done in this task: it is a production TLS change on the website
path, and this task was scoped to one Cloudflare setting. Step 3 matters — it
proves the origin change alone is safe *before* strict makes it load-bearing.

## 9. Gates at time of preflight

| Gate | Result |
|---|---|
| `make assure-sandbox-runtime` (no overrides) | **PASS** — 4/4, `environment=sandbox` |
| `make assure-sandbox-launch` | **HOLD — 18 failures across 9 capabilities**, `public released: 5/14` |
| `make security-check` | **PASSED** |
| `make check-live-fail-closed` | **PASS** — SEC-019 registered |
| Production `banzami.com` / `www` / `developers` | **200 / 301 / 200** |
| Direct `origin:2053` from the Internet | **blocked** |

Stage D routing is intact and no capability was promoted.
