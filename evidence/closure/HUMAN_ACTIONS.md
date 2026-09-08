# What still needs a human

Three things. Everything else in the Public Sandbox programme is done, and the
DOA work that was on this list has moved to where it belongs.

None of these asks anyone to send a secret to Claude, to chat, or into a file.

---

## 1 · Firebase key restrictions — Google Cloud Console

Possession of the published client key grants access to nothing: Firestore,
Realtime Database and Storage do not exist in the project, and Firebase Auth
answers `CONFIGURATION_NOT_FOUND`. Tested, not assumed.

The gap is that the keys accept a request carrying no application identity at
all — a bare call registered an installation — so they are unrestricted.

### The mapping, explicitly

**There are two keys, not four.** GitHub raises four alerts because the same two
keys appear in several files. Values are never written here; `keyhash` is
`sha256(key)[0:12]`, enough to prove two files carry the same key and useless for
anything else.

| Key | keyhash | Platform | Identities the ONE key must serve | Alerts it accounts for |
|---|---|---|---|---|
| **A** | `a2626d564b36` | Android | `com.banzami.consumer` **and** `com.banzami.merchant` | #2, #3 |
| **B** | `83f573718a5b` | iOS | bundles `com.banzami.consumer` **and** `com.banzami.merchant` | #1, #4 |

**This is the part that breaks an app if it is got wrong.** Each key serves two
applications, so each restriction needs **two** entries. Restricting key A to one
package silently kills the other.

No web key exists anywhere in the repository, so no referrer restriction applies.

### Fingerprints

| | |
|---|---|
| **Debug** (from this machine's `~/.android/debug.keystore`, whose password is the published constant `android`) | SHA-1 `86:2D:43:62:4E:DF:3A:E5:6E:9C:20:35:76:6C:25:E9:9E:88:76:0D` |
| **Release** | not obtainable from here — `key.properties` is absent and no keystore is present |

For the release fingerprint, the distinction matters:

* **On Play** → Play Console → your app → *Setup → App integrity → App signing
  key certificate*. Use that SHA-1, **not** the upload key: using the upload key
  makes every Play install fail while local builds keep working.
* **Not on Play yet** → `keytool -list -v -keystore <release>.jks -alias <alias>`

One keystore signs both applications, so one release fingerprint covers both
packages. Add the debug fingerprint only if debug builds must keep working —
every fingerprint added widens the restriction.

### APIs to allow

Derived from the application's dependencies, which is authoritative: the app can
only call what its SDKs call. (Reading the enabled-service list with the API key
was inconclusive — those endpoints require OAuth, not a key — so this is derived,
and the console's *Enabled APIs* page is where to confirm the intersection.)

| Package in `pubspec.yaml` | API |
|---|---|
| `firebase_core` | Firebase Installations API |
| `firebase_messaging` | Firebase Cloud Messaging API |
| `firebase_crashlytics` | Firebase Crashlytics API |

Nothing else — not Remote Config, which the app does not import. And do **not**
enable Firestore, Storage, RTDB or Identity Toolkit: their absence is precisely
what makes the published key harmless today.

### The outcome to reach

    application restriction   configured, both identities per key
    API restriction           configured, the three above only
    the probe that succeeded  403
    GitHub alerts #1–#4       resolved only after that 403

App Check is **not applicable** and is recorded as that rather than as a pass: it
attests Firestore, RTDB, Storage, Functions and Auth, none of which this project
uses.

The re-test command is in `evidence/firebase/CLIENT_KEY_RESTRICTIONS.md`.

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

## What is NOT on this list, and why

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
