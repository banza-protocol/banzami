# Public Sandbox closure — evidence

HEAD `3bffc095` · 2026-09-08 · Financial LIVE: **NOT READY / FAIL-CLOSED** ·
no freeze, no tag.

## A. Repository and CI

Public. Hosted CI green on the exact HEAD: 10 jobs pass, one skipped — the
deploy job, gated by `vars.ENABLE_CI_DEPLOY` and deliberately off. The economic
gate is green on the same commit, including the fresh migration chain 0001 →
latest from an empty PostgreSQL.

The gate itself had a defect worth naming: it advertised "full or short SHA" and
`actions/checkout` resolves `ref` as a branch or tag, so a short SHA failed
before any of the job's own logic ran — a rejected input that read as broken
infrastructure. It now resolves the target locally and reports a bad SHA as a
bad input: *"is not a commit in this repository … Nothing was tested."*

## B. Dependency advisories

**0 critical · 0 high · 0 moderate · 0 low.** From 205 at first index.

Two of these were not what they looked like:

* the 21 critical `x/crypto` advisories are all in `golang.org/x/crypto/ssh`,
  which no Banzami service speaks — which is why `govulncheck` reported nothing
  while Dependabot reported twenty-one. Both tools were right; they answer
  different questions. The pins were raised anyway.
* twenty `postcss` alerts stayed open after every lockfile already held 8.5.28.
  They were not stale: the vulnerable copy is `next/node_modules/postcss@8.4.31`,
  nested inside Next. Reading the top-level version said the problem was solved
  when it was not. An npm override deduplicates it, written `$postcss` so it
  cannot drift from the direct dependency.

## C. Secret scanning

The continuous gate was weaker than the pre-publication audit, and the gap was
the credential class this operator issues: a real `bz_test_sk_` key in a tracked
file passed `make security-check`, because no rule knew the format and the
generic heuristic only fires near a keyword.

Rules added for every class this system has. More importantly, the exceptions
were matching the whole LINE, which made each one a licence to hide anything
beside it — a key appended after an excused resource id, or after an excused
local database URL, stopped being reported. They judge the value now.
`tests/security/gitleaks-mutations.test.sh` (17 assertions) runs inside
`security-check`, so a clean scan means the scanner can still see.

Final full-history scan: 104 findings, 11 more than the publication baseline.
Ten are inside the mutation suite itself — the file whose purpose is to hold
credential-shaped strings — and the eleventh is the RFC 6238 appendix-B vector.
**No new exposure.**

Four secret-scanning alerts concern the Firebase client keys. They are correct
detections of a credential class that is public by construction, not
vulnerabilities, and they gate nothing (section F).

## D. Next.js 14 → 15

Every remaining high advisory sat in `next@14.2.35` with no 14.x fix, so the
migration was the remediation. Five apps on 15.5.25 / React 19; four deployed.
`dashboard-frontend` is **explicitly NOT RELEASED**, which is a decision the
repository already carries rather than an ambiguity: `CAP-APP-002` in
`quality/operator-assurance-manifest.yaml` reads `launch_scope: excluded`,
`surface: none`, `environments: sandbox false / live false`, `status: blocked`.
`dashboard.banzami.com`, `business.banzami.com` and `merchant.banzami.com` are
all NXDOMAIN, and `./deploy.sh dashboard-frontend` fails closed.

Closing that out found documentation still claiming it: `docs/sandbox/README.md`
and three DOA integration guides sent readers to
`sandbox-dashboard.banzami.com`, and the architecture diagram drew
`dashboard.banzami.com` as routed. All corrected to the Developer Console, which
is where API keys are actually issued.

Details, including what the migration did NOT cover, in
`evidence/migration/NEXT15_MIGRATION.md`.

The migration surfaced defects the old build had never enforced: the webhooks tab
called `.map` on `{data: […]}` and threw before rendering; `listWebhookEvents`
sent `limit=[object Object]` to a route that answers 400 to anything but an
integer, so the events list never loaded; two pages rendered an empty state with
no text and a badge with no label.

