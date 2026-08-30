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


---

## 13. Cloudflare Origin Rule applied via MCP — 2026-08-30

Applied with authorised Cloudflare MCP access. The certbot credential at
`/root/.cloudflare/credentials.ini` was **not** read, used or altered.

### 13.1 Outcome

**`Cloudflare Sandbox Routing: GO` · `Provider Ingress: HOLD` · `Public Sandbox
Routing: HOLD`** — Case B of the brief.

### 13.2 Zone state, inspected before any write

| Item | Value |
|---|---|
| Zone | `banzami.com` — `474867913af985e647cfcf09da452f9e`, active, account "Fidel Monteiro" |
| `sandbox-api.banzami.com` | A → `217.160.9.248`, **proxied** |
| `developer-api.banzami.com` | A → `217.160.9.248`, **proxied** |
| Origin ruleset | `215b731da0d54cbabb56f2be052ede09`, phase `http_request_origin`, kind `zone`, version **4** |
| Existing rule 1 | `f0a2869d…` — `banzami.com` / `www` → port **8443**, enabled |
| Existing rule 2 | `f259155c…` — `developers.banzami.com` → port **8443**, enabled |
| Rule for the sandbox hostnames | **none existed** |
| SSL/TLS mode | **`full`** — not `full (strict)` (see §13.6) |

The absence of any sandbox rule — not a disabled one, not a misconfigured one,
not one in the wrong phase — is what the §12 diagnosis predicted from the 503.

### 13.3 The rule created

| Field | Value |
|---|---|
| Rule id | `0b6455ac2dbb40f1ba3071835d389c4f` |
| Description | `Banzami Sandbox origin port 2053` |
| Enabled | **true** |
| Ruleset | `215b731da0d54cbabb56f2be052ede09` (`http_request_origin`), version 4 → **5** |
| Order | 3 of 3 (appended) |
| Expression | `(http.host eq "sandbox-api.banzami.com") or (http.host eq "developer-api.banzami.com")` |
| Action | `route`, `action_parameters.origin.port = 2053` |

Appended rather than rewritten, so the two production rules are untouched.
Neither matches a sandbox hostname, so there is no ordering conflict. Naming
follows the zone's existing convention (`… origin port <N>`).

### 13.4 Read-after-write

Re-read in an independent GET, not inferred from the write response: rule
present, enabled, correct zone, correct expression, port **2053**; both
production rules unchanged at 8443; all five relevant DNS records still
**proxied**; SSL mode unchanged.

### 13.5 Public results and failure localisation

| Endpoint | Before | After |
|---|---|---|
| `sandbox-api.banzami.com/health` | 503 website HTML | **522** |
| `sandbox-api.banzami.com/readyz` | 503 website HTML | **522** |
| `developer-api.banzami.com/health` | 503 website HTML | **522** |

`content-type: text/plain`, `server: cloudflare` — Cloudflare's own 522, not an
origin response. Per the §12.3 discriminator this is decisive: **503 meant
Cloudflare was reaching origin `:443`; 522 means it is now reaching for `:2053`
and cannot connect.** The Cloudflare half is done.

### 13.6 TLS finding — SSL mode is `full`, not `full (strict)`

Read from the zone settings. Every document here, and the Stage D brief, assumed
strict. Under `full` Cloudflare encrypts to the origin but does **not validate
the origin certificate**. The certificate is fine — Cloudflare Origin CA,
`*.banzami.com` + `banzami.com`, to 2041 — which is what makes this easy to miss:
a correct certificate is not the same as anyone checking it.

**Not changed.** Zone-wide setting affecting every production hostname, and the
brief's instruction is to report a TLS discrepancy rather than modify it.
Switching to strict looks low-risk (all proxied hosts terminate on nginx with
that Origin CA certificate, which Cloudflare trusts under strict) but that is
unverified, and being wrong means a production outage. Belongs in an ops window.

### 13.7 Provider state — counter evidence with real Cloudflare traffic

Counters zeroed, then three real requests through Cloudflare to
`sandbox-api.banzami.com` (all 522), then counters re-read:

```
total packets through BANZAMI-ORIGIN-2053: 0
DROP leg:                                   0
```

Zero. Cloudflare is attempting `:2053` and **not one packet reaches the host**,
so the provider is still filtering inbound TCP 2053. This also rules out the
alternative explanation for a 522 — that packets arrive and the host allowlist
wrongly drops them — because that would have incremented the DROP leg.

The provider firewall was not touched, and no alternative origin port was
substituted to force a green result.

### 13.8 Production non-regression

| Host | Baseline | After |
|---|---|---|
| `banzami.com` | 200 | **200**, TLS verify 0 |
| `www.banzami.com` | 301 | **301**, TLS verify 0 |
| `developers.banzami.com` | 200 | **200**, TLS verify 0 |
| `api` / `admin` / `pay` | 503 | **503** (pre-existing; no rule matches them) |
| Direct origin `:2053` | blocked | **blocked** |

No 522, no sandbox content on production, no TLS regression.

### 13.9 Gates

