# Stage D — Public Sandbox Routing Evidence

- **Date:** 2026-08-30
- **Commit:** branch `assurance/stage-d-public-sandbox-routing`, from `main` @ `28cb1905`
- **Host:** 217.160.9.248
- **Verdict: `Public Sandbox Routing: HOLD`** — origin ingress restricted and
  proven; public routing blocked on two external actions (§7).
- **Activation attempt 2026-08-30 (§11): still HOLD.** Neither external
  dependency could be executed — no provider credentials exist, and the only
  Cloudflare credential is unchanged and unusable for routing. Nothing was faked
  and no credential was broadened.

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


---

## 11. Final external activation attempt — 2026-08-30

Run against `main` @ `baf8ad51` (PR #63 merged: MERGEABLE/CLEAN, 8/8 CI, diff
matching the Stage D report). Working tree clean.

### 11.1 Outcome

**`Public Sandbox Routing: HOLD`.** Of the 14 PASS criteria, 12 hold. The two
that do not are the two external dependencies, and both remain unavailable:

| Dependency | Required | Available | Result |
|---|---|---|---|
| Provider firewall — allow 2053 | provider console/API credentials | **none present** | not applied |
| Cloudflare Origin Rule → 2053 | zone-scoped rule-edit token, or dashboard | **none present** | not applied |

### 11.2 Provider state — measured, not inferred

The original two-vantage-point test no longer distinguishes the layers: with the
host now dropping non-Cloudflare sources, an external probe is refused whether
the provider filters or the host rule works. The observable result is identical.

The distinguishing question is whether the packet *arrived*. Counter zeroed,
three external connection attempts made, counter re-read:

```
DROP counter after 3 external attempts: 0 packets
```

Zero packets reached the host, so **the provider is still filtering upstream**.
Had the provider opened the port, the counter would have risen and the host
restriction would have been what refused the connection — the intended steady
state. This is also the check to run immediately after the provider change.

### 11.3 Cloudflare credential — re-checked, unchanged, not broadened

`/root/.cloudflare/credentials.ini` still holds `dns_cloudflare_api_token`. It
verifies as **active** and lists **0 zones**. It cannot create Origin Rules.

Per the Stage D brief it was not repurposed and not broadened. Required instead:
a token scoped to the banzami.com zone with permission to edit Origin Rules, or
authorised dashboard access. Nothing was routed by any other means — in
particular DNS was **not** switched to DNS-only, which would have produced a
working sandbox by removing the Cloudflare proxy that the architecture requires.

### 11.4 Host enforcement re-verified (§4 of the brief)

| Property | Result |
|---|---|
| Matches ORIGINAL direction only | `--ctdir ORIGINAL` present, 1 hook, no direction-blind duplicate |
| Accounts for DNAT | `--ctorigdstport 2053`, not `--dport` |
| Cloudflare IPv4 ranges complete | **15/15**, no drift vs Cloudflare's published list |
| Cloudflare IPv6 mirror | 7 ranges (host has no global IPv6 today) |
| Non-Cloudflare rejected | default DROP after the allowlist |
| Replies permitted | direction qualifier present — the RA-032 defect stays fixed |
| Survives loss | hook deleted, `systemctl restart` restored it — exactly 1 hook, 15 rules |
| Boot + docker wiring | enabled in `multi-user.target.wants` and `docker.service.wants`; active |

Allowlist freshness matters and was checked rather than assumed: a range added by
Cloudflare after the file was written would be silently dropped once the port
opens. Today the file matches exactly.

### 11.5 Checker non-vacuity (§14) — all three legs

| Leg | Result |
|---|---|
| Unreachable host | **FAIL** (4 failures) |
| Healthy stack reporting `environment=live` | **FAIL**, exit 1 — refuses to treat a non-sandbox stack as the Sandbox |
| Same stub reporting `environment=sandbox` | **PASS**, exit 0 |

The checker was not weakened, and the PASS leg was re-proven so that the failures
below are known to be real rather than a checker that can only say no.

### 11.6 Gates

| Gate | Result |
|---|---|
| `make security-check` | **PASSED** |
| `make check-live-fail-closed` | **PASS** — SEC-019 still registered |
| `TestMerchantSurface_*` | **PASS** — merchant P2P transfer surface still unmounted |
| `make assure-sandbox-runtime` (public, no overrides) | **FAILS 4/4** — correct; the sandbox is not publicly reachable |
| `make assure-sandbox-launch` | **HOLD — 18 failures across 9 capabilities**, `public released: 5/14` |

