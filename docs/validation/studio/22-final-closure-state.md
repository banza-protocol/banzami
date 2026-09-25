# Final closure ledger

**Version: 1.0**

The one open workstream: resolve S03 and S18, then earn an authoritative FULL
PASS. This file is the ledger, not an audit. Every number here was read live at
the timestamp it carries and must be re-read before it is acted on.

## Ground truth — read 2026-09-25T02:27Z

```text
SOURCE_REVISION            27b74b67
WORKTREE_STATE             clean, in sync with origin/main
DEPLOYED_REVISION          all 10 components match this tree (parity proven)
SCHEMA_HEAD                166
ACTIVE_VALIDATION_RUNS     0

APPLICATION (runner)       30/30 used · 0 free · 20 required   ← BLOCKING
APPLICATION (vm)            1/30 used · 29 free ·  2 required
WORKSPACE_ACTIVE            0/10 used · 10 free ·  2 required · OPEN
WORKSPACE_24H_CREATION      6/20 used · 14 free · 14 required · OPEN
AGGREGATE_FUNDS            22 305 100 of 50 000 000 · 27 694 900 available

BUSINESS_AUTH (BFF)        bzweb:rl:auth:business:<ip> · 12 per 10 min, fixed
                           window · readable live, zero keys when idle
```

## S03-BIZ-003

Failed `BZV-20260924-0001` with `SEMANTICS_ACTIVATION_TIMEOUT` — engine ready in
452 ms, no `flt-semantics` node in 20 s, **one** dispatch.

The driver now separates the two opposite failures that message used to cover:
placeholder still present means the app never took the activation
(`ACTIVATION_IGNORED`); placeholder gone means it took it and rendered no
accessible node (`ACTIVATION_ACCEPTED_TREE_EMPTY`). One dispatch is the shape of
the second. Both states are proven in the driver selftest.

```text
S03_TARGETED               NOT RUN — needs one application submit
S03_CLASSIFICATION         instrumented, not yet observed
```

## S18-PAR-003 — root cause proven, journey not yet re-run

### The experiment that settled it

The earlier sweep was retracted: five scales, one sign-in each, ascending, and
order could not be separated from scale. This one can.

```text
PAIR A   1.00×  login ✓  nav ✓  13/0        limiter 0→2 of 12
         1.50×  login ✓  nav ✗              limiter 2→4 of 12

PAIR B   1.50×  login ✓  nav ✗  FIRST RUN   limiter 4→6 of 12
         1.00×  could not run — application quota exhausted
```

Pair A is a clean pair: both logins succeeded, the limiter was read before and
after each run and never approached its bound, and only the scale differed.

Pair B ran the failing scale **first**, which is what kills the alternative
explanation — "the first run passes and the rest are rate limited" cannot
produce a first run that fails. Its control did not run, so the pair is
incomplete as a pair; it is kept for the order evidence only.

```text
ENVIRONMENT_VALID          YES — both pair-A logins reached Home
CONTROL_VALID              YES for pair A
ORACLE_VALID               YES — arrival, not click resolution
CONFOUNDERS_KNOWN          YES — limiter measured at every step
ORDER_CONTROLLED           YES — the failing run was first in pair B
RESULT_INTERPRETABLE       YES
```

### The cause, proven by mechanism

`BanzamiPrimaryButton` and `BanzamiActionTile` wrap their `GestureDetector` in
`Semantics(button: true, excludeSemantics: true)`. `excludeSemantics` removes the
detector's own semantics, and neither node declared `onTap`. No `Semantics` node
anywhere in the codebase declared a tap action.

On Flutter Web that node is a transparent DOM overlay above the canvas.
Activating it dispatches a semantics action; with none registered nothing
happens, and a tap only works when it happens to fall through to the canvas at
the control's real position. As accessibility text scales, the layout moves and
that coincidence stops holding.

This was proven **by the mechanism, not by the symptom**: widget tests activate
the semantics node — what a screen reader and the web overlay both do — and fail
on the unfixed code for both components, pass with the fix, and fail again when
the fix is removed. The measured geometry agrees: the semantic box stays 276×45
at every scale while the layout beneath it moves, and at 1.75× and 2.00×
`elementFromPoint` at the box's own centre already returns `flutter-view` rather
than the node itself.

```text
ROOT_CAUSE                 semantics node announces a button and carries no
                           tap action (excludeSemantics with no onTap)
AFFECTED_WIDGETS           BanzamiPrimaryButton, BanzamiActionTile
FIX                        onTap on both Semantics nodes; disabled buttons
                           still expose none
SOURCE_REVISION            27b74b67
DEPLOYED_REVISION          27b74b67 (app-frontend), parity proven
MECHANISM_PROOF            apps/mobile/test/semantics_tap_action_test.dart
                           mutation-proven both ways
S18_TARGETED_JOURNEY       NOT RUN — needs one application submit
```

## The blocker

```text
BLOCKER                    APPLICATION_CAPACITY (runner bucket)
CURRENT_USAGE              30/30
REQUIRED_CAPACITY          20 free (10 planned + 10 reserve, unchanged)
NEXT_USEFUL_TIME           2026-09-26T01:32:58Z
```

Self-inflicted, and worth recording as such: the S18 diagnosis spent it, one
application submit per probe run. `provisionBusiness` accepts `BZ_BIZ_HANDLE` to
reuse a Business and skip the submit entirely — the reuse contract exists for
exactly this — and it was not used. The next diagnostic campaign reuses a
fixture; provisioning a fresh Business per probe is spending the run's capacity
to answer a question.

## What happens when the window opens

1. Re-read all four capacity families and the BFF auth limiter. No number in
   this file is authority by then.
2. Provision **one** Business and reuse it via `BZ_BIZ_HANDLE` for every
   targeted run.
3. `S03_TARGETED` — record dispatch count, placeholder before and after, node
   count, and the driver's classification. Do not infer.
4. `S18_TARGETED` — pair A shape again at 1.00× and 1.50× against the deployed
   fix, plus 1.25×, 1.75× and 2.00× while the fixture is live.
5. Sibling controls on Receber under large text — `Partilhar QR` is a
   `BanzamiSecondaryButton` and was not part of the fix; check it did not
   regress and whether it shares the defect.
6. `make check-validation`, parity, then re-derive FULL readiness from live
   authority and run a new FULL.

```text
FULL_RETRY_ELIGIBLE        NO
REASON                     S03 and S18 targeted runs are unrun, and the
                           application window cannot yet satisfy the reserve
```