It also surfaced why the SDK could not be bundled for a browser at all —
`webhooks.ts` imported `node:crypto` at module scope and `BanzamiClient`
constructs a `WebhooksClient`, so every consumer dragged it in. Fixed through a
`#node-crypto` subpath with a browser condition, declared in the dual-package
markers where a resolver actually looks.

## E. Hosted checkout, deployed

| | |
|---|---|
| ACTIVE link | 200, amount and description exact |
| USED link | "Pagamento recebido" — not a payable form |
| cross-checkout leakage | the other link's slug and description appear 0 times |
| unknown slug | 404, not an error page |
| cache | `private, no-cache, no-store, must-revalidate`; `cf-cache-status: DYNAMIC`; a different CSP nonce per request |

Not covered: an expired link — no link in the Sandbox currently carries an
expiry.

## A1. Deployment provenance

`source HEAD = CI SHA = deployed runtime`, for every code-bearing released
service, at `5ae92e20483e`:

    admin-api · api-gateway-staging · core-api-staging · public-api-staging
    developer-api · pay-frontend · admin-frontend

`website-frontend` publishes as `:latest` and carries the commit where the
convention puts it — `org.opencontainers.image.revision`, matching the same
full SHA.

`dashboard-frontend` is absent from that list because it is not released
(section D).

## A2. Privileged-identity lifecycle

`admin_users.status` answered "has this person set a password?" and was read as
if it answered "is this person fully enrolled?". So the first SUPER_ADMIN sat at
ACTIVE with a password and no factor, and the only thing between that and a
privileged session was a branch inside the login handler.

That branch is correct, and it is not the same as the state saying so. A status
whose meaning depends on a row in another table is one a reader will get wrong —
an export, a support query, a dashboard counting "active admins", or the next
authorisation branch someone writes.

    INVITED                   → identity exists, no credential
    MFA_ENROLMENT_REQUIRED    → password set, no confirmed factor
    MFA_RECOVERY_ACK_REQUIRED → factor confirmed, codes not acknowledged
    ACTIVE                    → password + factor + codes + acknowledgement
    SUSPENDED                 → disabled

Transitions are guarded on the FROM state, so a replay is a no-op rather than a
route to ACTIVE the lifecycle does not have — proven by pointing acknowledgement
at the wrong FROM state, which makes the suite report "acknowledging without a
confirmed factor reached ACTIVE".

One guard had to widen rather than follow: `CountActiveSuperAdmins` counted
`status='ACTIVE'`, and splitting the lifecycle would have silently weakened it —
an organisation whose only SUPER_ADMIN is mid-enrolment would count zero, and the
guard would then permit demoting or suspending them. It counts everyone not
SUSPENDED.

Migration 0110 backfills every operator ACTIVE without a confirmed factor. It
grants and removes nothing; it makes the row say what was already true. Applied
through the gated blueprint path; the real operator moved
`ACTIVE → MFA_ENROLMENT_REQUIRED`, and the suspended probe identities were left
untouched, which is the backfill's `WHERE` clause working.

**The fix was incomplete when first written, and using it is what showed that.**
Creating a throwaway SUPER_ADMIN against the deployed console still returned
`status=ACTIVE`: the invite flow had been corrected and the bootstrap's
`--with-password` path had not — the one route that creates a privileged
identity with a credential already attached, and the route the first operator on
a new deployment takes. Fixed, with a test that reads the SQL and fails on any
`INSERT INTO admin_users` naming `'ACTIVE'`.

The tool then reported a state it was no longer creating: it printed
`status=ACTIVE` as fixed text. Both output paths read the state back from the row
now, and a test fails on any hardcoded lifecycle state in the output.

Proven on the deployed console, 10/10: password accepted → no session, told to
enrol; the enrolment token refused as a session; the factor confirms and still
issues no session; acknowledgement is the only thing that produces one. The
persisted state ends `ACTIVE` with a confirmed factor, audited in order —
`LOGIN_PASSWORD_OK_MFA_PENDING → MFA_ENROLLED →
MFA_RECOVERY_CODES_ACKNOWLEDGED`.

