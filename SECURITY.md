# Security Policy

**Version:** 1.0

Banzami is the reference operator of the BANZA protocol. It handles money, so a
security report is welcome and will be read.

---

## Reporting a vulnerability

Email **security@banzami.com**.

Please include what you found, how to reproduce it, and what you think the
impact is. If you have a proof of concept, a minimal one is more useful than a
complete exploit.

Do not open a public GitHub issue for a vulnerability. An issue is public from
the moment it is filed, and this repository is the source of a payment system.

We will acknowledge your report. If it turns out to be a real issue we will tell
you what we are doing about it and when it is fixed. We do not currently run a
paid bug-bounty programme, and we will say so rather than leave you waiting.

---

## What is running

Only the **Sandbox** environment is live. It moves no real money: balances,
payments, settlements and payouts there are fictitious by construction, and the
Sandbox API keys (`bz_test_…`) cannot reach anything else.

**Financial LIVE is not released and is fail-closed.** There is no live rail to
attack today; a finding against the Sandbox is still worth reporting, because
the same code will carry real money later.

---

## What is in scope

- `developers.banzami.com` — the Developers Console
- `developer-api.banzami.com` — the Developer Platform API
- `sandbox-api.banzami.com` — the Sandbox payments API
- `pay.banzami.com` — the hosted payer surface
- `admin.banzami.com` — the operator console
- this repository's source

Out of scope: denial of service, findings that require physical access to a
device, social engineering of staff, and reports produced only by an automated
scanner with no demonstrated impact.

---

## Credentials in this repository

Every credential-shaped string committed here is a placeholder or a test
fixture, and the full reachable history has been audited for real ones. If you
find something that looks like a live credential, please report it as a
vulnerability rather than testing it — including if it turns out to be a
placeholder, because a placeholder that is indistinguishable from a real key is
itself worth fixing.

The `google-services.json` files carry Firebase client configuration. Those API
keys identify the mobile apps and are public by design; they are not secrets.

---

## What we ask

Please do not run tests that degrade the service for other people, and do not
access, modify or retain data that is not yours. If you reach data belonging to
someone else while investigating, stop and tell us what you saw.
