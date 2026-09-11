# QR payment authority — the contract the route must satisfy

**Status:** design record. No route is implemented by this document.
**Context:** RA-053 (Stage E1.3A), RA-054 (Stage E1.4)

`POST /v1/qr/pay` was removed from the merchant surface because a merchant JWT is
not authority to debit a consumer's wallet and the route accepted the payer as
free text. This records what the replacement must look like, so the capability is
rebuilt correctly rather than re-derived under time pressure.

## Where the three layers currently disagree (§27)

| Layer | State |
|---|---|
| **BANZA protocol** (`~/banza/contracts/qr/lifecycle.json`) | Defines the QR lifecycle and payload. The QR is *"linked to an owner identity"* and *"amount is set by the payer at scan time"* — the owner is the **recipient**, the payer is the scanning party. The protocol is contract-first and defines **no HTTP route**. |
| **Operator consumer surface** (public-api) | **No `/v1/qr/pay` route exists.** |
| **Flutter SDK** (`ConsumerPublicClient`, `consumer_public_client.dart:373`) | Calls `POST /v1/qr/pay` on the consumer surface, documenting `payer` as *"the authenticated consumer's @banza handle"*. |

**The SDK calls a route that does not exist.** That mismatch is tracked here and
left visible. It is not resolved by adding an endpoint to satisfy an SDK test —
the endpoint has to be right, and the SDK's own documented model is the correct
one.

## Required contract

```
POST /consumer/v1/qr/pay          — CONSUMER surface, consumer token
  payer   ← derived from the authenticated consumer token, NEVER from the body
  payload ← the scanned QR, which identifies the RECIPIENT and payment intent
```

Order of checks, each answering a distinct question:

1. **Authentication** — who is calling?
2. **Authority** — the payer *is* the caller, by construction. There is no field
   to forge, because there is no field.
3. **QR validity** — decode, verify status/expiry/single-use.
4. **KYC eligibility** — may this customer transact at all? *(RA-052 blocks this
   in the Sandbox today.)*
5. **Balance** — sufficient funds.
6. **Core execution** — debit payer, credit the QR owner.

Steps 2 and 4 are different questions and neither substitutes for the other.
Treating the KYC block as evidence of an authorization control is what left
RA-053 undetermined for an entire stage.

## Explicitly rejected

- Any merchant-supplied `payer`.
- A delegation or consent model invented to keep a merchant-side route working.
  The protocol defines no such delegation, and inventing one to make a route pass
  an ownership check is the mistake SEC-015 and RA-053 both rejected.
- Possession of the QR payload as authority over the payer. The payload names the
  **recipient**; it carries nothing about the payer's consent.

## Consequence

Until this route exists, QR payment execution has **no correct surface**, and
CAP-PAY-003 cannot be released. That is a clearer blocker than the KYC one it
replaced, and it is the honest reason.

## Related SDK mismatches from the same pattern

| SDK | Calls | Status |
|---|---|---|
| `banzami_flutter` `ConsumerPublicClient` | `POST /v1/qr/pay` | Route unmounted (RA-053) — rebuild per this contract |
| `@banzami/sdk`, `banzami_flutter` | `/v1/consumer-wallets*` | Route unmounted (RA-058) — **withdraw the helpers**; the consumer surface already exposes `GET /v1/me/wallet` |
| `banzami-python` `payment_requests` | `/v1/payment-requests*` with `requester_id`/`payer_id` | Route unmounted (RA-057) — the SDK encodes the broken model and must not be the reason to restore it |

## The receipt of a QR payment (A7-59, 2026-09-12)

Whoever builds this route must set the receipt's channel, not inherit it.

`ReceiptSemantics.ForTransfer` — the derivation every wallet-rail receipt goes
through — produces only two channels today: `HANDLE` and `PAYMENT_LINK`. The one
place that produces `QR` (`ForWalletPayment`) is now reached only by the
historical backfill. A payment settled through a consumer QR-pay route would
therefore be a transfer like any other, and its receipt, PDF and verifier page
would all say "Endereço @banza" for a payment the payer made by scanning.

So the route's definition of done includes: the transfer carries what it was
initiated by, `ForTransfer` derives `QR` from that, and
`receipt-assurance.sh` covers a QR payment end to end. A receipt that names the
wrong channel is not a display bug — the proof is signed with it.