**Then the real one, on the real account, 2026-09-08 20:55 UTC.** The account
holder enrolled `fidel.monteiro@banzami.com` on the deployed console:

    20:50:40  ADMIN_INVITE_COMPLETE             password set by the operator
    20:51:00  LOGIN_PASSWORD_OK_MFA_PENDING     password accepted, SESSION REFUSED
    20:54:36  MFA_ENROLLED                      second factor confirmed
    20:54:59  MFA_RECOVERY_CODES_ACKNOWLEDGED
    20:55:08  session issued

Ending `ACTIVE`, factor confirmed, 10 recovery codes, `token_version = 3`. For
the three and a half minutes between the password being accepted and the factor
being confirmed, no privileged session existed — which is the property the whole
change was for, now demonstrated on a human identity rather than a fixture. No
password, seed, QR or recovery code was seen by anyone but the account holder.

Two operability defects surfaced while getting there, both recorded in
`evidence/closure/HUMAN_ACTIONS.md` and **neither fixed**: the failed-login
counter never decays, so an account that once reaches `MaxFailedLogins = 5` stays
permanently one typo from a 15-minute lock; and there is no self-service password
reset, so the sole SUPER_ADMIN locking themselves out is unrecoverable from
inside the product — `admin-bootstrap --resend-invite` on the host is the only
way back.

## A3. Final history re-scan, on the final HEAD

The strong rule set — default gitleaks plus every credential class this system
has, with no repository allowlist — over all 2 565 reachable commits: **116
findings, every one classified, none a live credential.**

| Class | Verdict |
|---|---|
| `tests/security/gitleaks-mutations.test.sh` | by construction — the file exists to hold credential-shaped strings. The literals have since moved to runtime assembly, so they are in history and not at HEAD |
| `infra/blueprint/validators/fixtures/bad-pem.sample` | a labelled fake, and the fixture a validator exists to reject |
| `tools/e2e/dev-console/dev-key-gateway-e2e.mjs` | forged keys asserted to return 401 |
| `google-services.json` × 2 | Firebase client keys, public by design (section F) |
| `docs/APP_STORE_REVIEW_NOTES.md` | the legacy operator key — **dead**, 401 on the Sandbox rail; removed from HEAD in this programme |
| `apps/website/.../api-keys/page.tsx` | a Stripe-shaped placeholder in a UI mock — 26 characters where a real Stripe key is ~107. Not a key, and gone from HEAD since 2026-07-03 |
| postgres URLs | the two local development literals, paired in the same file |
| `generic-api-key` | resource UUIDs, idempotency keys and test hex |

The last two are worth one more line: the standing gate at HEAD was pointed at
that Stripe-shaped placeholder and reported `stripe-access-token`. The control
that would catch a real one is working.

## F. Firebase — verified, not dismissed

One project (`banzami`), five config files, two Android packages and two iOS
bundles. The app uses `firebase_core`, `firebase_messaging` and
`firebase_crashlytics` — no Firestore, no Realtime Database, no Storage, no
Firebase Auth.

Negative test with the public client key, unauthenticated:

| Probe | Result |
|---|---|
| Firestore documents | 404 — no `(default)` database exists (a locked one answers 403) |
| Realtime Database, two regions | 404 — no instance |
| Storage bucket listing | 404 |
| Identity Toolkit sign-in | 400 `CONFIGURATION_NOT_FOUND` — Auth is not configured |

**Possession of the key grants access to nothing, because none of those products
exist in the project.**

The same probes were first read as proving the keys **UNRESTRICTED** and the
finding recorded as FAIL: a bare call to `firebaseinstallations` carrying no
`X-Android-Package` / `X-Android-Cert` is accepted and registers an installation.

