# 10 — Run, resource and retention model

Version: 1.0

---

## 1. Run identity

```
BZV-YYYYMMDD-NNNN-<short-revision>

BZV-20260918-0001-0cdc05a2
```

The prompt asked whether a revision component improves uniqueness and
reproducibility. **It does, and it is recommended.** Two runs on the same day
against different revisions are the common case during a Repair Run, and the
date+sequence form makes them look interchangeable in a directory listing, a
log line or an evidence path. The revision is the candidate `HEAD`; the *served*
revisions are recorded separately in the manifest, because they are frequently
different and that difference is the point.

## 2. Run Manifest

Immutable, written before the first journey, never edited:

```json
{
  "run_id": "BZV-20260918-0001-0cdc05a2",
  "environment": "SANDBOX",
  "run_type": "FULL_SANDBOX",
  "started_at": "…", "ended_at": "…",
  "triggered_by": { "kind": "claude|ci|operator", "id": "…" },

  "repository": {
    "head": "0cdc05a28279…", "branch": "main",
    "origin_main": "0cdc05a28279…", "tree_clean": true
  },

  "runtime": {
    "migration_head": "0159",
    "services": {
      "api-gateway-staging": "b2bfedb5", "public-api-staging": "b2bfedb5",
      "core-api-staging": "82283af0",    "developer-api": "d2098e7b",
      "admin-api": "bc9080ec",           "admin-frontend": "5ce51b5b",
      "pay-frontend": "b2bfedb5",        "app-frontend": "2fbdd20f",
      "website-frontend": "…"
    },
    "deploy_parity": { "clean": false, "divergent": ["developer-api", "admin-api", "website-frontend"] },
    "feature_flags": {
      "ENVIRONMENT": "sandbox", "BANZAMI_PILOT_LIMITS": "1",
      "PAYMENT_CAPABILITY_RELEASED": "true", "DEVELOPER_KEY_AUTH_ENABLED": "true",
      "FIXTURE_EMAIL_DAILY_BUDGET": 40
    }
  },

  "artifacts": {
    "sdk": { "@banzami/sdk": "0.14.1", "banzami_client": "…" },
    "openapi_digest": "sha256:…"
  },

  "registries": {
    "capabilities_rev": "…", "journeys_rev": "…",
    "actors_rev": "…", "lab_config_rev": "…"
  },

  "toolchain": { "chromium": "…", "playwright": "…", "flutter": "…", "node": "…" },

  "actors": ["C01","C02","C03","B01","B02","B03","D01","D02","A01"],

  "budgets_at_start": {
    "aggregate_volume_minor": 92988840, "aggregate_volume_cap_minor": 200000000,
    "aggregate_funds_minor": 6532600,   "aggregate_funds_cap_minor": 50000000,
    "application_submits_24h": 4,       "fixture_email_today": 6
  },

  "external_dependencies": { "cash_in": "NOT_IMPLEMENTED", "cash_out": "EXTERNAL_DEPENDENCY",
                             "npm": "reachable", "resend": "reachable", "doa": "reachable" },

  "assertions": {
    "REAL_LIVE_TESTS_EXECUTED": 0,
    "REAL_LIVE_FINANCIAL_MUTATIONS": 0,
    "REAL_LIVE_INFRASTRUCTURE_MUTATIONS": 0
  }
}
```

`budgets_at_start` and its `budgets_at_end` counterpart are not bookkeeping —
they are how the programme measures its own irreversible cost against the
Sandbox ([16](16-external-dependency-matrix.md) §3).

**Runtime revisions are read, never assumed.** `tools/e2e/run-assurance.mjs`
already does this and states the reason: *evidence that names the candidate but
not the runtime is a claim about nothing.*

## 3. Resources, and the line that must not be crossed

Cleanup is **never** "delete what the test created".

| Class | Examples | Policy |
|---|---|---|
| **Disposable** | draft collections, unused payment links, unsent webhook endpoints, browser artifacts, expired sessions, temporary fixtures | may be retired after the run |
| **Preserved — economic history** | ledger postings, completed payments, paid Collection shares, transfers, receipts and proofs, settlements, payouts, refunds, audit entries | **immutable; never deleted** |
| **Persistent** | the nine Validation Actors and their wallets | never deleted |
| **Retirable value** | surplus synthetic balance | **retired by reverse posting**, never edited |

The distinction has teeth because the platform already enforces it: the ledger
is append-only, and `core/api/src/routes/sandbox_funds.rs` exists precisely so
that value can leave circulation *with its history intact*:

```
funding     DR transit          CR owner available
retirement  DR owner available  CR transit
```

Nothing is deleted. No balance is edited. That is the whole model.

## 4. Resource attribution

Where a product API accepts metadata, journeys write:

```
run_id · actor_id · journey_id · capability_id
```

Where it does not, the Lab records the association in its own
**Validation Resource Registry** (`quality/validation/resources.yaml` schema,
rows in the Lab's own storage).

**Public product contracts are not modified to carry test metadata.** A field
added so the Lab can find its own rows is a field every integrator must then
understand, and it would violate the protocol-first rule in CLAUDE.md. External
attribution is the correct cost.

## 5. Retention classes

| Class | Metadata | Large binaries (video/HAR/traces) | Financial evidence (receipts, ledger extracts) |
|---|---|---|---|
| Golden Run | indefinite | indefinite | indefinite |
| Failed run | indefinite | 180 days | indefinite |
| Repair Run | 365 days | 90 days | indefinite |
| Targeted Run | 180 days | 30 days | indefinite |
| Health preflight | 90 days | n/a | n/a |

Two deliberate asymmetries:

- **Financial evidence is never expired by class.** A receipt PDF and a ledger
  extract are records of a financial operation, not debugging aids.
- **Failed-run binaries outlive Repair-Run binaries.** A failure's video is the
  thing you want six months later; a green run's video is not.

These are Lab-internal operational retention periods for synthetic Sandbox
data. **They are not a legal retention policy**, none exists in the repository
today, and a Live programme would have to set one separately.

Evidence deletion is audited and requires `CapValidationConfig`.

## 6. Concurrency

One `FULL_SANDBOX` or `GOLDEN` run at a time, enforced by a lock the runner
acquires and BANZADMIN displays. Rationale in
[05](05-actor-spec.md) §8: actors are shared and financially stateful, and the
scarcest system resource — the aggregate volume budget — is global.

`TARGETED` runs may overlap only with disjoint actor sets and disjoint
capability sets. `REPAIR` runs take the full lock, because they deploy.
