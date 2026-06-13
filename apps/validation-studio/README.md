# Validation Studio

**LOCAL-ONLY governance workstation. Never deploy. Never expose publicly.**

---

## Current Banzami context (2026-06-13)

Banzami is a **pure commercial payment operator** built on the BANZA protocol. After the purification and minimalization passes, the repository contains only operator material. When validating items, reference these real paths:

| Area | Where it lives | Notes |
|------|----------------|-------|
| Financial core (Rust) | `core/` — ledger, wallets, consumer-wallets, transfers, qr, payment-links, transactions, settlement, payouts, reconciliation, risk, compliance, routing, acquiring, identity, api | Single writer of financial tables |
| API services (Go) | `services/` — api-gateway, public-api, admin-api | Operator API surface |
| Product apps | `apps/` — dashboard, admin, pay, checkout, mobile, merchant | Merchant/consumer surfaces |
| SDKs | `sdk/` — typescript, flutter, python, go, php, checkout-web | **Banzami operator integration SDKs** (not protocol SDKs) |
| Operator docs | `docs/` (markdown) | adr, api, architecture, domains, runbooks, security, compliance, sandbox, standards, validation |

**Removed (do NOT reference as evidence — they no longer exist in this repo):**

- `apps/docs/` — the public website (banzami.com) → removed; matrix items citing `apps/docs/**` are **stale** and should be retired through this Studio's governance flow.
- `contracts/`, `sdk-certification/` — protocol contracts & certification → owned by the BANZA protocol repo, not the operator.
- `docs/BANZA_REFERENCE.md` mirror, `docs/banzamia/`, `docs/images/architecture/` — protocol/BanzAI material → removed.

> The validation matrix (`docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json`) still contains VALIDATED items whose evidence points to removed `apps/docs/**` files and whose `meta.referenceFile` names the removed `BANZA_REFERENCE.md`. These are **stale by structure, not by status** — retire/repoint them via the §16 governance flow below (per-item proposal + approval phrases), never by hand-editing the JSON.

---

## Architectural model

Git is the governance layer.
The Validation Studio is only a visual operational layer on top of Git.

The Studio does NOT:
- write to production
- bypass Git
- bypass review or commit history
- expose public write APIs
- expose remote admin access

The Studio ONLY edits the local repository clone and creates local Git commits. Every change is traceable. Every change can be reverted. The production site is updated only through the normal deploy flow.

There is no production admin editing interface.

---

## Official governance flow

```
Validation Studio (local UI)
        ↓
  edit local JSON
        ↓
  schema validation
        ↓
  governance checks
        ↓
  git diff preview
        ↓
  git add
        ↓
  git commit
        ↓
  git push        ← manual step, outside the Studio
```

> **Current context (BANZAMI-REPOSITORY-MINIMALIZATION-001):** the public website (`apps/docs` — banzami.com) was removed. The validation matrix is no longer website content — it is the operator's **internal governance record** of implementation validation, living in Git. The flow therefore ends at `git push`; there is no website to deploy. The Studio remains the local governance UI for that record.

---

## Running

```bash
# From repo root:
make studio

# Or from this directory:
npm run dev
```

