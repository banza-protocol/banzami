# ADR-062 — Public Sandbox Projects and Workspaces are developer-disposable

Version: 1.0
Status: Accepted
Date: 2026-09-14
Relates to: ADR-046 (single key authority), ADR-047/055 (Project binding, sealed bindings), ADR-060 (self-service Public Sandbox), ADR-061 (wallet-native network, Core-only financial writer)
Milestone: SANDBOX-DELETE-001

## The principle

Public Sandbox is disposable from the developer's perspective. A developer may
delete a Sandbox Project or Workspace even after it has had financial activity.
Deletion immediately removes authority and the resource from the developer's
usable environment. Banzami retires the owned test resources and closes
fictitious financial positions through canonical balanced operations. Deletion
never rewrites ledger history and never edits a balance. Only the minimum
financial, audit, security and idempotency evidence required for platform
integrity remains internally. Archive is optional organisation, not a
prerequisite for Delete. These semantics apply to the Public Sandbox only and do
not authorise equivalent destructive behaviour in Financial Live.

This is operator-local lifecycle policy for Console resources, built from
operations Core already had (the Sandbox reset's retirement postings). It
introduces no financial object, event or wire field, so it needs no BANZA ADR.

## Context — what the product did before

| Restriction | Where | Classification |
|---|---|---|
| A Project that ever issued a key, logged a request or received a Financial Setup could not be deleted (`409 PROJECT_NOT_EMPTY`), only archived | `service.go` `DeleteProject`, footprint | LIVE-DERIVED_POLICY — retention thinking for real money applied to fictitious value |
| A Workspace holding any Project, active or archived, could not be deleted (`409 WORKSPACE_NOT_EMPTY`) | `store_pg.go` `DeleteWorkspace` | IMPLEMENTATION_LIMITATION — `dev_projects` cascades from the workspace row, so a physical delete would have erased the projects; the refusal protected history, not a rule |
| Archive revoked keys and nothing else: test payers kept their balances, the test Business stayed ACTIVE, webhooks kept firing | `ArchiveProject` | LEGACY — archive was never a close-out |
| Archiving a Workspace is refused while it has active Projects | `ArchiveWorkspace` | UX_ONLY — kept, for archive |
| A sealed binding (ADR-055) cannot be deleted | DB trigger | INTEGRITY_REQUIRED — kept; a tombstone keeps the row, it grants nothing |
| Ledger entries, postings, receipts and audit rows are immutable | DB triggers, ADR-061 authority | INTEGRITY_REQUIRED — kept |

The Console said it plainly: "a project that has had keys, requests or a
Financial Setup is archived, not deleted." A developer who tried the Sandbox ten
times had ten archived Projects for ever.

## Decision

### 1. Lifecycle

```
ACTIVE | ARCHIVED ──delete──▶ DELETING ──Core retirement passes──▶ DELETED (tombstone)
```

- **Enter DELETING** in one developer-api transaction: the status, every key of
  the Project revoked (for a Workspace: every Project in it, active and archived,
  and every pending invite), an unsealed binding disabled. Workspace then
  Project locks; creation paths take share locks, so a key, binding or Project
  created concurrently either lands first and is revoked in the same
  transaction, or is refused (`409 RESOURCE_DELETING`).
- **Authority ends at that commit.** The gateway authorises every key on every
  request (no cache); a key of a DELETING or DELETED Project answers `401`.
  Realtime refuses the status token of a session attributed to such a Project
  (`404` on connect, `event: revoked` on an open stream). Console routes for the
  Project, Explorer and webhook management answer `404`; lists omit it.
- **Core retires** (`POST /internal/v1/sandbox/projects/retire`, Sandbox only,
  `403` in LIVE). From the first pass Core refuses new Payment Sessions and
  Payment Links attributed to the Project (`sandbox_retired_projects`). Each pass
  retires the Project's test payers (fictitious balance to transit through a
  balanced posting, `retired_at`, consumer suspended), cancels its open sessions
  and links, and — only when developer-api reports no other live Project bound to
  it — retires the Project's own synthetic Business exactly as a reset does,
  suspends it, disables its webhook endpoints and ends their pending deliveries.
  Every step is state-based and every posting idempotent per account, so a
  retried, resumed or repeated pass posts nothing twice.
