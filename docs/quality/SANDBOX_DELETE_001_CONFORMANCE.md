# SANDBOX-DELETE-001 — conformance

Version: 1.0

The after-state on 2026-09-14, read from the code and the deployed Public Sandbox.
The decision is [ADR-062](../adr/ADR-062-sandbox-resources-are-developer-disposable.md).

> Public Sandbox is disposable from the developer's perspective. A developer may
> delete a Sandbox Project or Workspace even after it has had financial activity.
> Deletion immediately removes authority and the resource from the developer's
> usable environment. Banzami performs controlled cascade retirement of owned
> test resources and closes fictitious financial positions through canonical
> balanced operations. Deletion must never rewrite immutable ledger history or
> create direct balance mutations. Only the minimum financial, audit, security
> and idempotency evidence required for platform integrity may remain internally.
> Archive is optional organisation. Archive is not a prerequisite for Delete.
> These semantics apply to Public Sandbox. They do not authorise equivalent
> destructive behaviour in Financial Live.

## Before

| Behaviour | Why | Classification |
|---|---|---|
| Project with a key, a request log or a Financial Setup: `409 PROJECT_NOT_EMPTY`, archive only | footprint rule copied from real-money retention | LIVE-DERIVED_POLICY — removed in the Sandbox |
| Workspace with any Project: `409 WORKSPACE_NOT_EMPTY` | `dev_projects` cascades from the workspace row; a physical delete would erase them | IMPLEMENTATION_LIMITATION — replaced by a lifecycle |
| Archive revoked keys only; payers kept balances, the test Business stayed ACTIVE, webhooks kept firing | archive was never a close-out | LEGACY — archive unchanged, Delete closes out |
| Console: "a project that has had keys, requests or a Financial Setup is archived, not deleted" | the rule above | UX_ONLY — rewritten |
| Sealed bindings, ledger, receipts, audit rows immutable | integrity | INTEGRITY_REQUIRED — kept |

## Defects found by the deployed acceptance and fixed

| Found by | Defect | Fix |
|---|---|---|
| lifecycle E2E, residue 1 | Deleting the Project that created a shared test Business kept it (correct); deleting the partner afterwards retired nothing, leaving an ACTIVE Business no Project could reach | developer-api names the bound Business; Core retires it only if synthetic, its creator already retired, and no live Project uses it (`a_shared_business_is_retired_with_the_last_project_on_it`, `a_named_business_that_is_not_orphaned_is_never_retired`; both guards mutation-proven) |
| lifecycle E2E, funded 1 | A top-up authorised before deletion committed after Core retired the payer; later passes skipped retired payers, so 10 000 Kz stayed | Every pass sweeps any balance a Project's payer holds, retired or not; the test credit locks the payer row and refuses a retired one (`value_reaching_a_retired_payer_is_retired_by_the_next_pass`, `a_retired_payer_takes_no_new_credit`; mutation-proven) |
| lifecycle E2E, key race | A key creation past its permission check that met the deletion answered `503` | `ErrDeleting` mapped at every store caller → `409 RESOURCE_DELETING` (`TestSandboxDelete_ARequestPastItsCheckIsRefusedAsDeletingNotUnavailable`; mutation-proven) |
| PG race test | Concurrent deletes each wrote `project.deletion_requested` | `ErrAlreadyDeleting` from `Begin*Deletion`; recorded once (mutation-proven) |
| authority gate | The tombstone deletes request logs, which `bl_developer_api_runtime` could not | manifest grant; `DB_AUTHORITY_VERIFY=PASS` on the Sandbox |
| workspace footprint | A deleted Project counted as active | footprint excludes DELETING/DELETED |

### Residue the pre-fix runs left

The first lifecycle runs ran before fixes `e91b04ba` and `7a0b3966` were deployed,
and left what those defects produce:

| Item | State | Action |
|---|---|---|
| Shared test Business `35a6f38a…` (creator and partner both deleted) | was ACTIVE | retired through Core's own route (`POST /internal/v1/sandbox/projects/retire`, pass `repair-orphan-1`, `requested_by` operator): 5 000 Kz retired by balanced posting, SUSPENDED. No SQL write. One operator repair of acceptance residue, not a step of any developer flow |
| Retired test payer `4d654f5d…` of deleted Project `1540f933…` | 10 000 Kz fictitious balance | **outstanding**: the same Core pass (`retire_business: true`, no bound Business) sweeps it with the fixed code; the call needs the owner's approval to run |

