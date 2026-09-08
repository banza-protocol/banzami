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
Cloudflare credential exists in this repository, on the deploy host, or in this
engineering session, and no browser is connected carrying the owner's session —
so this is a dashboard action and not a documentation choice.

**Cloudflare → banzami.com → DNS → edit the existing `_dmarc` TXT record.**

    from:  v=DMARC1; p=quarantine;
    to:    v=DMARC1; p=quarantine; rua=mailto:dmarc@banzami.com

Edit, do not replace. `p=quarantine` is the enforcement decision already taken
and nothing here changes it; `rua` adds reporting and no receiver treats a
message differently because of it. There is exactly one tag to add.

**`dmarc@banzami.com` must exist first** — a mailbox or an alias, either is
fine. It is deliberately not a person's address: aggregate reports are daily
XML from every receiver that sees mail claiming this domain, and pointing them
at a privileged human identity mixes machine output into the inbox that
administers the operator. Same-domain, so no `_report._dmarc` authorisation
record is needed.

Optionally, `fo=1` asks receivers to report when either SPF or DKIM fails rather
than only when both do. Useful, not required, and left out of the line above so
the change stays one tag.

`ruf=` is deliberately not proposed. Forensic reports carry message content,
which is a privacy exposure, and most receivers do not send them anyway.

## Verifying it afterwards

    dig +short TXT _dmarc.banzami.com

Expect exactly one TXT record, `v=DMARC1` first, `p=quarantine` still present,
`rua=mailto:dmarc@banzami.com` added. SPF and DKIM are untouched by this edit and
should be re-read to confirm that:

    dig +short TXT banzami.com | grep spf
    dig +short TXT resend._domainkey.banzami.com

**Configuration and receipt are separate facts.** DNS can be verified within
minutes. The first aggregate report arrives when a receiver decides to send one —
typically within a day, and outside anyone's control. Record it separately when
it happens; do not hold anything waiting for it.

## Not changed

`ruf=` (forensic reports) is deliberately omitted. Forensic reports carry
message content, which is a privacy exposure, and most receivers do not send
them.

## DOA, for contrast

`doadoa.app` publishes `v=DMARC1; p=none` with `~all` SPF (IONOS). That is a
weaker posture, and it is the correct one for that domain today: DOA is a
separate identity boundary and is not the operator domain. It is recorded here
only so the difference is deliberate rather than accidental.
