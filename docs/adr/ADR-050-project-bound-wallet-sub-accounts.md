# ADR-050 — Project-bound wallet sub-accounts for developer credentials

- **Status:** Accepted — gateway + scopes implemented; SDK, docs and deployed E2E pending
- **Date:** 2026-09-04
- **Programme:** BANZAMI-SANDBOX-RELEASE-ASSURANCE-001 / Developer Platform
- **Layer:** Banzami operator authority policy. **Not** BANZA protocol.
- **Supersedes in part:** ADR-047 §4 (which rejected *every* client-supplied payee field)

## Context

ADR-047 gave a Console Project a single bound payee and refused any
client-supplied payee field outright. That was the right instinct — a client
that can name who receives money has been handed authority, not configuration —
but it was applied at too coarse a grain, and it conflated two different
questions:

> **Who** is authorised to receive these funds?
> **Which** account belonging to that authorised owner?

Because both were refused together, a developer credential had exactly one
account and no way to segregate funds beneath it.

That is not a theoretical gap. DOA, the reference integration, gives every
campaign its own segregated wallet account (BANZA ADR-042) so donations do not
commingle, and settles a campaign **from its own account** at close:

```
if (!c.banzami_wallet_account_id) return { ok: false, code: 'no_wallet_account' };
sourceAccountId: c.banzami_wallet_account_id,
```

With only a single payee, campaigns would share one balance and per-campaign
settlement would have no source. The available workaround was worse than the
gap: keep a **merchant credential** in the application — precisely the authority
level the Developer Platform exists to stop handing out.

## Decision

Split the two questions and enforce them differently.

**Owner selection stays forbidden.** `merchant_id`, `wallet_id`, `payee`,
`payee_id` and `payee_wallet` are still rejected outright on developer
requests. The owner comes from the project binding and nowhere else.

**Sub-account selection is permitted and verified.** A developer request may
carry `wallet_account_id`. The server loads that account and requires it to
belong to the wallet the binding resolved. Omitting it keeps the previous
behaviour exactly: the binding's default account.

**Wallet accounts become reachable to a developer credential**, on the same
dual-credential group as payments. The wallet is taken from the binding; a
client-supplied `wallet_id` is refused *even when it matches the caller's own*,
because accepting it would make the field look authoritative and the next caller
supplies someone else's. Listing ignores any `wallet_id` and returns only the
bound wallet's accounts.

**Scopes are separate**: `wallet_accounts:read` and `wallet_accounts:create`.
Listing accounts is a far weaker capability than opening one, and neither is
implied by a payment scope.

**A foreign or unknown account reads as `NOT_FOUND`, never `FORBIDDEN`.** A
status code that distinguishes "yours" from "someone else's" is an enumeration
oracle: it would let one project map another's accounts by id alone.

## Authority model

```
Developer Workspace
└── Project
    └── Project financial binding        ← WHO owns the money (server-derived)
        └── Wallet accounts              ← WHICH account within that owner
            ├── Campaign: School A
            ├── Campaign: Hospital B
            └── Campaign: Emergency C
```

An account identifier selects a child resource. It can never confer authority
over the parent owner.

## Defence in depth — Core was already correct

The money-path authority does not rest on the gateway. Core independently
re-validates ownership, and did so before this change:

```rust
// payment session destination
if wa_merchant != merchant_id { return Err(ApiError::forbidden(…)); }
// wallet account creation
if Uuid::parse_str(m).ok() != Some(wallet_merchant) { return Err(ApiError::forbidden(…)); }
```

Because the gateway passes the **binding's** merchant id and never a
client-supplied one, a bypass of the gateway check still meets a Core refusal.
No Core change was required, and none was made — a covering test
(`cross_merchant_rejected`) already exists.

## Consequences

- DOA can be a pure Developer Platform consumer: project-bound authority, with
  per-campaign segregation intact and settlement still sourced from a campaign's
  own account. No merchant credential in the application.
- `CreatePaymentSessionParams.walletAccountId` (optional since SDK 0.5.1) gains a
  second legitimate use: selecting one of the project's own accounts. Omitting it
  still means "the binding's default".
- ADR-047's blanket rejection is narrowed, not abandoned. The security property it
  protected — a client cannot name its payee owner — is unchanged and still
  tested.
- Any future payee-adjacent field must be classified deliberately as
  *owner* (reject) or *child selection* (verify), because the reject-list is now
  a decision rather than a catch-all.

## Alternatives considered

- *Keep a merchant credential in DOA*: rejected — it preserves segregation by
  handing the application authority over an entire merchant, which is the
  problem, not the solution.
- *Collapse all campaigns onto the bound account*: rejected — funds would
  commingle and per-campaign settlement would lose its source. A configuration
  target is not worth a financial regression.
- *A second wallet system scoped to projects*: rejected — duplicating a
  financial primitive to avoid an authority question is how two sources of truth
  are born.
- *Allow `wallet_id` when it matches the binding*: rejected — a field that is
  sometimes honoured teaches integrators that it is meaningful, and the
  validation becomes the only thing standing between that habit and a foreign
  value.