The runs after the fixes leave neither (lifecycle 10/10, `FUNDING_PAYMENT_RACE`
funded 0, `SHARED_BUSINESS_KEPT` then residue 0).

## Lifecycle and financial integrity

| Property | Implementation | Proof |
|---|---|---|
| Delete after activity | `DeleteProject` / `DeleteWorkspace` in the Sandbox: no footprint check | Go `TestSandboxDelete_AProjectWithHistoryIsDeleted`; E2E project step `DELETE_ACCEPTED_WITH_ACTIVITY` (202 after payments, refund, settlement) |
| Immediate revocation | DELETING + every key revoked in one transaction; gateway authorises every request (no cache); realtime refuses DELETING/DELETED sessions | `TestSandboxDelete_AuthorityEndsBeforeCleanup` (Core down); `TestRealtime_ADeletedProjectsTokenStopsWorking`; E2E key 401, realtime 404, Explorer/webhooks/keys 404 on the next request |
| No new mutations while DELETING | share locks on creation paths; Core `sandbox_retired_projects` refuses sessions/links; retired payer refuses credit | PG `TestPgStore_KeyCreationRacingDeletionLeavesNoActiveKey`; Core `a_deleted_project_creates_nothing`; E2E key, session and funding races interleaved |
| In-flight | committed stays (paid sessions stay PAID); not started refused; in flight within 30 s swept by the final pass after the 60 s grace | E2E `LEDGER_BALANCED_HISTORY_KEPT` (`paidStillPaid`), `FUNDING_PAYMENT_RACE` |
| Balanced cleanup, no direct balance mutation | `retire_in_tx`: DR owner available / CR transit; no balance column exists; 0144 guard + authority roles | Core `deleting_retires_what_the_project_owns_through_postings` (book balanced); ledger reconciliation 6/6 |
| No double cleanup | posting key per pass and account; zero balance posts nothing; a later pass posts only value that arrived since | Core `a_later_pass_retires_only_what_arrived_since`; E2E `doubleCleanups=0`, `IDEMPOTENT_REPEAT` (passes unchanged) |
| Ledger history not rewritten | nothing updates or deletes ledger rows | E2E fingerprint of every entry on the Business and payer accounts identical before and after (`10:287e6dc6…`) |
| Recovery | resumer every 20 s continues DELETING resources | `TestSandboxDelete_AuthorityEndsBeforeCleanup` (Core unreachable → resumed) |
| Cascade | Workspace deletion moves active and archived Projects to DELETING, revokes invites; DELETED when all Projects are | Go `TestSandboxDelete_WorkspaceCascadesWithoutArchivingFirst`; PG `TestPgStore_WorkspaceDeletionRevokesMembersInvitesAndChildren`; E2E workspace suite |
| Shared Business | retired only when no live Project uses it | Go `TestSandboxDelete_ASharedBusinessIsNotRetired`; Core shared-business tests; E2E `SHARED_BUSINESS_KEPT` |
| Name reuse | tombstone releases name and slug; ids never reused | PG `TestPgStore_DeletionTombstoneReleasesTheNameAndHidesTheProject`; E2E `NAME_REUSE_NEW_RESOURCE` |
| Rail independence | deletion never calls a rail | E2E `DELETE_WITH_RAIL_DOWN` |

## Receipts

An issued receipt keeps verifying at `/v1/public/proofs/{ref}`, byte for byte, with
`environment: "SANDBOX"`; it grants no authority over the deleted Project. The
payee display is the snapshot taken at issue. E2E `RECEIPT_UNCHANGED`.

## Data minimisation

| Retained | Class |
|---|---|
| ledger postings and entries, sessions, links, payments, refunds, settlements in terminal states, receipts | LEDGER_REQUIRED |
| Core `audit_log`, developer `audit_events`, webhook events and delivery history | AUDIT_REQUIRED |
| Project/Workspace tombstone (id, workspace, status, timestamps), revoked key rows (hash only), sealed bindings, `sandbox_link_projects` | SECURITY_REQUIRED |
| `sandbox_retired_projects`, posting idempotency keys | IDEMPOTENCY_REQUIRED |

| Removed | Class |
|---|---|
| request logs of the Project; simulated rail state; Sandbox funding reservations; memberships and invites of a deleted Workspace; display name and slug | UNNECESSARY |

## Security review