The probe stands; the verdict drawn from it does not. It measures the
*application* restriction, and a Firebase client key ships in every APK and IPA
by design — "usable without the app" describes the format, not a defect. Making
that call return 403 was a scanner outcome, not a reduction in reach, and it was
wrong to gate a release on it.

What bounds reach is the **API** restriction, probed directly by calling APIs the
app does not use and reading which layer answers:

| API called with either key | Answer | Meaning |
|---|---|---|
| Identity Toolkit `accounts:signUp` | 400 `CONFIGURATION_NOT_FOUND` | the service answered — key admitted |
| Secure Token `v1/token` | 400 `MISSING_GRANT_TYPE` | the service answered — key admitted |
| Remote Config `:fetch` | 400 `INVALID_ARGUMENT` | the service answered — key admitted |
| `firebase.googleapis.com`, `cloudresourcemanager` | 401 *"API keys are not supported by this API"* | administration is closed structurally |

A restricted key is refused as `403 API_KEY_SERVICE_BLOCKED` *before* the service
sees the request. None was. **Neither key carries an API restriction**, and three
unused APIs are reachable.

Today that is inert — no Auth provider is configured, and the data products do
not exist. The durable point is that Identity Toolkit and Secure Token are
*enabled*: whoever enables a sign-in provider later hands account creation to a
key that is already in every published APK, with nothing having leaked.

So: **not a release blocker; an API restriction is warranted and is ordinary
hardening.** `tests/security/firebase-key-restrictions.test.sh` asserts it and
fails 6/8 today, which is the honest state. Application restrictions are
deliberately deferred — one key serves two apps each, and a per-app entry kills
the other. Detail in `evidence/firebase/CLIENT_KEY_RESTRICTIONS.md`.

App Check: not applicable to this client set (it protects Firestore, RTDB,
Storage, Functions and Auth — none in use). Stated from the dependency list, not
from provider-side enforcement, which needs the same console.

## G. Email

Reported separately, as they are separate facts:

| Control | State |
|---|---|
| SPF | PASS — `include:amazonses.com`, `-all` |
| DKIM | PASS — `resend._domainkey` published |
| DMARC enforcement | PASS — `p=quarantine` |
| DMARC aggregate reporting | **FAIL** — no `rua=` |
| Sender-side delivery | PASS — an operator invite returns `ok: true`, is audited `admin.operator_invited`, and logs no error (the failure mode where `Deliver` swallowed the error was fixed earlier) |
| Banzami mailbox receipt | **not verified** — no IMAP access from this session |
| DOA mailbox receipt | **not verified** — same |

The `rua=` record and the exact Cloudflare action are in
`evidence/email/EMAIL_AUTHENTICATION_AUDIT.md`. No Cloudflare credential exists
in the repository, on the deploy host, or in this session, and no browser is
connected with the owner's session — so it is a dashboard action, not a
documentation choice.

## H. BANZADMIN

Every route answers on a real MFA-backed session: operators, merchants, pricing
rules, merchant applications, compliance cases, risk audit log, operator audit
log, wallet payments.

`merchant-applications` had been 502 for every environment parameter with both
services reporting healthy. The cause was two configuration omissions on the same
credential: admin-api's FIRST create exports `INTERNAL_API_KEY` and
`STAGING_INTERNAL_API_KEY`, every REDEPLOY rebuilds the entrypoint from a shared
list, and that list did not carry them. The Gateway then ran `InternalAuth("")`,
which answers 503 to its entire internal route group. This is the second time
that exact shape has happened here, so the fix is not only the two names:
`tests/ops/sandbox-secret-preservation.test.sh` now compares what first-create
exports against what redeploy carries, and fails on any difference.

A separate defect in the same area: an unqualified request routed at the live
stack unconditionally, which is not deployed while the platform is SANDBOX. It
follows the platform's own mode now, failing safe to SANDBOX.

## I. MFA and recovery — 29 assertions, deployed