| Gate | Result |
|---|---|
| `make assure-sandbox-runtime` (no overrides) | **FAILS 4/4** — now *timeout*, not 503: Cloudflare holds the connection waiting on `:2053` past the 10s budget. Checker unmodified. |
| `make assure-sandbox-launch` | **HOLD — 18 failures across 9 capabilities**, `public released: 5/14` |
| `make security-check` | **PASSED** |
| `make check-live-fail-closed` | **PASS** — SEC-019 still registered |

**No capability status was changed.** Cloudflare routing is not E2E evidence.

### 13.10 Remaining blocker — one, not two

Open inbound **TCP 2053** at the provider perimeter. Nothing else is outstanding
for public routing: the moment packets arrive, the host allowlist admits
Cloudflare (proven in §5), the edge answers (proven in §12.4), and these
hostnames should return 200 with `environment=sandbox`.

Confirm with the same two signals: the 522 becomes 200, and the chain counters
begin to move — RETURN for Cloudflare sources, DROP for anything else.


---

## 14. Provider ingress verification after the manual firewall change — 2026-08-30

Run against `main` @ `6c8f99f6`, clean tree. No host firewall change, no
Cloudflare change, no weakening of any allowlist or checker.

### 14.1 Outcome

**`PROVIDER INGRESS: HOLD` → `PUBLIC SANDBOX ROUTING: HOLD`.** Inbound TCP 2053
still does not reach the host. Stage D closure stopped at criterion 1.

### 14.2 Counter evidence

Counters captured, zeroed, traffic generated, re-read:

| Source | Result | Chain counters |
|---|---|---|
| Workstation (ISP A) × 3 → `origin:2053` | refused/timeout | **0 pkts** |
| Independent VPS 82.165.165.97 (ISP B) → `origin:2053` | filtered | **0 pkts** |
| Cloudflare, via both public hostnames | **522** | **0 pkts** |
| DROP leg specifically | — | **0 pkts / 0 bytes** |

Controls from ISP B in the same run: `:443` **OPEN**, `:8443` **OPEN**,
`:2053` **filtered**.

### 14.3 Packet capture — the decisive read-only proof

A counter of zero could in principle mean packets arrive but are discarded
*before* `DOCKER-USER`. That was ruled out by observation rather than by adding a
rule (the brief forbids modifying the host firewall):

```
tcpdump -nn -i any 'tcp port 2053 and tcp[tcpflags] & tcp-syn != 0'
→ 0 packets captured
```

Zero SYNs on **any interface**, during simultaneous probes from two external
networks and live Cloudflare traffic. Nothing reaches the network interface at
all, so the filtering is upstream of the host and nothing on the host is
responsible.

Corroborating, from the read-only NAT counters — lifetime packets on each DNAT
rule:

| Origin port | DNAT packets | Meaning |
|---|---|---|
| 443 | 2 250 000 | real external traffic |
| 8443 | 122 000 | real external traffic |
| **2053** | **19** | only the Stage D network-namespace tests, all locally generated |

Ports that the provider permits show millions of packets. 2053 has never carried
a single external packet.

### 14.4 Host identity, to check against the provider console

The firewall change must apply to this machine and this interface:

| Item | Value |
|---|---|
| Public IPv4 | `217.160.9.248` (confirmed from the host's own outbound address) |
| Interface | `ens6`, `217.160.9.248/32` |
| MAC | `02:01:ed:76:0d:5c` |
| Hostname | `ubuntu` |

Recorded because "the rule was added" and "the rule is bound to the interface
that carries this traffic" are different statements, and only the second one
shows up in a packet capture.

### 14.5 Cloudflare path — unchanged and still correct

Both hostnames return **522**, exactly as after the Origin Rule was applied.
Cloudflare is reaching for `:2053` and cannot connect. The Origin Rule was not
touched, and 522 remains the correct expected symptom while the provider
filters.

### 14.6 Direct-origin negative test

`origin:2053` **blocked** from both external networks. The mandatory pair is not
yet satisfiable: the negative half holds, but the positive half (Cloudflare
hostname → Sandbox) cannot pass until packets arrive.

### 14.7 Production non-regression

`banzami.com` **200** · `www.banzami.com` **301** · `developers.banzami.com`
**200**, TLS verification clean on all three. No 522, no 503, no sandbox content.

### 14.8 Gates

| Gate | Result |
|---|---|
| `make assure-sandbox-runtime` (no overrides) | **FAILS 4/4** — timeout; Cloudflare holds the connection waiting on `:2053`. Checker unmodified. |
| `make assure-sandbox-launch` | **HOLD — 18 failures across 9 capabilities**, `public released: 5/14` (re-measured) |
| `make security-check` | **PASSED** |
| `make check-live-fail-closed` | **PASS** — SEC-019 registered |
| `TestMerchantSurface_*` | **PASS** — merchant P2P routes still absent |

No capability status changed.

### 14.9 What is still outstanding

One item, unchanged: **inbound TCP 2053 must actually reach `217.160.9.248`**.
Everything on both sides of it is proven — Cloudflare routes correctly, the host
allowlist admits Cloudflare, and the edge answers 200 with
`environment=sandbox` locally.

Two signals will confirm it, and they do not depend on each other: the public
522 becomes 200, and `tcpdump` on port 2053 stops reporting zero.
