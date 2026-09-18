# 31 — Validation Studio authority separation

Version: 1.0
Status: CANONICAL owner decision, 2026-09-18. Binding for Phase C.

---

## 1. The distinction

```
scenario authority  !=  orchestration authority
```

**`A01` / COMPLIANCE** — acts *inside* a validation scenario, according to
normal product authority. Its responsibilities are product-domain Compliance
actions that validation scenarios require: canonical KYB and review decisions,
taken exactly as a real compliance operator would take them.

**Human SUPER_ADMIN** — controls *whether the Validation Studio may prepare*,
or later initiate, orchestration.

A01 is a **Validation Scenario Actor**, not the authority that controls the
Validation Studio itself. It must not receive `validation.run` merely because it
participates in Studio scenarios. Participating in a scenario and deciding that
a scenario may be scheduled are different powers, and collapsing them would mean
the actor being tested also authorises the test.

## 2. The decision, for Phase C

| | |
|---|---|
| A01 role | remains **COMPLIANCE** — intentional, not an oversight |
| A01 may hold | `validation.view` |
| A01 must NOT hold | `validation.run` |
| A01 must NOT be elevated to | OPERATIONS |
| A01 must NOT be elevated to | SUPER_ADMIN |
| Preparing / cancelling the Phase C proof run | the existing **human SUPER_ADMIN** |
| Step-up on run preparation | remains **enforced** |

No second OPERATIONS actor is to be created during Phase C to work around this
separation. Whether Phase D needs a dedicated least-privilege Validation Studio
operator is a **future architecture decision**, to be justified by the Phase D
execution/runner model rather than introduced pre-emptively.

## 3. RBAC evidence — the refusal that proves it

Recorded because it is positive evidence, not a defect. Observed live against
the deployed Sandbox on 2026-09-18, admin-api `5c6b2ac6`:

| | |
|---|---|
| Authenticated as | `A01` (`admin02@banzami-e2e.test`), via password + TOTP |
| Role | `COMPLIANCE` (`admin_users.role`, read directly) |
| Attempted | `POST /admin/v1/validation/runs` — requires `validation.run` + step-up |
| Result | **`403 FORBIDDEN`** — `"your role is not permitted to perform this action"` |
| `validation_runs` count after | **0** |
| `validation_run_events` count after | **0** |

The capability middleware refused before the handler ran, so the refusal
created nothing — the state machine was never entered, no run reference was
allocated, and no preflight was persisted. The Studio's permission matrix is
enforced by admin-api at request time, not by the sidebar, which is presentation
only and never authority.

## 4. Why this reading is the right one

The alternative — giving A01 `validation.run` because it is "the validation
operator" — would make the Studio self-authorising. The nine actors exist to be
*subjects* of validation. An actor that can also schedule the validation it
participates in is an actor whose PASS means less, because nothing outside the
scenario decided the scenario should happen.

Keeping orchestration with a human SUPER_ADMIN, behind step-up, means every
Validation Run has a person's second factor behind it. That is a stronger
statement than any automated gate, and it costs one deliberate click.

## 5. Consequences already visible

- The Phase C proof run is prepared and cancelled by the human SUPER_ADMIN.
- `TestValidation_RoleMatrix` already asserts `COMPLIANCE → validation.run =
  false`; this decision is therefore machine-enforced, not merely documented.
- A01 keeps `validation.view`, so the operator actor can still *read* the Studio
  — which is what it needs to reason about scenarios it takes part in.
