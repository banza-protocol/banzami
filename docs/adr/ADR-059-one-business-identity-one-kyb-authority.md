# ADR-059 — One Business identity, several onboarding surfaces, one KYB authority

Version: 1.0
Status: Accepted
Date: 2026-09-10
Extends: ADR-058 (Business application lifecycle)
Relates to: ADR-028 (application fee recipient), ADR-047 / ADR-055 (Project binding and seal), ADR-057 (Project financial readiness)

## Context

A Business reached Banzami through four doors that did not know about each other:

- the public candidature (`banzami.com/comerciantes/candidatura`), reviewed in BANZADMIN;
- the Developers Console's one-click "Configurar ambiente financeiro", which
  created a synthetic Business and wrote its KYB as approved with nobody
  reviewing anything;
- `POST /v1/compliance/merchants/verify`, where a Business ran the configured KYB
  provider on itself — the Sandbox's simulated provider approves any name with a
  six-character NIF;
- an operator toggle, `PATCH …/verified`, beside the KYB decision every gate reads.

Verification was answered in two places (`merchant_compliance.kyb_status` and
`merchants.verified`) that disagreed — @doa's Business was KYB APPROVED and
"unverified". A developer whose Project needed to receive was either sent to the
merchant form, disconnected from the Project, or given a self-approved Business.
A Project could not use a Business that already existed without onboarding it
again.

## Decision

### Authority hierarchy

| Record | Responsibility | Is it the legal Business? |
|---|---|---|
| `merchants` (Business Account) | the institution: name, status, class (ADR-028), pricing | **yes — the one identity** |
| `merchant_compliance.kyb_status` | **the one KYB authority** | decision about the identity |
| `merchants.verified` | projection of the KYB decision, kept by the database (0122) | no |
| `merchant_applications` (Business application / KYB case) | a request and its evidence; the review that produces a KYB decision | no |
| `handle_registry` | who owns each @banza (RESERVED by an application, ACTIVE by a Business) | no |
| wallets / wallet accounts | where the Business's money is | no |
| `developer.dev_project_sandbox_binding` | which Business a Project receives into (ADR-047, sealed per ADR-055) | no |
| `merchant_app_credentials` / sessions | who may sign in as the Business | no |

Only operator decisions write the KYB authority: approving or linking an
application, completing a KYB document review, or a BANZADMIN compliance action.
The self-verification route answers `403 KYB_DECIDED_BY_REVIEW`; the verified
toggle is retired (core `409 VERIFICATION_IS_THE_KYB_DECISION`); the one-click
Console owner answers `410 FINANCIAL_SETUP_BY_REVIEW`. The internal Sandbox
readiness route stays for operator test fixtures only.

### Two surfaces, one application

- **Standalone Business** — the public form. Origin `STANDALONE_BUSINESS`.
- **Developer Project** — the Console's Financial Setup (OWNER/ADMIN), through
  developer-api to the Gateway's internal route. Origin `DEVELOPER_PROJECT`, with
  the Project and the member who submitted. Same fields, documents, review.
  Approval provisions the Business and, as a recorded and retryable step, binds
  the Project to it.

The origin is context. Requirements come from one policy
(`business_requirements.go`: fields and documents, labelled with the capability
that needs them), which every surface renders and approval enforces.

### A Business that already exists

- **From a Project**: the Business consents from its own signed-in session — the
  Business App issues a single-use code (12 characters, 10 minutes, stored as a
  hash); the Project's owner enters it in the Console; the Project is bound to
  that Business. Nothing is re-verified or recreated; no handle, wallet or ledger
  history moves. A handle, id or email typed instead proves nothing, and nothing
  about a Business is disclosed before its code is redeemed.
- **From the public form**: the applicant declares the @handle is already their
  Business; the operator links the application to it (ADR-058).

### Application state machine

| State | Entered by | Next |
|---|---|---|
| SUBMITTED | applicant (either surface); idempotent per key | UNDER_REVIEW, INFORMATION_REQUIRED, APPROVED, REJECTED |
| UNDER_REVIEW | operator (start review) | INFORMATION_REQUIRED, APPROVED, REJECTED |
| INFORMATION_REQUIRED | operator, with a message (emailed) | SUBMITTED (applicant resubmits once requirements are met), REJECTED, CANCELLED (30 days unanswered) |
| APPROVED (PROVISIONED_NEW / LINKED_EXISTING) | operator; only when requirements are complete | — (a Project binding still pending is retried by approving again) |
| PROVISIONING_FAILED | approval that failed part-way | APPROVED (approve again resumes; nothing duplicated) |
| REJECTED | operator, with a reason (emailed) | — |
| CANCELLED | hold sweeper | — |

Every transition is serialised per application (advisory lock); every operator
action is audited in admin-api.

### @banza lifecycle

RESERVED (APPLICATION row) while the application is open — kept alive while
Banzami owes a decision → ACTIVE (the Business's) on approval → RELEASED when the
application closes or is abandoned. Only ACTIVE (and consumer) handles resolve as
payable. Submissions are capped at 30 a day per address.

### Classification stays separate

Approval creates class MERCHANT. APPLICATION / PLATFORM remain an operator
classification with typed confirmation and a reason (ADR-057). A Project whose
Business needs it sees `FEE_DESTINATION_TYPE_NOT_ALLOWED` — "requires operator
approval" — never a KYB problem.

### Business App sessions

A sign-in opens a session: 15-minute access token, rotating single-use refresh
token (30-day sign-in, reuse revokes the sign-in), renewal re-checks that the
Business is ACTIVE and owns its handle (0120).

## Consequences

- One answer to "is this Business verified?" everywhere: sign-in, the Business
  App, the Console, `/v1/financial-setup`, BANZADMIN.
- A developer never leaves the Console to onboard, and never onboards a Business
  twice.
- Existing Businesses keep their KYB decisions (`tools/assurance/business-reconciliation.sql`
  classifies them; none is asked to resubmit).
- Approval depends on document storage; without it applications stay in review.
- Automated harnesses that relied on the one-click owner use the internal
  fixture routes, which remain Sandbox-only.

## Alternatives considered

- **A Developer KYB separate from merchant KYB** — rejected: two authorities is the
  defect this closes.
- **Linking a Business to a Project by @handle or email** — rejected: it proves
  nothing about who is asking.
- **Keeping the one-click owner in the Sandbox** — rejected: a Sandbox that
  approves differently from LIVE tests nothing about LIVE.
