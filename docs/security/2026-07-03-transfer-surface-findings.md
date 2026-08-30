# Transfer Surface — Secondary Findings

Version: 1.1
Date: 2026-07-03 (findings) · 2026-08-30 (resolution)
Source: Sandbox transfer E2E verification (wallet-native consumer P2P path)
Status: **RESOLVED** — both findings closed by the security audit; see the
resolution notes below and `BANZAMI_SECURITY_AUDIT.md` (SEC-015 / SEC-018).

These findings were surfaced while validating the canonical wallet-native
Sandbox transfer path end-to-end. The validated consumer path itself is correct
and complete (atomic double-entry, idempotent, synchronous `COMPLETED`, no
webhook, official receipt). Neither finding was changed in the validation
workstream — they are logged here for separate review.

---

## A. SDK / public-surface alignment — product & documentation decision

**Observation.** Two outer surfaces reach the same core `TransferEngine.send`:

- **Wallet-native consumer path** (validated, mobile experience): consumer JWT →
  public-api `POST /v1/transfers`, recipient addressed by **`@banza` handle**.
- **Id-based SDK/gateway path**: `sendTransfer(senderId, recipientId)` →
  gateway `POST /v1/transfers`, addressed by raw **consumer wallet IDs**,
  authenticated by a **merchant principal**.

**Decision needed.** Treat the surface split as a product + documentation
alignment decision. The public Developers documentation describes only the
wallet-native (`@banza`) model. **Do not document the id-based SDK transfer path
publicly** until its intended audience and contract are reviewed and agreed.

**Priority.** Normal. Not a blocker for the current Sandbox documentation.

**RESOLVED (2026-08-30).** The surface split no longer exists to align: the
id-based gateway path was removed entirely, so there is one transfer surface —
the wallet-native consumer path — and it is the one the public documentation
already describes. `apps/website/.../p2a-artifacts.test.ts` keeps `/v1/transfers`
on its forbidden-token list for public developer artifacts.

---

## B. Merchant-principal authorization boundary — high priority

**Observation.** On the id-based gateway transfer path, the handler reads
`sender_id` / `recipient_id` from the request body and does not bind them to the
authenticated principal or enforce a transfer-specific scope. The current gate is
the **sender's KYC** (fail-closed compliance check). In effect, a merchant
principal may be able to initiate transfers between arbitrary consumer wallet IDs.

**Why it matters.** With no per-transfer ownership binding, the merchant-principal
credential is broader than a "move value between accounts you control" contract
implies. In Sandbox this is acceptable for integration testing (virtual balances,
isolated stack). For real money it is not an acceptable final model.

**Action.** Open a **high-priority authorization / security review** of the
id-based gateway transfer path. Define and enforce the intended ownership/scope
model (which principal may move which wallets' funds).

**Blocker.** This is a **hard blocker before**:
- any **Live** activation of the transfer path, and
- any **public SDK transfer documentation**.

Do not silently accept the current behaviour as the production model.

**RESOLVED (2026-08-30) — the behaviour was not accepted; the surface was removed.**

The ownership model this finding asked for turned out not to exist, and could not
be invented honestly: a consumer-to-consumer transfer has two consumer
participants and no merchant party, so there is no wallet a merchant principal
legitimately controls in that operation. Rather than add a `merchant_id` to the
transfer model purely so a merchant route could pass an ownership check — which
would have changed the financial model to serve an authorization problem — the
whole `/v1/transfers` group was removed from the merchant surface:

- `POST /v1/transfers` — a merchant could name ANY `sender_id` and move that
  consumer's money. The sender-KYC gate did not constrain this: it authorised the
  sender named in the body, never the caller.
- `GET /v1/transfers/{id}` — read any transfer (audit finding SEC-015).
- `GET /v1/transfers?consumer_id=` — read any consumer's entire history.

The capability was not relocated, because the correct surface already existed:
public-api derives the sender from the authenticated consumer token and restricts
a read to the transfer's own sender or recipient (the RA-022 fix).

Guarded by `TestMerchantSurface_P2PTransferRoutesNotMounted`, a route-table
assertion proven to fail if any of the three routes is re-mounted.

---

## Not in scope of this record

No transfer-domain code was changed. The validated consumer path, its E2E
fixture (`tools/e2e/`), and the Sandbox documentation update are tracked in their
own commits.
