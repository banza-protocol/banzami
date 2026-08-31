# Stage E1.3A — QR payment authority, environment safety, Sandbox KYC

- **Date:** 2026-08-31
- **Runtime:** `4430e62db9c2` · **Verdict: CAP-PAY-003 remains HOLD**

No tokens, PINs, OTPs, storage credentials or KYC document contents appear here.

---

## RA-053 — CONFIRMED, then closed by removing the surface

The authority question had a documented answer that the code did not implement.

| Source | Says |
|---|---|
| Flutter SDK `ConsumerPublicClient` | *"[payer] is the authenticated consumer's @banza handle"*, targets the consumer surface |
| Consumer surface (public-api) | **no `/v1/qr/pay` route exists** |
| Gateway | route mounted behind `RequireMerchant`, `payer` accepted as free text |
| Core | resolves `payer` handle → wallet; **no caller→payer authority check** |
| QR payload | identifies the **recipient** (core: "recipient is the QR owner"), so possession says nothing about the payer's consent |

Nothing in the chain proved the caller could spend the named consumer's money.
**Classified from authority, not exploitability**, exactly as the brief required:
the earlier block was `KYC_REQUIRED`, an *eligibility* control. It answers whether
a customer may transact at all, never whether this caller may spend that
customer's money — and using the first as evidence for the second is how this sat
"undetermined" for a whole stage.

**Fix:** route removed from the merchant surface, following SEC-015 — where the
same shape was resolved by withdrawing a wrongly-exposed merchant surface rather
than inventing a `merchant_id` on the financial model. Inventing a consent
capability to justify this endpoint would have been the same mistake; the protocol
defines no such delegation.

Verified on the deployed Sandbox: the arbitrary-payer call is unreachable and the
victim's balance is unchanged. Guarded by a route-table assertion — a handler
returning 403 can be re-mounted by accident; a route absent from the table cannot
be reached — plus a companion test that QR issuance and decode remain mounted.

**Consequence:** QR execution has no correct surface until the consumer-side route
is built per the SDK contract. That is why CAP-PAY-003 stays HOLD, and it is a
clearer reason than the previous one.

## RA-051 — second live instance found and fixed

The environment sweep found the registration test-balance grant gated on
`Environment == "SANDBOX"` while deployments set `sandbox`. Every consumer
registered in the Sandbox started at **zero**, silently — a skipped grant is
indistinguishable from a grant of nothing. That is why the RA-053 victim had to be
funded by hand.

Verified after deploy: registration now yields **1,000,000 minor**.

## RA-055 — the environment pattern itself (open)

14 raw string comparisons decide environment behaviour across services, in at
least four conventions: `!= "SANDBOX"`, `== "sandbox" || == "SANDBOX"`,
`!= "sandbox" && != "live"`, `== "production"`. Two live functional defects have
already been traced to it.

**Not done here:** a single canonical typed environment with fail-closed parsing,
which is the real fix. Scattering `EqualFold` further would spread the pattern
rather than close it. The audit and the two functional repairs were done; the
refactor is recorded as open with the remaining sites listed.

## RA-054 — the authorization pattern itself (open)

Four confirmed occurrences of one shape: SEC-015, RA-047, RA-049, RA-053. A sweep
of merchant-JWT handlers lists five more routes accepting identity fields in the
body that have **not** been verified — `payouts` and `transactions` move money and
should come first. They are **not** claimed defective: each confirmed instance so
far needed two real merchants to settle.

## RA-052 — Sandbox KYC (open, unchanged)

Consumer KYC still cannot complete: case opens, evidence upload returns
**503 STORAGE_NOT_CONFIGURED**, submit fails incomplete. Configuring object
storage requires provisioning a Sandbox bucket and credentials — an infrastructure
action outside this repository, and one I will not fake with a stub that pretends
evidence was stored. **Not attempted.**

Note this is now the *second* reason CAP-PAY-003 cannot execute, and no longer the
binding one: even with an approved payer there is no authorised route to pay a QR.

## Suites

| Suite | Result |
|---|---|
| CAP-PAY-001 | **24/24 PASS** |
| CAP-PAY-002 | **38/38 PASS** |
| CAP-PAY-003 (partial) | **26/26 PASS** — execution excluded, `promotable: false` |

## Stage E2 dependency analysis

**CAP-REFUND-001 — depends on a settled payment.** Refund sources are
`ACQUIRING_PAYMENT`, `DYNAMIC_QR`, `STATIC_QR`, `PAYMENT_LINK`, `TRANSACTION`.
Every one requires a completed payment first, and the consumer-authenticated
payment-link path (`POST /consumer/v1/payment-links/{slug}/pay`) faces the same
compliance gate as QR did. So refunds inherit RA-052, not the QR surface defect.
**It is not independent.**

**CAP-WEBHOOK-001 — independent.** Dispatched events are `payment.completed`,
`payment_link.paid` and `payout.sent`. `payment_link.paid` is emitted by
`POST /v1/payment-links/{id}/mark-used`, which is merchant-authenticated on the
merchant's own link and requires no consumer, no KYC and no settlement. Signature,
delivery, retry and endpoint lifecycle can therefore be evidenced end to end
without a financial transaction. **This is the correct next capability.**
