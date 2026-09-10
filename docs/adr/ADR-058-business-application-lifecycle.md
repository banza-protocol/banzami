# ADR-058 — A Business application is reviewed, and a Business that already exists is linked, never recreated

Version: 1.0
Status: Accepted
Date: 2026-09-10
Relates to: ADR-025 (environment routing), ADR-028 (application Business Account), ADR-055 (Project binding seal), ADR-057 (Project financial readiness)

## Context

`banzami.com/comerciantes/candidatura` is the public way into Banzami Business.
Four things about how an application became a Business made its outcome
untrustworthy:

1. **Nobody decided.** In the Sandbox an application was approved on submit,
   before a single document had been uploaded. 29 Sandbox Businesses exist with
   no reviewed evidence; the approval that provisioned them was nobody's.
2. **Only one outcome.** Approval always meant "provision a new Business
   Account" — merchant, wallet, handle, login. A Business provisioned some other
   way first (an operator setup, the financial owner of a Developer Project,
   the pre-launch consolidation of `@doa`) had no way into the lifecycle: its
   handle was taken, so the form refused it; and forcing an approval would have
   created a second owner beside the first.
3. **A login could outlive its handle.** `merchant_app_credentials` keyed the
   login by handle but pointed at a merchant id. When `@doa` was consolidated
   onto its canonical Business, the login stayed on the retired merchant: the
   Business App showed `@doa` and read a wallet that was not `@doa`'s.
4. **The applicant chose the classification.** The form sent a
   `business_account_type`; `APPLICATION` or `PLATFORM` from a public form would
   have been an auto-promotion to a class that receives operator-governed fees.

## Decision

### One state machine

```
SUBMITTED ──start review──▶ UNDER_REVIEW ──approve──▶ APPROVED (resolution PROVISIONED_NEW)
    │                            │        ──link───▶ APPROVED (resolution LINKED_EXISTING)
    │                            └──reject──▶ REJECTED
    └──────────── approve/link/reject are also valid from SUBMITTED
approve that fails part-way ─▶ PROVISIONING_FAILED ──approve (reprocess)──▶ APPROVED
```

- Every transition is an operator action in BANZADMIN (reason where it
  changes institutional truth, audit row in `admin-api`). Nothing is approved on
  submit — in the Sandbox too.
- Every transition runs under one advisory lock per application
  (`hashtextextended('merchant_application:'||id, 0)`), so two operators (or
  one double click) cannot provision twice. An approval pressed again returns
  `already_approved: true` and does nothing — no second email, no second audit.
- `APPROVED` always names its `resolution` (migration 0118, constraint
  `merchant_applications_approved_has_resolution`).

### Approval provisions a new Business — and only from its own hold

Approval requires the two required documents (`BUSINESS_REGISTRATION`,
`REPRESENTATIVE_ID`) in `UPLOADED` state. It then, each step recorded as it
succeeds so a retry resumes rather than duplicates:

1. creates the merchant with the **default classification** (`MERCHANT`) — the
   form cannot choose a class; `APPLICATION`/`PLATFORM` remain a separate
   operator classification (ADR-057);
2. creates the AOA wallet (with its accounts);
3. creates the default API key;
4. records the KYB approval (the reviewed application *is* the KYB decision);
5. assigns the environment's default pricing profile (`sandbox-default`);
6. atomically: the public profile, the handle — converted **only** from this
   application's own `APPLICATION` hold, never overwritten from anyone else —
   the login credential, a single-use activation token, the documents' merchant
   id, and the status.

A failure records `PROVISIONING_FAILED` with the failing step; approving again
is the reprocess path.

### A Business that already exists is linked

The applicant can say *this @handle is already my Business*
(`existing_business: true`). Then no hold is taken and the application can
only be resolved by **LINK**: the operator picks the existing Business, types its
`@handle` to confirm, gives a reason. Linking attaches the reviewed documents
and the KYB approval to that Business and records `LINKED_EXISTING`. It
creates nothing and moves nothing — no merchant, wallet, handle, login,
Project binding (ADR-055 seals are untouched) or ledger entry. If a Business
owns the requested handle, that Business is the only permitted target: a handle
is never transferred by an application.

Submitting a new application for a handle a Business owns is refused
(`HANDLE_OWNED_BY_BUSINESS`); claiming an existing Business for a handle no
Business owns is refused (`HANDLE_NOT_A_BUSINESS`).

### The login follows its handle

`VerifyHandlePin` signs in only when the credential's merchant owns the handle
in `handle_registry`. A mismatch is refused with the same non-enumerating 401 as
a wrong PIN, logged as `merchant.auth.handle_owner_mismatch` and counted.
Migration 0117 moved the one existing violating credential (`@doa`) to the
handle's owner under strict preconditions, audited as
`BUSINESS_CREDENTIAL_REASSIGNED`.

### Submission is idempotent

The form sends one `Idempotency-Key` per form session; the key is stored as a
SHA-256 hash, and a replay returns the same application id. The public routes
are rate-limited per IP (30/min).

## Consequences

- An approved Business can be traced to a reviewed application and an
  operator's decision; a linked one to the operator who linked it and why.
- `@doa` enters the lifecycle the same way any existing Business would. DOA is
  special as an application, never as a Banzami tenant.
- Approval now **depends on document storage**. With no KYB storage configured
  the Gateway answers `503 STORAGE_NOT_CONFIGURED`, the form says the documents
  were not sent, and no application can be approved. That is the intended
  fail-closed behaviour, not a degradation to hide (docs/ops/KYB_R2_SETUP.md).
- Documents are checked by what their bytes are (magic bytes for PDF/JPEG/PNG),
  not what the uploader declared; a mismatch is deleted from storage and the
  document marked `REJECTED`. **No malware scanning is performed.** Files are
  never rendered by the Gateway and are served to operators only through
  short-lived signed URLs from a private bucket.

## Alternatives considered

- **Keep Sandbox auto-approval.** Rejected: it is where the 29 unreviewed
  Businesses came from, and a Sandbox that approves differently from LIVE
  tests nothing about LIVE.
- **Transfer the handle to the application's new Business.** Rejected: it would
  move the identity, and with it the Project binding and the funds' address,
  away from the Business that holds the money.
- **Re-provision `@doa` from scratch.** Rejected: a second Business with a new
  wallet would strand the existing balance and break the sealed Project binding.
