# 06 — Email and authentication automation specification

Version: 1.0
Question it answers: **can authentication be fully autonomous?** — Yes, after one
owner ceremony.

---

## 1. Every authentication mechanism the Sandbox actually requires

Audited from the routers and handlers, not assumed.

| # | Surface | Credential | Email needed | Autonomous today |
|---|---|---|---|---|
| 1 | Consumer registration | handle + full name + PIN | **no** | ✅ |
| 2 | Consumer login | handle + PIN | **no** | ✅ |
| 3 | Consumer web session | BFF opaque cookie + CSRF | no | ✅ |
| 4 | Business login | `@handle` + PIN | no | ✅ |
| 5 | Business activation | activation token from application email | **yes, once** | ⚠️ §3 |
| 6 | Business PIN reset | operator-initiated, access email | **yes** | ⚠️ §3 |
| 7 | Console sign-in | email → OTP → session | **yes** | ✅ §2 |
| 8 | Console fixture session | internal mint, fixture domain | no | ✅ §2 |
| 9 | Developer project keys | `bz_sandbox_…` bearer | no | ✅ |
| 10 | Publishable keys | read-only client key | no | ✅ |
| 11 | Webhook signature | `banza-signature` HMAC | no | ✅ |
| 12 | BANZADMIN login | email + password | no | ✅ |
| 13 | BANZADMIN MFA | **TOTP** | no | ✅ §4 |
| 14 | BANZADMIN step-up | TOTP within 5 min | no | ✅ §4 |
| 15 | Operator invite / reset | email link | **yes** | owner-only, §4 |
| 16 | Consumer phone onboarding | SMS OTP | n/a | **no SMS layer exists** — §6 |

**Nothing on this list is a permanent human dependency.** Rows 5, 6 and 15 need
one owner ceremony each; everything else is already automatable.

## 2. Console (Developer) — two mechanisms, both already built

### 2a. Fixture session — no email at all

`accountidentity.MintFixtureSession` creates a verified identity and a real
session through the same store calls a verified sign-in uses. Constraints,
all enforced in code:

- only for `@banzami-e2e.test` (`IsFixtureEmail`);
- only when `FixturesEnabled`;
- mounted on an internal route (`/internal/**` → 404 publicly);
- audited as `session.fixture_minted`;
- **no OTP is created, read, derived or bypassed**.

This is the right default for volume. It is honest because the audit log shows
exactly what it is, and it never touches an authentication record.

### 2b. Real OTP through the provider's sent-message API

`tools/e2e/console/mint-session.mjs` already does this:
`POST /auth/request-otp` → read the message **Banzami itself sent**, via the
Resend API using the `resend_api_key` docker secret on the Sandbox host → type
the six digits into `POST /auth/verify-otp`.

Why this is the correct design and must be preserved:

> The OTP is stored **peppered and hashed**. Reading or writing
> `account_identity.identity_otp_codes` to get past a code is tampering with an
> authentication record to manufacture a pass. Nothing in the Lab may do it.

The credential never leaves the Sandbox host; the lookup runs there and returns
only the digits.

**Conclusion: the prompt's proposed `@e2e.banzami.com` catch-all mailbox
infrastructure is unnecessary.** The platform already has both a no-email path
and a genuine-email readback path. Recommendation: do not provision a new mail
domain.

### Quotas that bound this

| Limit | Value | Effect on the Lab |
|---|---|---|
| `FIXTURE_EMAIL_DAILY_BUDGET` | **40/day** (service default) | caps *OTP* sign-ins on fixture addresses; fixture-session minting is not affected |
| OTP resend cooldown | per-address | serialize sign-ins per actor |
| `CredentialPerMinute` | 15/min/IP | caps login attempts, incl. negatives |
| Resend account quota | provider-side | heavy days have exhausted it before |

Because `D01`/`D02` are **persistent**, a Full Run signs in twice, not fifty
times. The budget stops being a constraint the moment actors stop being
disposable.

## 3. Business — handle + PIN, with two email moments

Steady-state login needs no email: `POST /v1/merchant/auth/token` takes
`{handle, pin}`.

