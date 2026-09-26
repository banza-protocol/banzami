# BETA — DATA MAP

> The personal data actually processed by the Public Beta Sandbox, with the
> lawful basis, storage, processor, retention, deletion path and data-subject
> right for each. The Privacy Policy must not claim anything this map does not
> support. Legal bases are per Lei n.º 22/11; final basis wording is a
> counsel item.

Legend — LEGAL_BASIS: `contract` (execução de contrato / medidas pré-contratuais),
`legit` (interesse legítimo, e.g. abuse prevention), `legal` (obrigação legal),
`consent` (consentimento, only where used).

| DATA | SOURCE | PURPOSE | LEGAL_BASIS | STORAGE | PROCESSOR | RETENTION | DELETION_PATH | USER_RIGHT |
|------|--------|---------|-------------|---------|-----------|-----------|---------------|------------|
| Email, name, phone (account) | User at sign-up | Create/operate the Beta account | contract | PostgreSQL | IONOS | While account active + Beta window | Account deletion request → contact@ | access, rectification, deletion |
| @banza handle | User | Address payments in-product | contract | PostgreSQL | IONOS | While account active | With account | access, rectification |
| Session IDs, MFA/PIN metadata (never the PIN itself) | Generated at login | Authentication, session security | contract / legit | PostgreSQL / Redis | IONOS | Session lifetime; security metadata short-lived | Logout / account deletion | access |
| Business application: display name, requested handle, category, contact email (+ optional municipality/description) | Business applicant | Assess a Beta Sandbox business application | contract (pre-contract) | PostgreSQL | IONOS | Application lifecycle + Beta window | Deletion request → contact@ | access, rectification, deletion |
| Business KYB fields (NIF, legal representative, address) + documents | Applicant — **LIVE onboarding only** | KYB for real payment receipt | legal | PostgreSQL / R2 | IONOS / Cloudflare R2 | Per legal retention | Per legal retention | access (subject to legal limits) |
| Developer profile, projects, API-key metadata, webhook config | Developer | Operate the Developer Platform | contract | PostgreSQL | IONOS | While developer account active | Account deletion → contact@ | access, rectification, deletion |
| Sandbox transactions, payment references, links, test-payer data | Product use (test money) | Provide Sandbox functionality; may be reset | contract / legit | PostgreSQL | IONOS | May be reset/removed as part of testing | Sandbox reset / deletion | access |
| Contact form: name, email, subject, message | User (contact form) | Answer the enquiry | legit / contract | Delivered by email | Resend | As long as needed to handle the enquiry | Deletion request → contact@ | access, deletion |
| Beta tester registration: name, email, platform, apps | User (tester form) | Manage the Beta tester programme | consent / legit | PostgreSQL | IONOS | Duration of the Beta programme | Deletion request → contact@ | access, deletion |
| Technical: IP, user-agent, timestamps, security/rate-limit events, logs | Automatic | Security, abuse prevention, operation | legit / legal | Server logs / PostgreSQL / Redis | IONOS / Cloudflare | Short operational window | Not individually deletable (security logs) | access (subject to security limits) |
| Push token (FCM) | App/device | Deliver notifications | contract / consent | PostgreSQL | IONOS / Firebase | While notifications enabled | Disable notifications / delete account | access, deletion |
| `bz_app_present` cookie | Set by app presence | Route pay-links to the logged-in web app | legit (functional) | Browser cookie (non-secret) | — | Session/short | Clear cookies | n/a (no PII) |

## Deletion & access — reality check (§38)

- **The Privacy Policy must only claim deletion/access paths that exist.** Today
  the honest path is **a request to contact@banzami.com**, which the operator
  fulfils manually. Do not claim a self-service deletion UI unless/until one
  ships.
- **Sandbox data** may be reset or removed as part of testing (clean-slate
  tooling exists); the Terms and Privacy say so plainly.
- **PIN**: metadata only; the PIN itself is hashed/derived, never stored plain,
  never logged, never in analytics (verify in the activation/credential code).

## Sandbox full-flow rehearsal — synthetic KYB-like data (beta.4)

The Sandbox Business application (candidatura) rehearses the full onboarding
journey so it matches the future real-money flow: **business → representative →
documents → confirm**. This is **flow parity, not regulatory parity**.

| Field / artifact | Nature in Sandbox | Notes |
|---|---|---|
| Representative name, role, email, phone | **Test data** the applicant enters | Guidance is explicit: use test data only. A real value entered anyway is processed under the same Sandbox terms; not verified, not a KYB decision. |
| NIF (tax ID) | **Test data** the applicant enters | A form field, never a real registry lookup or verification. |
| Business registration document | **Canonical TEST fixture** (attached client-side) | Fixtures only — **no arbitrary/real file upload** in Sandbox; not stored in the real LIVE KYB document table (`merchant_application_documents`); recorded as synthetic evidence (structured log) only. |
| Representative ID document | **Canonical TEST fixture** (attached client-side) | Same as above. |

Separation from future **real KYB**: real business/representative identity, real
documents, real verification and any regulatory adjudication belong to the
real-money flow (LIVE policy, `business_requirements.go`), which is unavailable.
A Sandbox application is Sandbox-scoped and cannot become a real-money/KYB-approved
merchant by a flag change. Privacy §05 / Terms §10 (beta.4) state this; **counsel
sign-off on the expanded Sandbox collection is a pending FOLLOW_UP (BLOCKER-2)**.

## Open items for counsel

- **Sandbox full-flow collection (beta.4):** review the expanded Sandbox
  candidatura (representative identity + NIF as test fields; document fixtures) —
  confirm the "test data only" framing is a sufficient basis, and whether any
  inadvertently-real values entered by users need a specific handling/retention rule.
- Final legal-basis wording per Lei n.º 22/11 for each row.
- Retention periods (concrete durations) — currently "Beta window / while
  active"; counsel + ops to set concrete periods before Financial Live.
