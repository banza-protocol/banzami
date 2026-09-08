# What still needs a human

Three things. Everything else in the Public Sandbox programme is done, and the
DOA work that was on this list has moved to where it belongs.

None of these asks anyone to send a secret to Claude, to chat, or into a file.

---

## 1 · Firebase key restrictions — Google Cloud Console

Possession of the published client key grants access to nothing: Firestore,
Realtime Database and Storage do not exist in the project, and Firebase Auth
answers `CONFIGURATION_NOT_FOUND`. That was tested, not assumed.

But the keys accept a request carrying no application identity at all — a bare
call registered an installation — so they are unrestricted, and that is the gap.

**Console → project `banzami` → APIs & Services → Credentials**, per key:

* Android → *Android apps*: `com.banzami.consumer` and `com.banzami.merchant`,
  each with its Play **App signing** SHA-1 — not only the upload key, or
  installs from Play break.
* iOS → *iOS apps*: the same two bundle identifiers.
* No web key exists, so no referrer restriction applies.
* API restrictions → only Firebase Installations, Cloud Messaging and
  Crashlytics. Do not enable Firestore, Storage or Identity Toolkit to make
  something pass — their absence is what makes the published key harmless.

App Check is **not applicable** and is recorded as that rather than as a pass: it
attests requests to Firestore, RTDB, Storage, Functions and Auth, none of which
this project uses.

Afterwards, re-run the probe that was accepted; it must answer `403`. Only then
do the four GitHub secret-scanning alerts close, and they close as *a client key
that is intentionally public, now restricted* — never as a false positive. The
command and the full inventory are in
`evidence/firebase/CLIENT_KEY_RESTRICTIONS.md`.

---

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

## 3 · Your BANZADMIN MFA enrolment

`fidel.monteiro@banzami.com` is `MFA_ENROLMENT_REQUIRED`: password set, no second
factor. That is a persisted state now, not an inference — the account cannot hold
a privileged session, and login returns an enrolment token rather than one.

The state machine was proven on the deployed console with a throwaway identity,
10/10, before this was asked of you.

At `admin.banzami.com`: sign in with your password, scan the QR with your
authenticator, type the current six digits, then **save the recovery codes** —
they are shown once, and the session is only issued after you acknowledge them.

Afterwards the persisted state will read `ACTIVE` with a confirmed factor, and
the audit trail will carry `LOGIN_PASSWORD_OK_MFA_PENDING → MFA_ENROLLED →
MFA_RECOVERY_CODES_ACKNOWLEDGED` against your real `admin_user_id` — verifiable
without anyone seeing a secret.

Do not send the password, the QR, the seed, the six digits or the recovery codes
to anyone, in any channel, including this one.

---

## What left this list, and where it went

**DOA.** The admin replacement and the real donation journey are not human-only.
An isolated read-only IMAP MCP is configured for `/Users/fm65/doa` with its own
store (`~/.claude-mcp-homes/doa`), pointing at `fidel.monteiro@doadoa.app` — so a
Claude session started **in that repository** reads its own mailbox and its own
login code. That this Banzami session cannot see that mailbox is the isolation
working, not a blocker.

The work is written out in `~/doa/docs/handoff/BANZAMI_SANDBOX_CLOSURE_HANDOFF.md`.
Open Claude Code in `/Users/fm65/doa` and point it at that file.

Also corrected there: the note recording a missing DOA email credential is
**wrong**. `RESEND_API_KEY` is installed and the sending path was exercised —
requesting a login code returns `POST /login → 200` and the app advances to the
six-digit step.
