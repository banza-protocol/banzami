# ADR-028 — Application Business Account Requirement

**Status:** Accepted · **Date:** 2026-06-30 · **Scope:** Operator-only (not BANZA protocol)

> Version: 1.0

---

## Context

Apps integrate Banzami to receive money — DOA (donations), Mongo, marketplaces,
ticketing, e-commerce, delivery, NGOs. Each such app **moves value through the
operator**. Without a binding rule, an app could try to receive funds (e.g. an
application fee) into an unvetted destination, or behave as if it were an operator.

This is an **operator concept**, not a protocol one. BANZA defines ledger rules and
contracts; it does not define "an app is a business account." So this ADR lives in
`~/banzami` and adds **no** BANZA ADR. (Per CLAUDE.md §19.2/§Protocol-first: operator
policy stays here.)

## Decision

**Official rule:** *An application that moves or receives money through Banzami =
a validated Business Account in Banzami.*

Every monetised app MUST have, inside Banzami:
- its own `@banza` handle,
- a Business Account (merchant),
- its own wallet(s),
- **KYB approved**,
- its own API keys / credentials (never the operator's generic credentials),
- a fee destination account (for apps that take an application fee),
- its own policies and webhooks where applicable.

### Layering (binding)

```
Client application
        ↓     (consumes operator APIs / SDKs only)
Business Account in Banzami   ← KYB-approved, owns wallet(s) + keys + webhooks
        ↓
Banzami operator              ← the only thing that writes the ledger / moves money
        ↓
BANZA protocol
```

- An app **never** talks to the BANZA protocol directly.
- An app **never** writes the ledger.
- An app **never** moves money directly.
- An app **only** consumes Banzami operator APIs/SDKs.

### Business account type (operator taxonomy)

A new operator-local field classifies a Business Account:

```
business_account_type ∈ { MERCHANT, APPLICATION, PLATFORM, NGO,
                          MARKETPLACE, DELIVERY, OTHER }
```

- Default is `MERCHANT` (backward-compatible — every existing merchant is a plain
  merchant). It is **not** a protocol field and never leaves the operator.
- `APPLICATION` / `PLATFORM` mark apps like DOA that receive value on behalf of a
  flow (campaigns, orders) and may take an application fee.

### DOA worked example

- DOA is the Business Account `@doa` (type `APPLICATION`), KYB-approved.
- The 2% DOA fee lands in `@doa`'s Business wallet (a valid fee destination).
- The campaign net goes to the beneficiary `@banza`.
- Banzami executes the settlement; DOA only **requests** it and consumes the
  `application_settlement.completed` webhook.

### Application Settlement guard

When a settlement carries an application fee, the fee destination MUST be:
1. a Business Account that exists in Banzami,
2. KYB-approved,
3. with an active wallet that can receive funds,
4. and — for an application fee — of a permitted type (`APPLICATION`/`PLATFORM`,
   or explicitly allowed).

Fail-closed: a settlement that cannot satisfy this is rejected, not silently
routed elsewhere.

## Consequences

- It becomes conceptually and technically impossible for a monetised app to exist
  outside Banzami as anything other than a validated Business Account.
- Isolation by Business Account: ownership, audit, no cross-app data access, no app
  sees the internal ledger, no app uses operator credentials.
- The taxonomy is operator-only; the protocol is untouched.

## Alternatives considered
- **Treat apps as a special non-merchant entity**: rejected — duplicates the wallet
  / KYB / keys machinery the merchant model already provides. An app *is* a Business
  Account with a type tag.
- **Encode the type in BANZA**: rejected — it is operator product taxonomy, not a
  financial/protocol concept (CLAUDE.md §Protocol-first).

## Related
- ADR-021 (Application Settlement), ADR-027 (Wallet Accounts), ADR-025 (Brand /
  environment router). DOA readiness: `docs/doa/readiness.md`.
