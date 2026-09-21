# S10 historical residual — canonical recovery

**Operation date:** 2026-09-21 · **Source revision:** 59049d0e ·
**Schema head:** 165

A remediation, recorded separately from the runs that produced the residue.
It does not reinterpret them.

## Why there was a residue

`settlement-economics-e2e.sh` created two consumers through
`/v1/consumer/onboarding/complete`, funded the payer with `GROSS × 3` and let
the beneficiary receive two settlements — and declared neither. Its trap
retires what the manifest names, and the manifest named only the merchants.
Five of the six shell harnesses using that same primitive declared their
consumer. This one did not.

The merchants were cleaned correctly. The defect was never merchant cleanup.

## Targets — four consumers, attributed from ledger events

Attribution is structural: each was resolved from balance movements on
`consumer_wallets.available_account_id` inside its execution's window. No
handle, name or prefix was used to decide what to retire.

| consumer | account | source | balance before |
|---|---|---|---|
| 34183b16-e5bd-40b1-b48d-bb803b984887 | bc4b2cef-868c-4b49-8ea3-6a48a999d25d | BZV-20260920-0001 / S10-SET-002 | 100 000 |
| 16d00906-9040-4457-90d3-461b1a8dae5b | f5302afc-7a73-4a93-9c5a-164fbc96f86f | BZV-20260920-0001 / S10-SET-002 | 196 000 |
| 350ffe52-0420-46a2-8992-e63f27378d1a | 93559ef3-db9f-4b76-bd3c-148ecc2d4377 | diagnostic S10 execution, 2026-09-21 | 100 000 |
| 8b64ee88-273c-4898-ab6f-bd40bdd1450f | f185b17b-1aa4-4e15-848d-37dfe630a691 | diagnostic S10 execution, 2026-09-21 | 196 000 |

The second pair exists because the run that DIAGNOSED the defect also
suffered from it: executing S10 on the repaired transport, before the
harness-level omission was fixed, left its own 296 000 by the identical
mechanism. Recorded here rather than folded into the first pair, because they
came from different executions.

## Action

Canonical lifecycle only, one consumer at a time, verified before the next:

    POST core /internal/v1/sandbox/retire-funds   owner_type=CONSUMER
    POST core /internal/v1/consumers/{id}/suspend

No SQL balance mutation, no manual ledger insert, no compensating posting
invented for this operation. `retire-funds` writes a balanced double-entry
posting against the Sandbox funding source: value returns, none is created or
destroyed.

## Result

| | retired | balance after | terminal status |
|---|---|---|---|
| 34183b16… | 100 000 | 0 | SUSPENDED |
| 16d00906… | 196 000 | 0 | SUSPENDED |
| 350ffe52… | 100 000 | 0 | SUSPENDED |
| 8b64ee88… | 196 000 | 0 | SUSPENDED |
| **total** | **592 000** | **0** | 4/4 canonical |

    aggregate funds   21 362 100 → 20 770 100     delta -592 000
    financial truth   PASS  →  PASS               0 unbalanced postings
    book sum          0     →  0

20 770 100 is the exact baseline BZV-20260920-0001 recorded before it ran —
an independent cross-check that the recovery returned precisely what the two
executions had left and nothing else.

## Historical evidence unchanged

    BZV-20260920-0001   COMPLETED / FAIL      untouched
    S10-SET-002         PASSED / FAILED       untouched

Its cleanup FAILED remains the truth of that execution. The remediation is a
separate, later event and is recorded as one. No validation row was rewritten,
no exposure verdict backfilled.
