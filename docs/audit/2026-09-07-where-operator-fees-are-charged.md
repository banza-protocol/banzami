# Where operator fees are charged

**Date:** 2026-09-07
**Found while:** preparing the 200-bps economic E2E and the DOA post-cutover
proof.
**Status:** the measurements below are verified on the deployed Sandbox. The
conclusion I first drew from them was wrong, and is corrected here — see
*Correction*.

---

## Correction

I originally filed this as a defect titled "the priced path is not the payment
path", on the reasoning that a payment reaching a merchant without an operator
fee must be a gap.

That reasoning was wrong. The owner's decision states the canonical model, and
the measurements below are that model working as designed, not evidence against
it:

> Transfer stays a **neutral money-movement primitive**, because the same Core
> capability carries merchant payments and P2P. Operator fees apply only at
> explicitly fee-bearing economic operations.
>
> **PAYMENT / DONATION** → gross value enters the merchant or campaign Wallet
> Account.
> **SETTLEMENT / WITHDRAWAL** → the operator pricing policy is resolved, the fee
> is charged, the net leaves.

So `sandbox-donation-200` on DOA means an eligible **settlement** is priced at
200 bps. It does **not** mean an incoming donation loses 2%. Attaching pricing
to the generic transfer primitive is explicitly forbidden: it would silently
start charging people for sending money to each other.

The rest of this document is kept because the measurements are useful and the
reasoning is worth being able to re-check. What changes is the conclusion.

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

## Why — and why that is correct

There are two ways money reaches a merchant, and only one of them is priced.
Under the canonical model that is the design, not an omission.

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
money without asking what it should cost. That is deliberate: the primitive is
shared with P2P, and an operator fee inside it would apply to both.

The fee is charged one step later, when the merchant settles or withdraws.

## What this means for the work just done

The pricing-authority work stands, and matters at the operations that are
fee-bearing:

- **Application settlement is priced and is publicly reachable.** The refusal
  there is real protection on a live surface. That surface has one historical
  row and it failed, so nothing has been repriced.
- **Capture is now correct.** The refusal, the 409, the explicit-zero
  distinction — all of it holds the moment the payment rail is wired to it.
- The **indirect-authority hole** (`fee_policy_ref`) was on the settlement
  request, which is reachable today. That fix was not theoretical.

What it does mean, restated correctly:

- **"Banzami charges 200 bps on donations" is the wrong sentence**, and this
  document previously used it. The accurate one: an incoming donation credits
  the campaign Wallet **gross**, and an eligible **settlement** of those funds
  is priced at the owner's assigned rate. DOA's assignment is correct and
  generic; what it governs is the settlement.
- **The 100 000 → 2 000 → 98 000 proof belongs on a settlement**, not on a
  payment. The payment leg credits 100 000 gross and must not be expected to
  credit 98 000.
- Any assurance wording that says donations are charged 200 bps is overstating
  commercial semantics and has to be corrected wherever it appears.

## What I did not do, and must not

I did not wire the fee into the transfer rail, and that is now a standing
constraint rather than a deferral.

Forbidden, explicitly: any hidden policy inside the generic transfer primitive,
including `if destination is a merchant then charge` or anything equivalent. The
primitive also carries P2P, so economic semantics belong at the higher-level
operation that is genuinely fee-bearing — capture, settlement, payout — and
nowhere else.

The instinct that produced the original version of this document is worth
naming, because it is a plausible mistake to repeat: seeing money reach a
merchant without a fee and concluding something is broken. The fee is one step
later. Checking where a fee is *supposed* to be charged is part of reading the
measurement, not an afterthought.

## Method

All of the above is source-level and DB-level fact on the deployed Sandbox, not
inference:

- `grep` for every caller of `capture` in `core/` and `services/`;
- `core/transfers/Cargo.toml` checked for a pricing dependency (absent);
- the pay-link and payment-session code paths read end to end;
- row counts read directly from `banzami_staging` on the Sandbox host.
