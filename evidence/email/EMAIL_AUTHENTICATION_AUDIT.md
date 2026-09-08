# Email authentication audit — banzami.com

Date: 2026-09-08 · Scope: the operator domain that carries BANZADMIN identity
activation, developer invitations and Sandbox notifications.

Email is not cosmetic here. `admin-bootstrap` creates an operator identity in
state `INVITED` and the account is unusable until an activation link is
delivered. If mail authentication degrades, operator onboarding stops.

## Observed

| Control | Value | Verdict |
|---|---|---|
| SPF | `v=spf1 mx:banzami.com a:mail.banzami.com a:mailphp.lws-hosting.com include:amazonses.com -all` | PASS — Resend sends via SES; `-all` hard-fails everything else |
| DKIM | `resend._domainkey.banzami.com` present, `p=` public key published | PASS |
| MX | `10 mail.banzami.com` → 193.203.239.42 (LWS) | PASS |
| DMARC policy | `v=DMARC1; p=quarantine;` | PASS — enforcing |
| DMARC reporting | no `rua=` | **FAIL** |

## The finding

The domain enforces a DMARC policy it cannot observe.

With no `rua=`, no receiver sends aggregate reports, so there is no signal for:

* a sending source that starts failing SPF or DKIM (a rotated Resend key, a
  changed SES include, an expired DKIM record),
* spoofing of the operator domain or of its subdomains — `pay.banzami.com` and
  `admin.banzami.com` are real, published hostnames,
* mail being quarantined at receivers, which looks identical, from inside, to
  mail that was never sent.

The failure mode this creates is specific: an operator invitation that is
silently quarantined is indistinguishable from a delivered one. That is the same
class of defect as the `Deliver`-swallows-the-error bug fixed earlier today —
the system reporting success it has not verified.

## Required change — human, provider-side

DNS for banzami.com is on Cloudflare (`cesar`/`deborah.ns.cloudflare.com`). No
Cloudflare credential is available to the engineering session, so this is a
dashboard action.

Record to update — Cloudflare → banzami.com → DNS:

    Type:  TXT
    Name:  _dmarc
    Value: v=DMARC1; p=quarantine; rua=mailto:security@banzami.com; sp=quarantine; fo=1

What each added term does, and why it is safe:

* `rua=` — where aggregate reports are sent. Purely observational; it does not
  change how any message is treated. Reports are daily XML, low volume at this
  scale. The address is same-domain, so no `_report._dmarc` authorisation record
  is needed. **`security@banzami.com` must be a real mailbox or an alias** — if
  it is not, point this at a mailbox that exists.
* `sp=quarantine` — states the subdomain policy explicitly instead of relying on
  inheritance. Behaviour is unchanged; the intent becomes readable.
* `fo=1` — report when either SPF or DKIM fails, rather than only when both do.

Deliverability risk: none. No term here changes enforcement; `p` is untouched.

## Not changed

`ruf=` (forensic reports) is deliberately omitted. Forensic reports carry
message content, which is a privacy exposure, and most receivers do not send
them.

## DOA, for contrast

`doadoa.app` publishes `v=DMARC1; p=none` with `~all` SPF (IONOS). That is a
weaker posture, and it is the correct one for that domain today: DOA is a
separate identity boundary and is not the operator domain. It is recorded here
only so the difference is deliberate rather than accidental.
