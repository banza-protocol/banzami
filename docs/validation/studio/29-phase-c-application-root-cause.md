# 29 — Phase C.1 — the Business application root cause

Version: 1.0
Status: Closed. Fixed, tested, mutation-proven, deployed and proven in runtime.

---

## 1. The symptom Phase B hit

Provisioning `B01`–`B03` (B10) repeatedly produced applications that reached
`INFORMATION_REQUIRED` and stopped there. The handle each one had reserved stayed
reserved for 30 days, and `Resubmit` could not rescue them because an
application's fields are immutable after creation — so each attempt burned a
handle, a rate-limit slot, and 30 days of that handle's availability.

VL-019 recorded the visible half: `Reject` refused to act on
`INFORMATION_REQUIRED`, so an application in that state had **no terminal
transition at all**. That was fixed in Phase B (`0f08c2cd`) and the stuck
handles were released.

This document closes the other half: **why they got there.**

## 2. The root cause

`services/api-gateway/internal/service/merchant_applications.go`, before this
change:

```go
if in.BusinessName == "" || in.Email == "" || !in.TermsAccepted {
    return "", ErrApplicationIncomplete
}
```

Three fields. The operator publishes **thirteen** as mandatory, from
`BusinessApplicationPolicy`, and serves them at
`GET /v1/merchant/application-requirements` — the same policy the public form
renders.

So the submission path did not enforce the policy the submission was published
under. An application could be created, reserve a handle, and enter review
without a NIF, address, province, municipality, category, business activity,
phone, or legal representative — that is, without the fields an approval
decision is actually made from. The reviewer's only available move was to ask
for information, and asking for information was a state with no exit.

**The defect was not in the reviewer's workflow. It was that the system accepted
an application it could never approve.**

## 3. The fix

Completeness is now derived from the same source as the published requirements,
so the two cannot drift:

```go
// services/api-gateway/internal/service/business_requirements.go
func MissingSubmissionFields(in MerchantApplicationInput) []string
```

It walks `BusinessApplicationPolicy` — one policy, one derivation, two readers
(the requirements endpoint and the submission gate).

Documents are deliberately excluded. They are uploaded *after* the application
exists (`POST /v1/merchant/applications/{id}/documents/upload-url` needs the id)
and are enforced at approval. Requiring them at submission would be
unsatisfiable by construction.

The error names what is missing:

```go
type IncompleteSubmissionError struct{ Missing []string }
// errors.Is(err, ErrApplicationIncomplete) still holds
```

Order is load-bearing: the environment check runs first, so an undeclared
environment is still reported as an undeclared environment rather than as a
list of fields.

## 4. Mutation proof

Restoring the old three-field check makes the new test fail for exactly the
right reason — not merely fail:

```
--- FAIL: TestSubmit_EveryMandatoryFieldIsEnforced
    omitting legal_representative was accepted: <nil>
    omitting representative_role  was accepted: <nil>
    omitting nif                  was accepted: <nil>
    omitting province             was accepted: <nil>
    omitting municipality         was accepted: <nil>
    omitting address              was accepted: <nil>
    omitting business_activity    was accepted: <nil>
    omitting category             was accepted: <nil>
    omitting phone                was accepted: <nil>
    omitting terms_accepted  gave no field list
    omitting email           gave no field list
    omitting business_name   gave no field list
--- FAIL: TestSubmit_AnIncompleteApplicationReservesNothing
    an incomplete application was accepted: <nil>
```

Ten fields silently accepted; the surviving three rejected without naming
themselves. That is the defect, reproduced on demand.

`TestMissingSubmissionFields_CoversEveryPolicyField` is the second half of the
proof: adding a mandatory field to the policy without teaching the submission
gate about it fails the suite.

## 5. Tests

Added to `merchant_application_lifecycle_test.go`:

| Test | Asserts |
|---|---|
| `TestSubmit_ACompleteApplicationIsAccepted` | the gate does not over-reject |
| `TestSubmit_EveryMandatoryFieldIsEnforced` | each policy field, omitted alone, is refused **and named** |
| `TestSubmit_AnIncompleteApplicationReservesNothing` | a refused submission holds no handle |
| `TestMissingSubmissionFields_CoversEveryPolicyField` | policy and gate cannot drift |
| `TestReject_AnApplicationWaitingForInformationCanBeClosed` | VL-019 — the state has an exit |
| `TestReject_ARejectedApplicationIsNotOpen` | and the exit is terminal |

Three pre-existing tests used deliberately minimal fixtures and began failing —
**correctly**, because they were submitting applications the operator would
never approve. Their fixtures were completed via a `completeInput()` helper. The
invariant was not weakened to accommodate them.

## 6. Suite status — honest

`go test ./internal/service/` at this change: **6 failures, all
`TestReceipt_*`.**

Proven pre-existing by stashing the entire change set and re-running on the
clean tree: the identical six fail, with the identical constraint error
(`consumers_active_display_name_present` on a seed INSERT — local test-database
schema drift, not a product defect and not caused by this change).

The suite is **not** green, and is not reported as green.

## 7. Runtime proof

Sandbox gateway at `1bf03679`, through the public edge, through the limiter:

```
POST https://sandbox-api.banzami.com/v1/merchant/applications
{"environment":"SANDBOX","desired_handle":"vl019probe",
 "business_name":"Validation Probe VL-019",
 "email":"...","terms_accepted":true}

→ HTTP 400
{"code":"VALIDATION_ERROR",
 "message":"these required fields are missing: category, phone, nif, province,
            municipality, address, legal_representative, representative_role,
            business_activity"}
```

and the handle it tried to take was never taken:

```
POST /v1/merchant/applications/check-handle {"handle":"vl019probe"}
→ {"available": true}
```

The probe consumed one of the 30/24 h allowance, through the front door. No
bypass, no alternate IP, no VM egress, no direct insertion.

## 8. What this unblocks

`B01`–`B03` are already provisioned, so this fix does not rescue them — they
were rescued by hand in Phase B. What it changes is that the *next* Business
application, from a Validation Actor or from a real Angolan merchant, either
arrives approvable or is refused at the door with the reason stated.
