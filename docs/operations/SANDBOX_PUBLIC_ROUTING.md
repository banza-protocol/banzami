# Sandbox Public Routing — Stage D

**Status: origin ingress restricted and proven; public routing NOT yet live.**
Two external actions remain, both outside this repository. See §6.

Companion to [SANDBOX_EDGE_RUNTIME.md](SANDBOX_EDGE_RUNTIME.md), which covers the
proxy itself. This document covers only how the public reaches it.

---

## 1. Intended perimeter

```
Internet → Cloudflare (proxied, WAF/DDoS) → origin :2053 → sandbox-edge → sandbox services
```

Never:

```
Internet → origin :2053
```

The origin must not be a second, unprotected front door. Every Banzami public
surface sits behind Cloudflare, and a directly reachable origin port silently
removes that for whoever finds it.

## 2. What the perimeter actually is on this host

`ufw` does **not** govern Docker-published ports here, so `ufw status` describes
only part of this machine. Docker's chains sit at the top of `FORWARD`
(`DOCKER-USER`, `DOCKER-FORWARD`, 22M packets) and the ufw forward chains below
them show **zero**. The live proof is port **8443**: reachable from the Internet,
present in no ufw rule at all.

This is not new. RA-005 measured it in July — *"Docker's iptables bypasses ufw for
published ports"* — and tracked restricting `:8443` to Cloudflare ranges as an
open recommendation. Stage D re-confirmed it independently.

Consequence: reading `ufw status` and concluding "only 22/80/443 are open" is
wrong on this host, and was wrong before Stage D touched anything.

## 3. The control that was implemented

`infra/security/origin-ingress-restrict.sh`, installed at
`/usr/local/sbin/banzami-origin-ingress-restrict.sh`, restricting **port 2053**
to Cloudflare's published ranges (15 IPv4, 7 IPv6) with a default `DROP`.

Two details in it are load-bearing, and both were found by testing rather than by
reading:

**It matches `--ctorigdstport`, not `--dport`.** `nat/PREROUTING` DNATs 2053 to
the container's `:443` before `filter/FORWARD` runs, so by `DOCKER-USER` the
destination port is 443 and the address is the container's. A `--dport 2053` rule
here matches nothing — it reads correctly in `iptables -S` and protects nothing.

**It matches `--ctdir ORIGINAL`.** `--ctorigdstport` is a property of the
*connection*, true of packets in both directions. Without the direction
qualifier the container's **replies** also traverse the chain, and their source is
the container rather than Cloudflare, so they hit the default `DROP`. Requests
arrive, responses vanish. This was measured: the allowlist `RETURN` matched 6
packets while `DROP` matched 8, the extra 8 being replies. The symptom would have
been a **Cloudflare 522 appearing the moment the port was opened**, above an
origin that looks perfectly healthy from the host — a Stage-B-style incident
arriving days later, attributed to the wrong change.

Persistence: `banzami-origin-ingress.service`, enabled, `WantedBy` both
`multi-user.target` and `docker.service`. There is no `iptables-persistent` on
this host, so without the unit the rules vanish on reboot and the port would
return **unrestricted** the moment the provider allows it.

## 4. How it was verified

Neither the host nor another container can test this: with Docker's userland
proxy, connections whose packets are delivered locally are handled by
`docker-proxy` on the `INPUT` path and never traverse `DOCKER-USER`. The first
attempt "passed" against a rule that had not been consulted at all.

Verification therefore used an isolated network namespace, which produces
genuinely forwarded packets:

| Leg | Source | Result |
|---|---|---|
| Path validity | netns → origin `:443` (unrestricted) | reachable — proves packets traverse DNAT + FORWARD |
| DROP | netns `10.199.99.2` → `:2053` | blocked, `DROP` counter 0 → 6 |
| ACCEPT | same source, temporarily allowlisted | **HTTP 200**, `environment=sandbox`, `DROP` counter stayed 0 |

The allowlist was restored immediately and re-verified: 15 ranges, test entry
gone, no namespace or interface left behind. The test source was an RFC1918
address inside a namespace created for the test — never Internet-routable.

## 5. TLS

Unchanged, and nothing new was issued. The origin presents the existing
Cloudflare Origin CA certificate with SANs `*.banzami.com` and `banzami.com`,
valid to 2041, which already covers both sandbox hostnames. Full (strict) is
preserved: Cloudflare validates its own Origin CA. No Flexible mode, no disabled
validation, no plaintext origin.

## 6. The two remaining external actions

Both are outside this repository and neither can be performed with the
credentials available here. They must be applied **together** — see §7.

### 6.1 Provider firewall — allow inbound 2053

Port 2053 is filtered **upstream of the host**, not by it. Originally verified
from two independent external networks: `:2053` filtered while `:443` and `:8443`
were open, with nothing on the host filtering either (`DOCKER-USER` was empty and
ufw does not apply). The host reaches its own `:2053` fine.

