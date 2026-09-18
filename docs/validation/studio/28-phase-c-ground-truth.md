# 28 — Phase C.0 ground truth

Version: 1.0
Status: Observed 2026-09-18. Every line below was read from the running system,
not carried forward from a report.

---

## 1. Why this document exists

Phase C builds an operational control surface on top of what Phase B left
behind. A control surface that renders a summary of a previous report is not a
control surface — it is a screenshot. So Phase C begins by re-reading the
system, and every claim here cites the command that produced it.

Where this document and an earlier Phase B report disagree, **this document is
the later observation**; the earlier report is preserved unedited as the record
of what was true when it was written.

## 2. Repository

| Fact | Value | Source |
|---|---|---|
| HEAD | `1bf03679` | `git log --oneline -1` |
| Working tree | clean (0 files) | `git status --porcelain` |
| Migration head (repo) | `0159_collections_idempotency.sql` | `db/migrations/` |
| Migration head (Sandbox DB) | `159 collections idempotency` · success `t` | `_sqlx_migrations` |

Repository and database agree. There is no migration drift.

## 3. The A01 identity — resolved, not reconciled

Phase B's narrative and the actor registry could be read as naming two
different operators. They do not. **Both identities exist, and the registry is
correct.** Read from `admin_users` in `banzami_staging`:

| id | email | role | status |
|---|---|---|---|
| `8fe23a98-5dd2-4f87-89e5-3715416046e4` | `admin02@banzami-e2e.test` | COMPLIANCE | **ACTIVE** |
| `aa6df417-6871-4119-afe1-fee5eda0e1ac` | `admin01@banzami-e2e.test` | COMPLIANCE | **SUSPENDED** |

`A01` is `admin02`. `admin01` is its suspended predecessor: its TOTP seed was
lost before capture during the first enrolment attempt, so the identity could
no longer hold a session and a second operator was enrolled through the same
ceremony. `quality/validation/actors.yaml` already records exactly this, on the
`supersedes:` key.

Three things were deliberately **not** done:

- `admin01` was not deleted. A suspended operator that once held a session is
  audit history; deleting it would remove the only explanation for why `A01` is
  the second operator and not the first.
- Neither identity was renamed. `admin02` is not "really" A01 under another
  name — `A01` is the Studio's label for a role, and it currently resolves to
  `admin02`.
- No row was mutated to make documentation match. The documentation was checked
  against the rows, and it already agreed.

`CanHoldSession(status) == (status == "ACTIVE")` — so the suspended predecessor
is inert by the product's own rule, not by an exception written for it.

## 4. The nine actors

`node tools/validation-actor-health.mjs --probe` — every actor authenticated
through its real product door:

```
C01 e2ec01 HEALTHY   B01 e2eb01 HEALTHY   D01 developer HEALTHY
C02 e2ec02 HEALTHY   B02 e2eb02 HEALTHY   D02 developer HEALTHY
C03 e2ec03 HEALTHY   B03 e2eb03 HEALTHY   A01 operator  HEALTHY

VALIDATION_ACTOR_COUNT=9        VALIDATION_ACTORS_PROVISIONED=9
VALIDATION_ACTORS_UNOWNED=0     VALIDATION_ACTORS_ENVIRONMENT=SANDBOX
```

Caps in force, read from policy rather than restated: consumer balance
5 000 000, merchant balance 10 000 000, merchant rolling 24 h 25 000 000 minor.

## 5. Registry and architecture guards

```
VALIDATION_ACTOR_REGISTRY_READY=PASS     PARALLEL_VALIDATION_PLATFORM=0
VALIDATION_JOURNEY_REGISTRY_READY=PASS   BANZADMIN_AS_LONG_RUNNING_TEST_ENGINE=0
VALIDATION_SUITE_REGISTRY_READY=PASS     PUBLIC_WEBSITE_OPERATIONAL_VALIDATION_ACCESS=0
VALIDATION_STUDIO_NAMING_DRIFT=0         EXISTING_APPS_VALIDATION_STUDIO_PRESERVED=PASS
```

## 6. Deploy parity — two divergences, both unrelated to Phase C

`make check-deploy-parity` at HEAD `1bf03679`:

| Component | Verdict | Divergent file |
|---|---|---|
| `api-gateway-staging` | ✓ `1bf03679` | — |
| `admin-api` | ✓ `28913242` | — |
| `admin-frontend` | ✓ `28913242` | — |
| `public-api-staging` | ✓ `b2bfedb5` | — |
| `core-api-staging` | ✓ `79460b66` | — |
| `pay-frontend` | ✓ `b2bfedb5` | — |
| `app-frontend` | ✓ `2fbdd20f` | — |
| `webhook-sink` | ✓ `79460b66` | — |
| `developer-api` | ✗ `d2098e7b` | `services/common/documents/receipt.html` |
| `website-frontend` | ✗ `f0a14634` | `apps/website/components/site/Footer.tsx` |

Both divergences predate Phase C and neither is on a Validation Studio path.
They are **recorded, not repaired**: Phase C deploys only the components it
changes, and deploying a service to turn a parity line green is precisely the
substitution of appearance for correctness this programme exists to prevent.

They are, however, real preflight input — §8 of the preflight model treats
deploy parity as a `DEGRADED` signal, not a silent pass.

## 7. Rate-limit budget

`application-submit` is 30 per 24 h per IP, sliding. Read from the Redis ZSET
scores (not the key TTL, which is a different and misleading number):

```
rl:application-submit:ip:<owner /64>   25 entries in the trailing 24 h
```

One of those 25 is the C.1 runtime proof in §8. The limiter was not bypassed,
not reconfigured, and not routed around: `APPLICATION_SUBMIT_RATE_LIMIT_BYPASS=0`.

## 8. The Phase B defect is closed

See [29](29-phase-c-application-root-cause.md). Summarised here because it is
part of the ground truth Phase C stands on: the Sandbox gateway at `1bf03679`
now refuses an incomplete application and names every missing field.

```
POST /v1/merchant/applications   {business_name, email, terms_accepted, desired_handle}
→ 400 VALIDATION_ERROR
  "these required fields are missing: category, phone, nif, province,
   municipality, address, legal_representative, representative_role,
   business_activity"

POST /v1/merchant/applications/check-handle {"handle":"vl019probe"}
→ {"available": true}          ← the refused submission reserved nothing
```

## 9. What is NOT true yet

Stated explicitly, because the rest of Phase C is measured against it:

- There is no `/validation` route in BANZADMIN.
- `services/admin-api` serves no validation endpoint.
- No Validation Run has ever been created, in any state.
- No GOLDEN or FULL profile has been executed.

The six `validation.*` capabilities exist in
`services/admin-api/internal/auth/rbac.go` and are wired into the role table —
that is the whole of the control plane today.
