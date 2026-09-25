# S18-PAR-003 — open classification

**Version: 1.0**

`Business Web under large accessibility text` — the journey that exercises the
whole Business surface at 1.50× browser text.

It has failed the last two FULL runs. This document records what is established,
what was retracted, and what the next experiment must do differently — because a
reproduction that cannot separate its variables produces confident wrong answers,
and this one did for about an hour.

## Status

```text
HISTORICAL_FULL_RESULT        = FAILED
HISTORICAL_EVIDENCE           = PRESERVED

GO_ARRIVAL_ORACLE             = FIXED
GO_FALSE_POSITIVE             = CLOSED

PRODUCT_DEFECT_CONFIRMED      = NO
PRODUCT_DEFECT_DISPROVEN      = NO

ROOT_CAUSE                    = UNRESOLVED
CURRENT_REPRODUCTION          = INVALID / ENVIRONMENT_CONTAMINATED
CONTAMINANT                   = BUSINESS_SESSION_LIMITER

FIRST_FAILING_SCALE           = UNKNOWN
VIEWPORT_DEPENDENCE           = UNKNOWN

FULL_RETRY_ELIGIBLE           = NO
```

The next FULL is blocked because **S18's targeted classification is unresolved**
— not because a product defect is known.

## What is established

`BZV-20260923-0001` and `BZV-20260924-0001` both recorded S18-PAR-003 FAILED.
Those rows are evidence and are never rewritten.

`go()` had a real instrument defect: it tried three tap strategies in order and
returned on the first that did not throw. Playwright's click resolves when it has
clicked an element's box, and a Flutter semantics node is a transparent overlay
above the canvas — so a stale or zero-sized box makes the click land on nothing
and resolve anyway. `BZV-20260924-0001` recorded `tapped via role=button` on a
screen that never changed.

`go()` now takes what arrival looks like and verifies it after each tap. That
defect is closed, and it is closed independently of whatever the remaining
failure turns out to be.

## What was retracted, and why

A five-scale sweep on 2026-09-25 produced:

```text
1.00×  arrived   1.25×  arrived   1.50×  failed   1.75×  failed   2.00×  failed
```

This was read as "the first failing scale is 1.50×" and reported as a confirmed
product defect. It was not.

The five scales ran in ascending order, each with its own Business sign-in. The
sign-in limiter has a short window, and by the third run it was exhausted: every
later attempt stalled on the identifier step, which the harness reported as the
screen failing rather than as the session being refused.

The control that settled it: proof 18 at **1.00×**, run immediately afterwards,
failed in exactly the same way. Base text, same failure — so the variable that
moved was not the text scale.

Order and scale were confounded. The data are consistent with a scale threshold
at 1.50× and equally consistent with "the first run passes and the rest are rate
limited". Neither reading is supported over the other.

## What the next experiment must do

1. **Prove the limiter has recovered** before starting — `AUTH_CAPACITY =
   AVAILABLE`, read, not assumed. "It has probably been long enough" is how this
   dataset was produced.

2. **Eliminate the sign-in as a variable, not merely control it.** If the text
   scale can be changed inside one authenticated session, measure all five
   scales from a single login and the confounder disappears.

3. If a new session is unavoidable, use **isolated pairs**: a 1.00× control
   immediately followed by the target scale, and discard the whole pair if the
   control fails. Alternate the order on later repetitions, so "first run" and
   "1.00×" are never the same thing twice.

4. Record, for every attempt and **before** interpreting any navigation result:
   actor, session, timestamp, limiter state, viewport, and whether the login
   itself succeeded.

5. Classify `PRODUCT_DEFECT` only after at least one clean pair where 1.00×
   passes and the target scale fails under the same conditions — and repeat that
   pair once before treating it as strong.

## The probe

`BZ_S18_PROBE=1` makes proof 18 print the failing control's overlay geometry at
the moment of the tap: its rect, pointer-events, z-index, transform, the
semantics host's own rect, and what `elementFromPoint` finds at the rect's
centre.

It exists because a standalone probe could not sign in at ≥1.25×, so the only
way to observe the control in the state that fails is from inside the journey
that reaches it.

Off by default, and provably inert when off — `check-e2e-harness-regressions`
asserts it records no gate, performs no action, cannot throw out of the journey,
and exists exactly once. Instrumentation that can change a verdict is not
instrumentation; it is a second, undeclared harness.