> **That original test no longer distinguishes the two layers.** Now that the host
> drops non-Cloudflare sources itself, an external probe is refused whether the
> provider is filtering or the host rule is doing its job — the observable result
> is identical. Telling them apart requires asking whether the packet *arrived*:
>
> ```bash
> # on the host
> iptables -Z BANZAMI-ORIGIN-2053
> # from anywhere external
> nc -z 217.160.9.248 2053
> # on the host again
> iptables -L BANZAMI-ORIGIN-2053 -n -v | tail -1
> ```
>
> A DROP counter still at **0** means nothing reached the host: the provider is
> filtering. A counter **above 0** means the provider now allows the port and the
> host restriction is what refused the connection — which is the intended
> steady state, and the check to run after the provider change to confirm §3.
>
> Measured 2026-08-30 after three external attempts: **0 packets**. The provider
> is still filtering.

The provider allowlist today is effectively `{22, 443, 8443}` — 8443 is present
because `banzami.com` already uses it as its origin port. **2053 must be added
the same way**, in the provider console.

### 6.2 Cloudflare — Origin Rule to port 2053

The mechanism is already proven in this account: `banzami.com` reaches origin
port **8443** by exactly this means, so this is configuration in an established
pattern, not a new one.

Required, in **Rules → Origin Rules**, for the banzami.com zone:

- **Expression:** hostname equals `sandbox-api.banzami.com` **or**
  `developer-api.banzami.com`
- **Action:** rewrite the **destination port** to `2053`
- Leave the origin address untouched — DNS already resolves both names to the
  correct origin, and both are already proxied.

Do **not** widen the match to the whole zone: `banzami.com`, `www` and
`developers` must keep their current origin behaviour.

**The credential in `/root/.cloudflare/credentials.ini` cannot do this and must
not be stretched to try.** It is a certbot DNS-challenge token
(`dns_cloudflare_api_token`): it verifies as active, but it lists **zero** zones
and is refused when reading its own definition. Origin Rules require a token
scoped to the banzami.com zone with permission to edit rules, or dashboard
access. Broadening the certbot token would give a long-lived automation
credential — one that exists to answer ACME challenges — the power to redirect
production traffic. That trade is not worth making silently, so it was not made.

## 7. Order of operations — apply as one change

The host-side restriction is already in place, which is the correct order: when
the provider opens 2053, the origin is Cloudflare-only from the first packet
rather than briefly world-open.

1. **(done)** restrict 2053 to Cloudflare at the host
2. open 2053 at the provider firewall
3. create the Cloudflare Origin Rule
4. verify immediately — §8

Between 2 and 3 the port is open at the provider but still Cloudflare-only at the
host, so there is no exposure window. Doing 3 before 2 is also safe: Cloudflare
would return 522 for the sandbox hostnames until the port opens, and production
is untouched either way.

## 8. Verification after the remaining steps

```bash
# from anywhere — the public hostnames, no overrides, no /etc/hosts entries
make assure-sandbox-runtime

# production must be unchanged
curl -s -o /dev/null -w '%{http_code}\n' https://banzami.com/
curl -s -o /dev/null -w '%{http_code}\n' https://developers.banzami.com/

# the origin must STILL be unreachable directly
nc -z 217.160.9.248 2053   # must fail
```

`assure-sandbox-runtime` currently **fails 4/4** against the public hostnames,
which is the correct answer today and the signal that Stage D is incomplete. It
must pass without overrides before public routing can be called done.

## 9. Rollback

```bash
# Cloudflare: delete the Origin Rule created in §6.2 — sandbox hostnames return
# to the website edge's 503 guard. Production is unaffected either way.

# Provider: remove 2053 from the firewall allowlist.

# Host (only if the ingress control itself must be withdrawn):
systemctl disable --now banzami-origin-ingress
iptables -D DOCKER-USER -p tcp -m conntrack --ctorigdstport 2053 --ctdir ORIGINAL \
  -j BANZAMI-ORIGIN-2053
iptables -F BANZAMI-ORIGIN-2053 && iptables -X BANZAMI-ORIGIN-2053
# (same three commands with ip6tables for the IPv6 mirror)
```

`DOCKER-USER` was **empty** before Stage D, so removing the chain and its hook
restores the previous state exactly. Nothing in the rollback touches ufw, the
website edge, DNS, or any production container.

**Withdrawing the host control while 2053 is open at the provider leaves the
origin globally reachable.** Roll back the provider rule first, or leave the
ingress restriction in place.

## 10. Known failure modes

| Symptom | Likely cause |
|---|---|
| 522 on sandbox hostnames, origin healthy from the host | the `--ctdir ORIGINAL` qualifier is missing, so replies are being dropped |
| Sandbox works, then breaks after a reboot | `banzami-origin-ingress.service` disabled — rules are not otherwise persisted |
| Sandbox breaks with no change on this side | Cloudflare added an IP range; refresh `/etc/banzami/cloudflare-ipv4.txt` and re-run the script |
| Rule looks right in `iptables -S`, protects nothing | matching `--dport 2053` instead of `--ctorigdstport` (post-DNAT the port is 443) |
| A local test "proves" the restriction works | local traffic goes through `docker-proxy` on `INPUT` and never reaches `DOCKER-USER` — test from a namespace or a genuinely remote source |

## 11. What this does not establish

Restricted, verified origin ingress is **not** public reachability, and neither is
capability evidence. The nine blocked capabilities still have no deployed E2E and
no harness covering them; `assure-sandbox-launch` remains **HOLD** and no
capability status changed in Stage D. Routing working is a precondition for
producing that evidence — never a substitute for it.