- **Grace, then tombstone.** After 60 seconds — longer than the 30-second
  gateway→Core timeout, so a request authorised just before revocation has
  committed or failed — a final pass runs and the Project becomes DELETED: its
  display name and slug are released, its request logs are deleted. A Workspace
  becomes DELETED once all its Projects are, and its memberships and invites are
  deleted. A resumer in developer-api continues every DELETING resource every 20
  seconds, so a crash, a Core outage or a closed browser never strands one.

### 2. What remains, and why

| Data | After deletion | Class |
|---|---|---|
| Ledger postings and entries, including the retirement postings | kept, unchanged | LEDGER_REQUIRED |
| Payment Sessions, Links, payments, refunds, settlements (terminal states) | kept, unchanged | LEDGER_REQUIRED |
| Receipts / proofs | kept, unchanged, still verifiable as `environment: SANDBOX` | LEDGER_REQUIRED |
| Core `audit_log`, developer `audit_events` (including `project.deletion_requested`, `project.deleted`) | kept | AUDIT_REQUIRED |
| Webhook events and delivery history | kept; pending deliveries ended as FAILED | AUDIT_REQUIRED |
| Project / Workspace row | tombstone: id, workspace, status, timestamps; name and slug released | SECURITY_REQUIRED (ids are never reused; audit and ledger rows point at them) |
| API key rows | kept REVOKED, hash only | SECURITY_REQUIRED (a presented old key is recognised and refused) |
| Sealed bindings, `sandbox_link_projects`, `sandbox_retired_projects` | kept | SECURITY_REQUIRED / IDEMPOTENCY_REQUIRED |
| Idempotency keys of postings | kept | IDEMPOTENCY_REQUIRED |
| Request logs of the Project | deleted | UNNECESSARY |
| Simulated rail state, Sandbox funding reservations | deleted | UNNECESSARY |
| Memberships and invites of a deleted Workspace | deleted | UNNECESSARY |

### 3. Receipts

A receipt issued before deletion keeps verifying, byte for byte the same, and
says `environment: SANDBOX`. It grants nothing: the reference reads a proof,
never the Project. The payee display is the snapshot taken at issue.

### 4. RBAC

Deleting a Workspace is the Owner's, as archiving is. Deleting a Project is a
manager's (Owner or Admin), as archiving is. Both require the exact name in the
request body. A non-member cannot tell a deleted id from one that never existed.

### 5. Environment boundary

Outside the Sandbox developer-api keeps the previous rule (only an empty Project
or Workspace is removed) and Core's retirement route refuses LIVE before reading
anything. Financial Live remains NOT READY / FAIL-CLOSED; nothing here gives it a
destructive path.

### 6. Canonical resources

There is no tenant-specific branch. Harnesses delete only the resources they
created (matched by their own stamps) and `ops/canonical-resources.yaml` with
`tools/check-canonical-resources.mjs` guards what must stay active. An owner
deleting their own canonical resource in the Console is a legitimate owner
action.

## Alternatives rejected

- **Physical delete.** Would orphan ledger postings, receipts and audit rows, or
  cascade into them. Rejected.
- **Keep archive-only and add "hide archived".** Leaves live fictitious balances,
  ACTIVE test Businesses and firing webhooks behind every archived Project.
- **Synchronous everything.** Core retirement of a busy Business can take
  seconds and a request in flight can commit after the first pass; the grace and
  final pass close that window without a distributed workflow engine.
- **A new `DELETED` financial state in Core.** Unnecessary: Core only needs to
  refuse new objects for a retired Project and retire what exists, both of which
  it already knew how to do for a reset.

## Consequences

- Developers can clean their own Sandbox with no support or operator action.
- A deleted resource's quota place is free at once (limits count ACTIVE), the
  daily creation allowance is unchanged.
- Acceptance harnesses clean up with the product's own Delete.
- Migration 0146; `SANDBOX_PROJECT_RETIRED` Core audit action; developer-api may
  delete request logs (authority manifest).
- Evidence: `docs/quality/SANDBOX_DELETE_001_CONFORMANCE.md`.
