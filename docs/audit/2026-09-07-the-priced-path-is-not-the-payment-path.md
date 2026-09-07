# The priced path is not the payment path

**Date:** 2026-09-07
**Found while:** preparing the 200-bps economic E2E (§20) and the DOA
post-cutover proof (§21).
**Status:** verified on the deployed Sandbox. Reported, not unilaterally fixed —
see *What I did not do*.

---

## The finding in one line

Banzami's consumer payment rail does not consult the Pricing Engine at all, so
no payment has ever been priced — and no amount of correctness in the pricing
authority work changes that, because it protects a path nothing drives.

---

## What the deployed Sandbox actually contains

| table | rows |
| --- | --- |
| `transfers` | **263**, totalling **55 493 000** minor units |
| `transactions` | **0** |
| `transactions` with status `CAPTURED` | **0** |
| `operator_fees` | **0** |
| `app_settlements` | **1**, and it is `FAILED`, fee 0, no pricing rule |

554 930 Kz has moved. The operator fee has been resolved zero times.

## Why

There are two ways money reaches a merchant, and only one of them is priced.

**The priced path** is `core/transactions`: create → authorize → **capture**.
Capture is where the Pricing Engine is consulted, where `operator_fees` is
written, and where the refusal added in this programme lives. It is reachable
only through `POST /internal/v1/transactions/{id}/capture`.

Nothing calls it. `services/admin-api/internal/service/core_client.go` defines
`CaptureTransaction`, and that method has **zero callers** anywhere in the Go
services. Inside Core, the only caller of `TransactionEngine::capture` is its
own HTTP route and its own tests.

**The actual path** is `core/transfers`:

- a pay link is paid by `SendTransfer`
  (`services/public-api/internal/handler/payment_links.go:128`);
- a payment session is marked paid **by transfer id**
  (`core/api/src/routes/payment_sessions.rs` — `settle_by_interface` takes a
  `transfer_id`);
- `core/transfers/Cargo.toml` does not depend on `banzami-pricing` at all.

So the QR / pay-link / payment-session rail — the one CLAUDE.md §2.7 calls the
primary rail, `Consumer Wallet ──ledger transfer──▶ Merchant Wallet` — moves
money without ever asking what it should cost. This is not a missing rule. It
is a path that does not price, by construction.

## What this means for the work just done

It does **not** mean the pricing-authority work was wasted, and it should not be
read that way:

- **Application settlement is priced and is publicly reachable.** The refusal
  there is real protection on a live surface. That surface has one historical
  row and it failed, so nothing has been repriced.
- **Capture is now correct.** The refusal, the 409, the explicit-zero
  distinction — all of it holds the moment the payment rail is wired to it.
- The **indirect-authority hole** (`fee_policy_ref`) was on the settlement
  request, which is reachable today. That fix was not theoretical.

What it does mean:

- **"Banzami charges 200 bps on donations" is not true today.** DOA is assigned
  `sandbox-donation-200`, and the assignment is correct and generic — but a
  donation is paid as a transfer, and transfers are not priced. The 200 bps can
  only appear on an application settlement.
- **§20 cannot be satisfied through a payment.** A 100 000 → 2 000 → 98 000
  proof has no payment path to run on. It has to run on a settlement, and the
  brief should say which.
- **§21's DOA proof has the same constraint**, for the same reason.

## What I did not do

I did not wire the fee into the transfer rail.

Charging on transfers changes how value is taken from every consumer payment in
the network. Under CLAUDE.md's protocol-first rule that is a new financial
behaviour, not operator-local policy, and it starts as an ADR in `~/banza` — not
as a change I make while closing a CI gate. It also interacts with P2P: the same
engine moves consumer-to-consumer money, and pricing it without deciding that
question would silently start charging people for sending money to each other.

The decision of *whether payments should be priced at the transfer rail, and
which transfers* is the owner's, and probably the protocol's.

## Method

All of the above is source-level and DB-level fact on the deployed Sandbox, not
inference:

- `grep` for every caller of `capture` in `core/` and `services/`;
- `core/transfers/Cargo.toml` checked for a pricing dependency (absent);
- the pay-link and payment-session code paths read end to end;
- row counts read directly from `banzami_staging` on the Sandbox host.