| Threat | Control | Proof |
|---|---|---|
| Unauthorised member delete | Workspace: Owner; Project: Owner or Admin; exact name in the body | Go `TestSandboxDelete_DeletionIsForManagersAndOwnersOnly`; E2E Developer member 403/403 |
| CSRF | delete routes in the Origin + CSRF group | `handlers.go` Mount |
| Stolen session | same as any Owner action: sessions revocable in `/conta`; the name must be typed; audit records actor, IP, request id | audit events |
| Cross-tenant id substitution | membership resolved from the resource's own workspace; a stranger gets 404; Core accepts a named Business only if orphaned from its own tables | E2E `nonMemberDeletes=404`, `OTHER_TENANT_UNTOUCHED`; Core `a_named_business_that_is_not_orphaned_is_never_retired` |
| Race with key creation / financial mutation | lock order workspace → project; Core refusal; retired-payer row lock; final pass | PG race test; E2E races |
| Cleanup job replay | state-based passes, idempotent postings | Core idempotency tests |
| Tombstone resurrection | new id on name reuse; old key hash stays REVOKED | E2E, Go name-reuse test |
| Old API key / realtime token / webhook management | 401 / 404 / 404 | E2E |
| Cross-environment | developer-api keeps the empty-only rule outside the Sandbox; Core retire refuses LIVE | Go lifecycle tests (non-Sandbox); Core `deletion_retirement_is_sandbox_only` |
| Logging | passes log counts and latency, never keys or tokens | `developer.project_deletion.pass` |

## UX and accessibility

- Project Settings and Workspace Settings: danger zone with *Eliminar projeto* /
  *Eliminar workspace*, offered after activity; archive kept as optional.
- Confirmation: `Eliminar "<nome>"?`, the consequence list, the integrity sentence,
  the name typed exactly; *A eliminar…* while running; the flash says when test
  resources are still being closed.
- Dialog: modal, labelled and described, focus in the field, Tab trapped, Escape
  closes and returns focus, busy state announced, refusal announced
  (`ConfirmByName.test.tsx`, mutation-proven).
- `tools/e2e/console/delete-ui.mjs` on the deployed Console, populated fixture
  with long names, 1440 / 1280 / 768 / 390: 43/43 — no horizontal overflow with
  the dialog closed or open, no unnamed or sub-24px control, strong confirmation,
  focus return, and a real deletion of the Project and the Workspace through
  the dialog at 390 px.

## Documentation

- Developer docs PT/EN (Console page): workspace and project lifecycle rewritten,
  *O que acontece ao eliminar* / *What deleting does*, reset is not needed before
  deleting; `RESOURCE_DELETING` in the error catalogue; claims ledger 0
  unclassified, coverage manifest updated; search index and `llms.txt` rebuilt.
- Console copy: quota and refusal messages name delete; no "archive because of
  activity" text remains (`settings-truthfulness.test.ts`).
- `make check-docs-prod` PASS.

## Deployed acceptance

| Suite | Result |
|---|---|
| `sandbox-delete-e2e.mjs project` | 17/17 |
| `sandbox-delete-e2e.mjs workspace` | 10/10 |
| `sandbox-delete-e2e.mjs lifecycle` | 10/10 |
| `sandbox-delete-e2e.mjs selftest` | 35 predicates mutation-proven |
| `delete-ui.mjs` | 43/43 |
| `public-sandbox-cleanroom.mjs` | 32/32 (delete steps 3/3), residue 0 |
| `tests/phase0/ledger-reconciliation.sh` | 6/6, book sums to zero |
| `runtime-authority.sh verify` | `DB_AUTHORITY_VERIFY=PASS` |
| `acceptance-suites.mjs all` (cleanup = Delete) | scenarios PASS, workbench 10/10, refunds 8/8, wallet-native 16/16, rail isolation 7/7, residue 0 |
| `responsive.mjs` / `accessibility.mjs` (populated) | 52/52 / 41/41 |
| `check-canonical-resources.mjs` | 0 unclassified identities, workspaces, projects, keys |

## Counters