Opens at: [http://localhost:3099](http://localhost:3099)

---

## Commit model

Every validation modification must become a Git commit in this format:

```
validation(ID): description
```

Examples:
```
validation(QR-001): validate merchant static QR
validation(KYC-001): move onboarding to in_progress
validation(API-004): add SDK evidence
validation(SEC-002): mark blocked by EMIS certification
validation(matrix): update evidence for SEC and API domains
```

The Studio auto-suggests the commit prefix based on which item IDs appear in the diff.

---

## Claude validation commands

For Claude Code-assisted validation (inspect → propose → approve → apply → approve → commit):

| Command | Description |
|---------|-------------|
| `/validate-feature QR-001` | Full inspection + proposal for a specific item |
| `/validate-current` | Auto-detect current item from git context, then propose |
| `/validation-propose QR-001` | Proposal only — never writes |
| `/validation-apply QR-001` | Apply a proposal already generated in this conversation |

### Required approval phrases

Validation changes are governance actions. Claude requires exact phrases including a fingerprint — no other wording is accepted.

| Action | Required exact phrase |
|--------|-----------------------|
| Apply JSON change | `APPROVE VALIDATION QR-001 a84f9e2d1c3b5f7e` |
| Create git commit | `APPROVE COMMIT QR-001` |

The fingerprint is generated in the proposal and must be included literally. Without the fingerprint, the approval is rejected.

**Explicitly rejected:** `yes` · `ok` · `confirm` · `go` · `apply` · `pode avançar` · `sim` · any paraphrase · phrase without fingerprint

Apply and commit are separate phases, each gated by its own approval phrase. Applying does not auto-commit.

---

## Advanced governance primitives

### Validation Fingerprints

Every validation proposal generates a deterministic 16-character hex fingerprint:

```bash
echo -n "QR-001|$(git diff -- docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json | sha256sum | cut -c1-16)" | sha256sum | cut -c1-16
```

The fingerprint binds the proposal to the exact state of the implementation and the JSON at proposal time. If anything changes between proposal and approval, the fingerprint will not match and the operation is aborted — a new proposal must be generated.

The fingerprint is displayed in the DiffModal before saving, and recorded in every history entry.

---

### Immutable Validation History

Each item carries an append-only `history[]` array. When a status changes, a new entry is appended — existing entries are never modified, truncated, or reordered.

```json
{
  "timestamp": "2026-05-20T14:30:00Z",
  "from": "IN_PROGRESS",
  "to": "IMPLEMENTED",
  "approvedBy": "local-admin",
  "fingerprint": "a84f9e2d1c3b5f7e",
  "reason": "QR generation and scan flow implemented and verified",
  "evidence": ["core/qr/generator.rs:1-120"]
}
```

The ItemEditor shows history in a collapsible panel, reverse-chronological order. History is rendered read-only — it cannot be edited through the Studio UI.

---

### Financial Invariant Validation

Items in financially critical categories carry an `invariants[]` field. All invariants must be `PASS` before `VALIDATED` can be proposed.

**Financially critical categories:** `cat-ledger` · `cat-wallet` · `cat-p2p` · `cat-qr` · `cat-payouts` · `cat-refunds`

**Invariant statuses:** `PASS` · `FAIL` · `UNKNOWN` · `NOT_RUN`

`FAIL`, `UNKNOWN`, or `NOT_RUN` on any invariant blocks `VALIDATED` — shown as an error in the ItemEditor and rejected by governance checks at save time.

The ItemEditor renders each invariant with an inline status selector. Status changes are tracked as field-level diffs in the DiffModal.

---

### Architecture Lock Rules

Items with a `requires[]` field cannot become `VALIDATED` until every listed item is itself `VALIDATED`.

```json
"requires": ["LED-001", "WAL-001"]
```

In the ItemEditor, each dependency is shown with its current status — green for `VALIDATED`, red with a lock icon for anything else. Items locked by unvalidated dependencies also show a lock badge in the ItemList.

The lock is enforced at both proposal time and apply time (double verification). `requires[]` differs from `dependencies[]`: only `requires[]` has blocking effect.

---

## Workflow
2. Select an item → edit fields → governance issues appear live
3. **Pré-visualizar e guardar** → review field-level diff → **Guardar em disco**
4. **Git Commit** → review affected items → write description → **Criar commit →**
5. Manually: `git push origin main`

The matrix is an internal governance record committed to Git — there is no website deploy step.

---

## Security rules — non-negotiable

| Rule | Detail |
|------|--------|
| **Local only** | Binds to `localhost` exclusively |
| **No production build** | `npm run build` / `npm run start` are disabled |
| **Production guard** | `next.config.ts` and `layout.tsx` throw if `NODE_ENV === production` |
| **No public Docker image** | Excluded from all production Docker builds |
| **No public write API** | Server actions run only under the local Next.js process |
| **Git workflow preserved** | Saves write to disk; commit is an explicit separate step |

---

## Governance rules enforced

| Rule | Severity |
|------|----------|
| `VALIDATED` status requires ≥1 evidence entry | Error |
| `BLOCKED` status requires ≥1 blocking issue | Error |
| Empty `title`, `requirement`, or `referenceSection` | Error |
| `IMPLEMENTED` with no evidence | Warning |
| `CRITICAL` priority with no acceptance criteria | Warning |
| `VALIDATED` on financial category with non-PASS invariant | Error |
| `VALIDATED` when any `requires[]` item is not `VALIDATED` | Error |

Errors block saving. Warnings are shown but do not block.

---

## File edited

```
docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json
```

---

## Architecture

```
apps/validation-studio/
├── app/
│   ├── layout.tsx                # Production guard
│   ├── page.tsx                  # Redirects to /studio/validation
│   └── studio/validation/
│       └── page.tsx              # Server component — loads matrix + git context
├── components/
│   ├── Studio.tsx                # Main orchestrator (client)
│   ├── ItemList.tsx              # Searchable/filterable item list
│   ├── ItemEditor.tsx            # Full item editor with live governance
│   ├── DiffModal.tsx             # Field-level diff preview before save
│   └── CommitModal.tsx           # Git commit UI with message generator + log
├── actions/
│   ├── matrix.ts                 # Server actions: load, preview, save
│   └── git.ts                    # Server actions: context, diff, commit
└── lib/
    ├── types.ts                  # Shared TypeScript types
    ├── matrix.ts                 # JSON read/write + diff computation + appendHistory
    ├── git.ts                    # Git command wrappers (child_process)
    ├── governance.ts             # Rule enforcement: checkItem, checkRequires, checkInvariants
    └── fingerprint.ts            # SHA256 fingerprint computation and verification
```
