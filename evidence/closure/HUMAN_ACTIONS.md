# What still needs a human

Two things, neither of them a release blocker. The third — the SUPER_ADMIN MFA
enrolment — is done, and is kept below with its evidence. Everything else in the
Public Sandbox programme is complete, and the DOA work that was on this list has
moved to where it belongs.

None of these asks anyone to send a secret to Claude, to chat, or into a file.

---

## 1 · Firebase key API restrictions — Google Cloud Console

**This is hardening, not a blocker.** An earlier revision of this document made
it one, and required an unidentified request to return `403` before the release
could close. That was wrong, and wrong in a specific way worth naming: it
optimised for what a scanner would say rather than for what an attacker could
reach.

A Firebase client key is **public by design**. It ships inside every APK and
IPA. "Someone without the app can use it" describes the format, not a defect.

What the key actually grants was probed, not assumed:

* Firestore, Realtime Database, Storage — **do not exist** in the project (`404`).
* Project administration — **structurally closed**: `firebase.googleapis.com`
  and `cloudresourcemanager.googleapis.com` answer *"API keys are not supported
  by this API"*, whatever the key's restrictions.
* Firebase Auth — enabled but unconfigured, so it creates nothing today.

So the published keys grant access to nothing right now.

**The one thing worth acting on**, and the reason this is on the list at all:
Identity Toolkit and Secure Token are *enabled and reachable* with both keys.
They are inert only because no sign-in provider is configured. Enable one
someday and the key already in every published APK can create accounts — with
nothing having leaked in the meantime.

### The action

Google Cloud Console → project `banzami` → **APIs & Services → Credentials**.
For **each** of the two keys (`a2626d564b36` Android, `83f573718a5b` iOS):
**Restrict key**, and select only

    Firebase Installations API
    Firebase Cloud Messaging API      (+ FCM Registration API, if listed)
    Firebase Crashlytics API

Nothing else. Those three are what `firebase_core`, `firebase_messaging` and
`firebase_crashlytics` call, and the app declares no other Firebase package.

This is safe on a working configuration — it removes only reach the app never
uses. Verify with `tests/security/firebase-key-restrictions.test.sh` (today it
fails 6/8, which is the honest current state), then confirm on device: both apps
still receive a push and still report a crash.

**Do not** set Android package / iOS bundle *Application* restrictions as part
of this. One key serves two applications each, so a per-app entry silently kills
the other app; the release SHA-1 is not obtainable from here; and on Play the
correct fingerprint is Play's re-signing certificate, not the upload key.
Reasoning and preconditions in `evidence/firebase/CLIENT_KEY_RESTRICTIONS.md`.

**The four GitHub alerts** do not depend on any of this. They are correct
detections of a public-by-construction credential class, not vulnerabilities —
resolve them as *public client configuration*, citing that same file. Rotation
is not indicated: it would replace one public value with another and require a
new mobile release.

## 2 · DMARC aggregate reporting — Cloudflare

`banzami.com` enforces `p=quarantine` and publishes no `rua=`, so the domain
imposes a policy it cannot observe. An operator invitation silently quarantined
is indistinguishable from one delivered.

This was re-checked before being asked of anyone. The Cloudflare MCP servers
configured on this machine are `docs`, `radar`, `dns-analytics`, `observability`
and `audit-logs` — documentation, internet insights, analytics, telemetry and
audit. **All read-only. None writes DNS.** The server that could
(`mcp.cloudflare.com/mcp`, Code Mode) is not configured here, and three of the
five are unauthenticated in a session that cannot run an OAuth flow. So there is
no supported write path, and this is genuinely a dashboard action.

**Cloudflare → banzami.com → DNS → edit the existing `_dmarc` TXT record:**

    from:  v=DMARC1; p=quarantine;
    to:    v=DMARC1; p=quarantine; rua=mailto:dmarc@banzami.com

Edit, do not replace. `p=quarantine` is the enforcement decision already taken,
and `rua` changes how no message is treated. One tag.

**First, `dmarc@banzami.com` must exist** — a mailbox or an alias, created
through the LWS panel. It is deliberately not a person's address: aggregate
reports are daily XML from every receiver that sees mail claiming this domain,
and they do not belong in the inbox that administers the operator. Do not point
`rua` at an address that does not receive.

Verify with `dig +short TXT _dmarc.banzami.com`: one record, `p=quarantine`
still present, `rua` added; then re-read SPF and DKIM to confirm the edit touched
neither. Receipt of the first report is a separate event, typically within a day
and outside anyone's control — do not hold anything waiting for it.

---