Login never returns a session while a factor is pending — it returns an
enrolment or challenge token whose purpose the middleware refuses. Proven end to
end against `admin.banzami.com`: enrolment, a wrong code refused, confirmation
returning codes but no session, acknowledgement issuing the session, a TOTP that
cannot be replayed, a recovery code usable exactly once, regeneration requiring
password **and** current factor, replacement returning an enrolment token and
never a session, and a login mid-replacement still refusing a password-only
session.

One more thing was written down rather than left to coincidence: that whole
guarantee sat inside `if h.mfa != nil`, and below it a password alone issued a
full session. Unreachable today only because `h.mfa` is nil exactly when there is
no database. A privileged operator is now refused by any build that cannot verify
a second factor — 503, audited, never a token.

## J. RBAC — 12 assertions, deployed

A READ_ONLY operator must enrol MFA like anyone else, can read operators,
merchants, pricing rules and the audit trail, and is refused creating an
operator, suspending one and creating a pricing rule — 403 each — on routes the
SUPER_ADMIN session reads 200.

## K. Audit

The operator trail was written and never readable: every action recorded since
the table existed, no route returning any of it, so "who changed this pricing
rule" was a psql session on the host. `GET /admin/v1/audit-log` now exposes it,
gated by the existing `audit.view` capability, keyset-paginated because an offset
walk over an append-only log skips rows as it reads.

Unconfigured it answers 503, not 200 with an empty list — an audit endpoint that
looks empty when unwired answers "nothing happened" to the person who came to
check whether it did.

## L. Developer platform — 42/42, deployed

The full external journey against the public Gateway: project, binding, key,
identity, payment session, all three interfaces, idempotent replay, cross-project
isolation refused, scope refusal, three validation refusals, the payer surface
without auth, settlement, a signed webhook verified independently over the raw
bytes, replay producing no second business event, and a revoked key rejected
immediately.

## M. Economics — 24/24 and 45/45, deployed

Settlement of 100 000 on `sandbox-reference`: rate 200 bps, fee 2 000, net
98 000, beneficiary credited the net, source retaining only the fee. Two
different owners on the same plan: **PARITY_FEE_DIFFERENTIAL 0,
PARITY_NET_DIFFERENTIAL 0.** The ledger is exactly as sound after as before.

The broader model holds: a settlement that resolves no rule refuses 409
`PRICING_NOT_CONFIGURED` and moves nothing; two applicable rules refuse
`PRICING_CONFIGURATION_ERROR` rather than rank.

## N. Campaign segregation — 10/10, deployed

Each campaign account is credited the full amount, gross, and only that account
moves. This is the incoming half of the DOA model: pricing is resolved one step
later, at settlement, so a donation is never charged on the way in.

## O. What is NOT proven

* **A real DOA donation end to end.** The blocker was previously recorded as a
  missing DOA email credential. That is no longer true and the record was wrong
  to leave generic: `RESEND_API_KEY` is installed in the DOA production project,
  and the sending path was exercised directly — requesting a login code for
  `fidel.monteiro@doadoa.app` returns `POST /login → 200` and the app advances to
  "Enviámos um código de 6 dígitos … Expira em 10 minutos". DOA can send.
  What remains is the donor half itself, which needs someone to read a code out
  of a mailbox this session cannot open.
* **Mailbox receipt** of any message (section G).
* **Firebase API restriction** — an ordinary console change, not a blocker (section F).
* **DMARC aggregate reporting** (section G).
* **`dashboard-frontend` deployment** — refused by the service authority matrix.

## P. Financial LIVE

NOT READY / FAIL-CLOSED throughout. `api.banzami.com` answers 503; the live
Gateway host does not resolve on the Sandbox network; `core-api`, `api-gateway`
and `public-api` remain denied by the deploy authority matrix. Nothing in this
programme created or used LIVE financial authority.

## Q. Test identities

Three operator identities were created for the proofs above and retired: they
could not be deleted, because `admin_audit_log` holds a foreign key to every
operator that ever acted and the trail is append-only. That constraint is
correct. They are SUSPENDED with their passwords cleared, their token versions
bumped and their factors removed; both refuse authentication with 401. The record
of what they did remains.
