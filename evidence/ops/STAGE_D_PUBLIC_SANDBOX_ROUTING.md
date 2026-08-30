# Stage D — Public Sandbox Routing Evidence

- **Date:** 2026-08-30
- **Commit:** branch `assurance/stage-d-public-sandbox-routing`, from `main` @ `28cb1905`
- **Host:** 217.160.9.248
- **Verdict: `Public Sandbox Routing: HOLD`** — origin ingress restricted and
  proven; public routing blocked on two external actions (§7).

No tokens, keys, secrets or auth headers appear in this record.

---

## 1. Starting state (verified, not assumed)

| Item | Observed |
|---|---|
| PR #62 | **open, not merged** — Stage C was complete but not on `main`; merged as part of Stage D |
| `main` after merge | `28cb1905`, clean tree |
| CI on Stage C HEAD | 8/8 pass |
| sandbox-edge | `Up (healthy)`, serving all four surfaces at the origin |
| Sandbox services | 6 containers `Up 7 weeks (healthy)` |
| `sandbox-api` / `developer-api` public | **503** (website edge guard) |
| `banzami.com` / `www` / `developers` | 200 / 301 / 200 |
| Origin `:2053` from the Internet | **filtered** |

## 2. Perimeter finding — ufw does not govern Docker ports

`FORWARD` is entered by `DOCKER-USER` and `DOCKER-FORWARD` (22M packets each);
the ufw forward chains below show **0**. Port **8443** is reachable from the
Internet and appears in no ufw rule.

`ufw status` therefore does not describe this host's real perimeter for any
published container port. Consistent with RA-005 (July), which measured the same
thing and left `:8443` restriction as an open recommendation.

## 3. Where 2053 is actually blocked

Not by the host. Before any Stage D change, `DOCKER-USER` was empty and ufw does
not apply, yet `:2053` was unreachable externally while the host reached its own
`:2053` fine.

| Vantage point | `:443` | `:2053` | `:8443` |
|---|---|---|---|
| Local workstation (ISP A) | OPEN | filtered | OPEN |
| Independent VPS 82.165.165.97 (ISP B) | OPEN | filtered | OPEN |
| The host itself | OPEN | OPEN | OPEN |

Two independent networks agree, and nothing on the host filters it, so the filter
is upstream at the provider. Its effective allowlist is `{22, 443, 8443}` — 8443
being present because `banzami.com` already uses it as an origin port.

## 4. Restricted origin ingress — implemented

`infra/security/origin-ingress-restrict.sh` →
`/usr/local/sbin/banzami-origin-ingress-restrict.sh`, persisted by
`banzami-origin-ingress.service` (enabled; `WantedBy` `multi-user.target` and
`docker.service`; no `iptables-persistent` exists on this host).

```
DOCKER-USER: -p tcp -m conntrack --ctorigdstport 2053 --ctdir ORIGINAL
             -j BANZAMI-ORIGIN-2053
BANZAMI-ORIGIN-2053: 15 Cloudflare IPv4 ranges -> RETURN, then DROP
                     (IPv6 mirror: 7 ranges, for if IPv6 is ever enabled)
```

Two defects were found and fixed while building it, both by testing rather than
reading:

- **`--dport 2053` matches nothing here.** DNAT rewrites the port to 443 before
  `FORWARD`, so such a rule reads correctly and protects nothing.
- **`--ctdir ORIGINAL` is required.** Without it the container's replies also
  traverse the chain, source-matched against Cloudflare, and are dropped —
  measured as `RETURN` 6 packets vs `DROP` 8. The symptom would have been a
  **Cloudflare 522 the moment the port was opened**, over an origin that looks
  healthy from the host.

## 5. Verification

Host-local and container-sourced tests are **invalid** here: with Docker's
userland proxy, locally-delivered connections are served by `docker-proxy` on
`INPUT` and never traverse `DOCKER-USER`. The first attempt reported success
against a rule that had not been consulted. Verification used an isolated network
namespace, which produces genuinely forwarded packets.

| Leg | Result |
|---|---|
| Path validity (netns → `:443`, unrestricted) | reachable — packets do traverse DNAT + FORWARD |
| DROP (netns `10.199.99.2` → `:2053`) | **blocked**, DROP counter 0 → 6 |
| ACCEPT (same source, temporarily allowlisted) | **HTTP 200**, `environment=sandbox`, DROP counter stayed 0 |

Allowlist restored and re-verified: 15 ranges, test entry removed, no namespace
or interface residue. The test address was RFC1918, inside a namespace created
for the test, never Internet-routable.

## 6. TLS

Unchanged; nothing issued. Origin presents the existing Cloudflare Origin CA
certificate, SANs `*.banzami.com` + `banzami.com`, valid to 2041 — both sandbox
hostnames already covered. Full (strict) preserved; no Flexible, no disabled
validation, no plaintext origin.

## 7. Remaining external actions

**7.1 Provider firewall — allow inbound 2053.** Not reachable from this
repository; requires the provider console.

**7.2 Cloudflare Origin Rule** — Rules → Origin Rules, banzami.com zone:
hostname equals `sandbox-api.banzami.com` or `developer-api.banzami.com` →
rewrite destination port to `2053`. The mechanism is already proven in this
account: `banzami.com` reaches origin `:8443` the same way.

**Credential limitation.** `/root/.cloudflare/credentials.ini` holds a certbot
DNS-challenge token (`dns_cloudflare_api_token`). It verifies as active but lists
**zero zones** and is refused when reading its own definition, so it cannot
create Origin Rules. It was **not** broadened: widening an ACME automation
credential to redirect production traffic is not a change to make silently. A
zone-scoped token with rule-edit permission, or dashboard access, is required.

## 8. Post-change verification

| Surface | Result |
|---|---|
| `banzami.com` | **200** (unchanged) |
| `www.banzami.com` | **301** (unchanged) |
| `developers.banzami.com` | **200** (unchanged) |
| `sandbox-api.banzami.com/health` | 503 — not yet routed |
| `developer-api.banzami.com/health` | 503 — not yet routed |
| Origin `:2053` from the Internet | **still blocked** |

## 9. Gates

| Gate | Result |
|---|---|
| `make security-check` | **PASSED** (1 non-enforced notice: govulncheck not installed locally; the CI Security job runs it) |
| `make check-live-fail-closed` | **PASS** — SEC-019 registered as a pre-Live condition |
| `TestMerchantSurface_*` (3 tests) | **PASS** — merchant P2P transfer surface still unmounted |
| `make assure-sandbox-runtime` (public, no overrides) | **FAILS 4/4** — correct today; the signal Stage D is incomplete |
| `make assure-sandbox-launch` | **HOLD** — 18 failures, 9 capabilities, `public released: 5/14` |

Blocked capabilities, unchanged from Stage C: CAP-PAY-001/002/003,
CAP-REFUND-001, CAP-PAYOUT-001, CAP-WEBHOOK-001, CAP-SDK-001, CAP-SDK-002,
CAP-APP-004. **No capability status was changed in Stage D.**

## 10. Rollback

`DOCKER-USER` was empty before Stage D, so removing the chain and its hook
restores the prior state exactly. Full steps in
[docs/operations/SANDBOX_PUBLIC_ROUTING.md](../../docs/operations/SANDBOX_PUBLIC_ROUTING.md) §9.
Nothing in the rollback touches ufw, the website edge, DNS or any production
container. Withdrawing the host control while 2053 is open at the provider would
leave the origin globally reachable — roll back the provider rule first.