## 3 · Your BANZADMIN MFA enrolment — DONE 2026-09-08 20:55 UTC

Completed by the account holder on the deployed console. The audit trail, read
back from `admin_audit_log` against the real `admin_user_id`:

    20:50:40  ADMIN_INVITE_COMPLETE             password set by the operator
    20:51:00  LOGIN_PASSWORD_OK_MFA_PENDING     password accepted, SESSION REFUSED
    20:54:36  MFA_ENROLLED                      second factor confirmed
    20:54:59  MFA_RECOVERY_CODES_ACKNOWLEDGED
    20:55:08  session issued

Persisted state: `ACTIVE`, factor confirmed `20:54:35`, 10 recovery codes,
`failed_login_attempts = 0`, no lock, `token_version = 3`.

**The window between 20:51:00 and 20:54:36 is the evidence.** For three and a
half minutes the correct password was held and no privileged session existed.
That is the whole point of the lifecycle change, demonstrated on a real human
identity on the real deployed system — not on a fixture, not by SQL, and with no
secret ever leaving the operator: no password, seed, QR or recovery code was
seen by, sent to, or written down by anyone else.

### Getting there also surfaced two things worth recording

**The lockout is a trap for the only SUPER_ADMIN.** `MaxFailedLogins = 5` and the
counter is cleared *only* by a successful login or a completed reset — it never
decays. An account that once reaches 5 is permanently one typo away from a
15-minute lock. This account reached 9. Combined with the deliberate generic
`INVALID_CREDENTIALS` on lockout, the operator sees "wrong password" and cannot
tell why retrying keeps failing. **Open defect — not fixed.**

**There is no self-service password reset.** A reset can only be requested by an
authenticated SUPER_ADMIN (`POST /admin/v1/operators/{id}/password-reset`,
capability `CapOperatorReset`), so the sole SUPER_ADMIN locking themselves out
is unrecoverable from the product. `admin-bootstrap --resend-invite` exists
precisely to break that deadlock and is a shell command on the host — which is
correct as a break-glass, but means the recovery path for the most privileged
account is not in the product.

## What is NOT on this list, and why

**Identity separation (corrected 2026-09-09).** Three identities, never
conflated: `contact@doadoa.app` is the DOA **organisation** on the Banzami
Developers Platform (Workspace, Project, API key, webhooks);
`fidel.monteiro@doadoa.app` is the **human administrator** of the DOA
application; `fidel.monteiro@banzami.com` is the **human Banzami operator**.
Every mention of the Fidel address in this file and in
`PUBLIC_SANDBOX_CLOSURE.md` is the human administrator and is correct as
written — no Developers identity had ever been recorded, so nothing needed
replacing.

There is no read path to `contact@doadoa.app`: the isolated IMAP store holds
only the Fidel account, and it must not be substituted. Until an authorised
isolated path exists, the Developers OTP is a **human boundary**.

**DOA — the admin transition is done.** `fidel.monteiro@doadoa.app` already
holds admin authority and `fidelrmonteiro@gmail.com` no longer does. An earlier
revision of this document described a three-session promotion and demotion, and
said the middle step needed a Gmail-authenticated session. That is obsolete and
wrong now: there is nothing to promote, nothing to demote, no temporary second
admin, and **no Gmail account, session or OTP involved anywhere**.

**DOA — the rest is not human work either.** An isolated read-only IMAP MCP is
configured for `/Users/fm65/doa` with its own store
(`~/.claude-mcp-homes/doa`), pointing at `fidel.monteiro@doadoa.app`. A Claude
session started **in that repository** reads its own mailbox and its own login
code. That this Banzami session cannot see that mailbox is the isolation
working, not a blocker.

The programme is written out in
`~/doa/docs/handoff/BANZAMI_SANDBOX_CLOSURE_HANDOFF.md`: confirm the existing
admin authority, then the real public donation, the campaign wallet gross
credit, the signed webhook, the DOA confirmation, settlement under
`sandbox-reference`, and the ordinary-vs-DOA parity. Open Claude Code in
`/Users/fm65/doa` and point it at that file.

One thing was **not** verified from here and is stated as such rather than
assumed: the deployed DOA admin state. It is not exposed on any public surface —
correctly — and the two routes that reach it are both closed to this session:
SQL is forbidden, and an authenticated session needs an OTP only the DOA
mailbox holds. So confirming it is the first act of the DOA session, and the
handoff says to stop and report rather than repair if it does not hold.

Also corrected there: the note recording a missing DOA email credential is
**wrong**. `RESEND_API_KEY` is installed and the sending path was exercised —
requesting a login code returns `POST /login → 200` and the app advances to the
six-digit step.