Two lifecycle moments involve email:

- **activation** — an approved application emails an activation token, then
  `POST /v1/merchant/activation/{validate,complete}` sets the PIN;
- **PIN reset** — `POST /admin/v1/businesses/{id}/app-pin-reset`, delivered to
  the Business access email.

For `B01`–`B03` these happen **once**, during the Phase B provisioning ceremony.
Afterwards the PIN lives in the secret backend and the actors log in forever
without email. The onboarding journeys that *do* need to exercise activation
(S03/S04) use a throwaway Business per run and read the mail through the same
Resend readback path as §2b — which is what `tools/e2e/business/candidatura-e2e.mjs`
already does.

## 4. BANZADMIN — TOTP is the key, and it is obtainable exactly once

`MFAService.BeginEnrolment` returns `(secret, provisioningURI)` in plaintext,
once, at enrolment. Verification is standard RFC 6238 TOTP.

Therefore:

```
owner ceremony (once):
    create operator A01 in BANZADMIN
    POST /admin/v1/auth/mfa/enrol        → capture `secret`
    POST /admin/v1/auth/mfa/enrol/confirm
    place `secret` in the secret backend as validation/a01/totp_seed
    capture recovery codes to the same backend
    → discard every other copy

thereafter, forever:
    the Lab computes TOTP(seed, now) for /auth/mfa/verify and /auth/step-up
    → no human, no inbox, no push
```

Step-up (`StepUpWindow = 5 minutes`) is the same computation, so the
highest-risk operator routes are reachable autonomously. Operator invite and
password-reset emails (row 15) are *not* automated and do not need to be —
`A01` exists permanently.

**This is the single genuine owner ceremony in the whole design.**

## 5. Secret reference model

The repository already has a secret backend: **docker secrets on the Sandbox
host**, plus `/root/.banzami/` for operator tooling.

```
/run/secrets/  bzm_proof_signing_key  core_internal_key  db_url_<service>
               developer_internal_key  jwt_secret  push_topic_key
               webhook_encryption_key  resend_api_key
               kyb_storage_{access_key_id,secret_access_key,endpoint}
/root/.banzami/operator_db_url
```

The Lab follows this convention. The prompt's `secret://banzami/validation/…`
URI scheme is adopted as a **logical reference written in the registries**,
resolving to a docker secret file:

```yaml
# quality/validation/actors.yaml  — references only, never values
  - id: A01
    credentials:
      password: secret://banzami/validation/a01/password   → /run/secrets/validation_a01_password
      totp_seed: secret://banzami/validation/a01/totp_seed → /run/secrets/validation_a01_totp_seed
```

New secrets required (Phase B):

```
validation_c01_pin … validation_c03_pin
validation_b01_pin … validation_b03_pin
validation_a01_password
validation_a01_totp_seed
validation_a01_recovery_codes
```

Developer sessions need no stored secret — they are minted per run.

Prohibited, without exception: a secret **value** in the repository, in the
application database, in a Run Manifest, in an Evidence Manifest, in a
screenshot, in a HAR, or in a log.

## 6. What is not automatable, and why that is fine

`POST /v1/consumer/onboarding/start` is a phone/SMS flow with **no SMS layer** —
the handler comment says so and `otp_plaintext_for_test` is a Sandbox-only
field. It is not the path the Consumer app uses (the app uses
`/v1/auth/register`). Classification: `NOT_IMPLEMENTED` at the external
boundary, with its Sandbox-only affordance covered by a negative journey
proving the field is refused outside Sandbox. It is **not** an automation
blocker, because it is not a shipped capability.

## 7. Verdict

| Question | Answer |
|---|---|
| Can every required credential be obtained without a human? | **Yes**, after the `A01` TOTP ceremony and the one-time Business activations |
| Does any flow require opening an inbox during a run? | **No** |
| Does anything tamper with an authentication record? | **No** — explicitly forbidden |
| Is a new mail domain required? | **No** — recommend not provisioning `e2e.banzami.com` |
| What must the owner do, once? | Enrol `A01` TOTP; activate `B01`–`B03`; place the secrets |