The 18 was re-measured, not carried forward. Blocked capabilities: CAP-PAY-001,
CAP-PAY-002, CAP-PAY-003, CAP-REFUND-001, CAP-PAYOUT-001, CAP-WEBHOOK-001,
CAP-SDK-001, CAP-SDK-002, CAP-APP-004. **No capability status was changed.**

### 11.7 Production non-regression

`banzami.com` **200** · `www.banzami.com` **301** · `developers.banzami.com`
**200** — identical to the pre-change baseline. Origin `:2053` remains
unreachable from the Internet. The website edge was not touched.


---

## 12. Independent verification after the manual external changes — 2026-08-30

Requested to verify and close Stage D following manual application of both
external actions. Verified against `main` @ `3f3f8c06`, clean tree.

### 12.1 Outcome

**`Public Sandbox Routing: HOLD`. Neither external change is in effect.** This is
not a judgement about what was done in the consoles — it is what the path
measures from outside and from the host.

### 12.2 Provider ingress — no packet reaches the host

The mandatory counter test, run from two independent external networks:

| Step | Result |
|---|---|
| `iptables -Z BANZAMI-ORIGIN-2053` | counter zeroed |
| 3 × `nc -z 217.160.9.248 2053` from workstation (ISP A) | refused/timeout |
| 1 × TCP connect from VPS 82.165.165.97 (ISP B) | filtered |
| Counter re-read | **0 packets, 0 bytes** |
| Every rule in the chain | **all counters 0** — nothing has ever hit it |

Controls from the same second source in the same run: `:443` **OPEN**, `:8443`
**OPEN**, `:2053` **filtered**. So the host is reachable and it is specifically
2053 that is not.

Zero packets means the filtering is still upstream of the host. Had the provider
opened the port, the counter would have risen and the host rule would have been
what refused the connection — the intended steady state.

### 12.3 Cloudflare routing — the rule is not matching

Both sandbox hostnames return **503 with `content-type: text/html`**, carrying
`server: cloudflare`, `cf-cache-status: DYNAMIC`, `retry-after: 3600` — the
website edge's Stage B guard page, proxied back by Cloudflare.

That specific response localises the problem:

| Observed | Means |
|---|---|
| **503 + website guard HTML** (actual) | Cloudflare connected to origin **:443** — the port override is not applying |
| **522** (not observed) | Cloudflare tried **:2053** and could not connect — rule applying, provider blocking |

Because it is 503 and not 522, the request never went to 2053, independently of
the provider state.

Tested across `/`, `/health`, `/readyz`, `/v1` and `/consumer/v1/consumers/search`
on `sandbox-api`, and `/` and `/health` on `developer-api` — **all 503 HTML**, so
the rule is not merely scoped too narrowly to one path.

Control in the same run: `banzami.com`, whose Origin Rule to `:8443` is known to
work, returned **200**. The mechanism functions in this zone; it is not reaching
these two hostnames.

### 12.4 Origin side is healthy — the fault is not here

`bzsbedge-sandbox-edge` `Up 2 hours (healthy)`; local origin request through the
edge returns **200**, `environment=sandbox`, database and redis `ok`. The sandbox
is ready to be reached; nothing reaches it.

### 12.5 Hypotheses to check in the consoles

Offered as hypotheses, not findings — this repository cannot see either console.

*Provider:* rule attached to a different server/instance; saved but not applied;
direction set to outbound; protocol set to UDP; or a policy created but not bound
to this host.

*Cloudflare:* rule saved but not enabled/deployed; created in a different zone in
the account; created as a Redirect or Transform Rule rather than an **Origin Rule
with a destination-port override**; or an expression that does not match (e.g.
matching the Host header field rather than hostname, or a typo in either name).

The discriminator in §12.3 is the fastest way to confirm a fix: once the Origin
Rule matches, these hostnames stop returning the website's 503 HTML. If the
provider is still closed at that moment they will return **522**, which is
progress, not regression — and the §12.2 counter will begin to rise.

### 12.6 Gates at time of verification

| Gate | Result |
|---|---|
| `make security-check` | **PASSED** |
| `make check-live-fail-closed` | **PASS** — SEC-019 still registered |
| `make assure-sandbox-runtime` (public, no overrides) | **FAILS 4/4** — 503 on all four surfaces |
| `make assure-sandbox-launch` | **HOLD — 18 failures across 9 capabilities**, `public released: 5/14` |
| Production: `banzami.com` / `www` / `developers` | **200 / 301 / 200** — unchanged |
| Direct origin `:2053` from the Internet | **blocked** |

No capability status was changed. The checker was not weakened, and Stage D was
not closed.
