# Stage E1.4 — RA-054 authority closure · RA-055 environment model

- **Date:** 2026-08-31 · **Baseline HEAD:** `04d1ae6b` · **Runtime at audit:** `4430e62db9c2`
- **Launch gate:** unchanged, **released 7/14** · no capability promoted

No tokens, PINs, keys or secret values appear here.

---

## The pattern, stated once

> A request field that NAMES a resource is a resource selector. It is not
> authority over that resource.

Four historical instances (SEC-015, RA-047, RA-049, RA-053). This stage found
**three more**, all confirmed on the deployed Sandbox with two isolated tenants —
not inferred from source.

The RA-054 prediction held: `payouts` and `transactions` were named as the routes
to audit first, and both were defective.

## RA-056 — cross-tenant fund withdrawal · **critical**

`merchant_id` came from the principal, `wallet_id` from the body, and nothing
compared them.

```
Merchant B → POST /v1/payouts  {wallet_id: <merchant A's wallet>, …}
           → HTTP 201   merchant_id=B   wallet_id=A   → B's own bank account
```

Left PENDING and not processed; the debit happens at processing, which is an
operator step, not a second authorization.

The sharper result came *before* funding A: **422 INSUFFICIENT_FUNDS**. The
endpoint was answering questions about a stranger's balance — so the fix must run
**before** the balance check, or payouts stay a balance oracle.

`GET /v1/payouts/{id}` was independently broken: the gateway passed the
principal's merchant id to a core client that declared the parameter `_` and
dropped it. **HTTP 200** on another tenant's payout, bank destination included.

**Fixed at the financial boundary** (`core/payouts`, `core/transactions`), not
only at the edge — the ledger must not be reachable by a caller that has not
proved ownership of the source of funds. Foreign resources return not-found: a
caller with no authority should not learn an id exists.

## RA-057 — arbitrary consumer debit · **critical**

`POST /v1/payment-requests` and `/{id}/pay` **never read the principal at all.**

```
Merchant B → create(requester=consumer R, payer=consumer V) → 201
           → pay(payer_id=V)                                → 200  status PAID
V's balance: 1 000 000 → 995 000 minor
```

Worse than RA-053, which KYC happened to block: **this path has no KYC gate**, so
it was a missing authorization *and* a compliance bypass. It is the `/v1/transfers`
surface removed under SEC-015, re-implemented under another name.

## RA-058 — consumer balance disclosure · high

`RequireMerchant` proved the caller was *a* merchant, never that it had any
relation to the named consumer. An unrelated merchant resolved a consumer's
wallet by `consumer_id` and read its balance — **HTTP 200** on both.

## Why two surfaces were removed rather than patched

Both have two consumer parties and no merchant party. That is not a missing
ownership field; it is the absence of any relation a merchant principal could be
scoped against. Consumer wallets already exist correctly on the consumer surface;
payment requests do not yet, and inventing a merchant-side consent model to keep
them mounted is exactly what SEC-015 and RA-053 rejected.

## RA-055 — one typed environment

14 raw comparisons · 5 services · **4 vocabularies**. Two live defects came from
it, plus a Sandbox deployment logging *"LIVE mode — real rails active"*.

`services/common/env` parses once. Three properties matter more than the
deduplication:

- **Unknown is the zero value** — an unpopulated field grants nothing rather than
  defaulting into a real environment.
- **Both casings accepted**, because both are already deployed *and stored*.
  Rejecting one to make a point would break running systems.
- **`production`/`development` deliberately NOT accepted** as Live/Sandbox. That
  silent reinterpretation is the failure mode itself; developer-api keeps an
  explicit `IsDevelopment()` for its fixtures gate.

public-api now **fails closed at boot** on an unrecognised value, and its mode
line is derived from the same parsed value as the behaviour it describes — an
unknown environment can no longer be reported as LIVE by falling through an
`else`. **Not a Live gate:** `IsLive()` reports configuration only;
`make check-live-fail-closed` unchanged and passing.

## RA-059 — a silent failure found while testing

The Sandbox registration grant was called as `_, _ =`. It is failing right now,
legitimately: `BANZAMI_PILOT_LIMITS=1` is set on the deployed core and the
Phase-0 funds-in-circulation cap returns 422 once the aggregate is reached —
**this stage's own testing consumed it**. The cap works as designed and was not
touched; the failure is now logged instead of invisible.

## Deliverables

| Artefact | Purpose |
|---|---|
| `docs/security/MERCHANT-AUTHORITY-MATRIX.md` | Every merchant route, **binding site cited**. A row that cannot cite one is unfinished. |
| `tools/e2e/security/ra-054-authority.mjs` | **9/17 against the unfixed runtime** — non-vacuity shown |
| `docs/security/QR-PAY-AUTHORITY-CONTRACT.md` | The contract the replacement route must satisfy; SDK mismatches tracked |

The suite asserts victim **state**, funds the victim first (an empty wallet is
not an authorization control), checks the balance-oracle property separately, and
**reports the strength of its own assertions** when the pilot cap has left the
target consumer at zero.

## Honest gaps

- **RA-054 stays OPEN.** `POST /v1/disputes` cross-tenant behaviour is
  **unproven** — it needs a settled transaction CAP-PAY-003 cannot produce. A
  probe returned 500 carrying "resource not found" (an RA-050-shape defect). Not
  counted as SAFE. `GET /v1/consumers/{id}` enumerates consumers: a design
  question, not a security defect — no financial data, no mutation.
- **RA-052** untouched — external storage dependency, unchanged.
- **One raw comparison left**: `core/compliance/src/pilot.rs` substring-matches
  `"live"`/`"prod"`. Fails safe today; same class, recorded not fixed.
- **`assure-sandbox-runtime` passed while the runtime was stale** — it only
  detects drift when `BANZAMI_SANDBOX_EXPECTED_COMMIT` is supplied. The payment
  suites caught it; the gate did not. The recurring "records validate records"
  shape, worth closing.
- **Nothing is deployed.** The three defects remain live in the public Sandbox
  and CAP-PAY-002/003 could not be re-run — their freshness gate correctly
  refuses a runtime behind HEAD.
