# The actions that need a human, and exactly what each one is

Everything else in the Public Sandbox programme is done. These need either a
provider console this session cannot authenticate to, or a private act that
should not pass through anyone else — including me.

None of them asks anyone to send a secret to Claude, to chat, or into a file.

---

## 1 · DMARC aggregate reporting — Cloudflare

`banzami.com` enforces `p=quarantine` and publishes no `rua=`, so the domain
imposes a policy it cannot observe: no receiver reports failures, and an operator
invitation silently quarantined is indistinguishable from one delivered.

**Cloudflare → banzami.com → DNS → edit the existing `_dmarc` TXT record:**

    from:  v=DMARC1; p=quarantine;
    to:    v=DMARC1; p=quarantine; rua=mailto:dmarc@banzami.com

Edit, do not replace — `p=quarantine` is the enforcement decision already taken,
and `rua` changes how no message is treated. One tag.

`dmarc@banzami.com` must exist first: a mailbox or an alias, either works. It is
deliberately not a person's address — aggregate reports are daily XML from every
receiver that sees mail claiming this domain, and they do not belong in the inbox
that administers the operator.

Verify: `dig +short TXT _dmarc.banzami.com` — one record, `p=quarantine` still
there, `rua` added. Receipt of the first report is a separate event, typically
within a day and outside anyone's control; do not hold anything waiting for it.

Detail: `evidence/email/EMAIL_AUTHENTICATION_AUDIT.md`.

---

## 2 · Firebase key restrictions — Google Cloud Console

Possession of the published client key grants access to nothing: Firestore,
Realtime Database and Storage do not exist in the project, and Firebase Auth
answers `CONFIGURATION_NOT_FOUND`. That was tested, not assumed.

But the keys accept a request carrying no application identity at all — a bare
call registered an installation — so they are unrestricted, and that is the gap.

**Console → project `banzami` → APIs & Services → Credentials**, per key:

* Android → *Android apps*: `com.banzami.consumer` and `com.banzami.merchant`,
  each with its Play **App signing** SHA-1 (not only the upload key, or installs
  from Play break).
* iOS → *iOS apps*: the same two bundle identifiers.
* API restrictions → only Firebase Installations, Cloud Messaging and
  Crashlytics. Do not enable Firestore, Storage or Identity Toolkit to make
  something pass — their absence is what makes the published key harmless.

App Check is **not applicable** here and is recorded as that, not as a pass: it
attests requests to Firestore, RTDB, Storage, Functions and Auth, none of which
this project uses.

The re-test command that must return `403`, and the four GitHub alerts that stay
open until it does: `evidence/firebase/CLIENT_KEY_RESTRICTIONS.md`.

---

## 3 · DOA — make `fidel.monteiro@doadoa.app` the only admin

`fidelrmonteiro@gmail.com` is currently the only user and the only admin, and the
application refuses to remove it: `adminDemoteAdmin` returns `last_admin` when
the demotion would empty the admin team, and `cannot_demote_self` when an admin
tries to demote itself. Both refusals are correct. So this is a **replacement**,
and the order matters.

DOA's email sending works — verified, not assumed: requesting a login code for
`fidel.monteiro@doadoa.app` returns `POST /login → 200` and the app advances to
the six-digit step. The credential blocker recorded previously is resolved.

1. **Sign in once as `fidel.monteiro@doadoa.app`** at `admin.doadoa.app`. The
   code arrives by email. The login creates the account; the console will bounce
   you out because it is not an admin yet, which is expected — the profile is
   what matters.
2. **Sign in as `fidelrmonteiro@gmail.com`** → *Utilizadores* → the new account
   → **Tornar admin**. You will be asked to type the email to confirm.
3. **Sign in as `fidel.monteiro@doadoa.app`** → *Utilizadores* →
   `fidelrmonteiro@gmail.com` → remove admin. This step must be done from the new
   identity: an admin cannot demote itself.

After step 3 the gmail account remains an ordinary user with no admin rights. Ban
or delete it separately if you want it gone entirely.

This session cannot do any of it: the DOA mailbox is deliberately not reachable
from here. `imap_list_accounts` returns exactly one account,
`fidel.monteiro@banzami.com` — the isolation between the two identities holding.

---

## 4 · BANZADMIN — your MFA enrolment

`fidel.monteiro@banzami.com` is `MFA_ENROLMENT_REQUIRED`: password set, no second
factor. That is a real persisted state now, not an inference — the account cannot
hold a privileged session, and login returns an enrolment token rather than one.

At `admin.banzami.com`: sign in with your password, scan the QR with your
authenticator, type the current six digits, then **save the recovery codes** —
they are shown once, and the session is only issued after you acknowledge them.

The state then walks `MFA_ENROLMENT_REQUIRED → MFA_RECOVERY_ACK_REQUIRED →
ACTIVE`, which is verifiable afterwards without anyone seeing a secret.

Do not send the password, the QR, the seed, the six digits or the recovery codes
to anyone, in any channel, including this one.

---

## 5 · The real DOA donation

Once you hold a DOA session, the last unproven thing is the donor half: a real
donation on `www.doadoa.app`, through the email OTP, landing in a campaign wallet
with a signed webhook back to DOA.

The economics either side of it are already proven on the deployed Sandbox — a
campaign account is credited gross and only that one (10/10), and a settlement of
100 000 at 200 bps yields fee 2 000 and net 98 000 with a parity differential of
zero (24/24). What is missing is the journey through the public site, which needs
a code read out of a mailbox this session cannot open.