```
SANDBOX_WORKSPACE_DELETE_AVAILABLE=PASS
SANDBOX_PROJECT_DELETE_AVAILABLE=PASS
SANDBOX_ACTIVITY_BLOCKS_DELETE=0
SANDBOX_ARCHIVE_REQUIRED_BEFORE_DELETE=0
ARCHIVE_AND_DELETE_SEMANTICALLY_DISTINCT=PASS
ARCHIVED_PROJECT_CAN_BE_DELETED=PASS
WORKSPACE_DELETE_WITH_ARCHIVED_PROJECTS=PASS
DELETE_AUTHORITY_REVOCATION_IMMEDIATE=PASS
DELETED_PROJECT_KEY_CAN_AUTHENTICATE=0
DELETING_RESOURCE_ACCEPTS_NEW_MUTATIONS=0
DELETE_DIRECT_BALANCE_MUTATIONS=0
DELETE_BALANCE_CLEANUP_BALANCED=PASS
DELETE_REWRITES_LEDGER_HISTORY=0
DELETE_AUDIT_INTEGRITY=PASS
DELETED_RESOURCE_OPERATIONALLY_ACTIVE=0
DELETED_RESOURCE_VISIBLE_AS_ACTIVE=0
DELETE_NAME_REUSE_DOES_NOT_RESURRECT=PASS
SANDBOX_FINANCIAL_SETUP_BLOCKS_DELETE=0
SANDBOX_DELETE_OPERATOR_ACTIONS=0
DELETE_CROSS_TENANT_RESOURCE_IMPACT=0
DELETED_PROJECT_TEST_PAYER_USABLE=0
DELETED_PROJECT_ACTIVE_KEYS=0
DELETED_PROJECT_WEBHOOK_ACTIVE=0
DELETED_PROJECT_PAYMENT_ACCEPTANCE=0
DELETED_PROJECT_REALTIME_AUTHORITY=0
DELETE_RECEIPT_SEMANTICS_DEFINED=PASS
DELETE_RECEIPT_FINANCIAL_HISTORY_REWRITTEN=0
DELETED_WORKSPACE_MEMBER_ACCESS=0
DELETED_WORKSPACE_PENDING_INVITES_VALID=0
SANDBOX_DELETE_RBAC=PASS
CROSS_TENANT_DELETE=0
SANDBOX_DELETE_IDEMPOTENCY=PASS
DELETE_DOUBLE_FINANCIAL_CLEANUP=0
DELETE_RECOVERY=PASS
DELETE_LIFECYCLE_RACE_SAFETY=PASS
DELETE_TENANT_ISOLATION=PASS
SANDBOX_DELETE_SECURITY_REVIEW=PASS
SANDBOX_PROJECT_DELETE_E2E=PASS
SANDBOX_WORKSPACE_DELETE_E2E=PASS
SANDBOX_DELETE_REQUIRES_EXTERNAL_PROVIDER=0
DELETE_RECEIPT_E2E=PASS
SANDBOX_DELETE_LEDGER_INVARIANTS=PASS
SANDBOX_DELETE_ACCEPTANCE_RESIDUE=1  (pre-fix payer 4d654f5d…, 10 000 Kz; repair pending approval)
SANDBOX_DELETE_PUBLIC_CLEANROOM=PASS
SANDBOX_DELETE_OPERATOR_INTERVENTIONS=0
SANDBOX_DELETE_DOCS=PASS
SANDBOX_DELETE_DOCS_PT_EN=PASS
SANDBOX_DELETE_SUPPORT_REQUIRED=0
SANDBOX_DELETE_A11Y=PASS
SANDBOX_DELETE_UNNECESSARY_ACTIVE_DATA=0
SANDBOX_DELETE_SPECIAL_CASES=0
DOA_DELETE_SPECIAL_CASES=0
SANDBOX_DELETE_PUBLIC_CONTRADICTIONS=0
SANDBOX_DELETE_ENABLES_LIVE_DESTRUCTIVE_DELETE=0
SANDBOX_DELETE_CROSS_ENVIRONMENT=0
FINANCIAL_LIVE_STATUS=NOT_READY
FINANCIAL_LIVE_FAIL_CLOSED=PASS
```

## Archive, kept distinct

- Archive is optional: it revokes keys and keeps the Project, its payers and its
  Business (E2E `ARCHIVE_REGRESSION`); a Workspace with an active Project still
  refuses archive.
- Archived Projects appear under *Mostrar arquivados* and are deleted from their
  Settings (`ARCHIVED_PROJECT_DELETED`).
- Archived Workspaces were hidden from the Console's selector with no way back,
  so an Owner could not delete one from the product. `GET /workspaces?include_archived=true`
  and a *Mostrar arquivados* toggle for workspaces now reach them
  (`TestSandboxDelete_AnArchivedWorkspaceIsReachableAndDeletable`,
  `WorkspaceSwitcher.test.tsx`, mutation-proven; E2E `ARCHIVED_WORKSPACE_DELETED`).
- Undoing an archive still goes through support; deleting never does.
