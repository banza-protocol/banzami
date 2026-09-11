# Sandbox transfer E2E

Reproducible, **guarded** proof of the wallet-native consumer P2P transfer path —
the same path the mobile Banzami experience uses — without touching real money,
production config, or any live wallet.

## The path proven

```
consumer JWT
  → public-api  POST /v1/transfers   (recipient = @banza handle)
      → core     POST /internal/v1/consumer/transfers  (send_p2p)
          → TransferEngine.send  — one PostgreSQL transaction:
              lock sender wallet · check sufficiency · double-entry ledger
              (DEBIT sender:available, CREDIT recipient:available) · COMPLETED
```

Transfers are **synchronous and instant**: the response IS the confirmation
(`status: COMPLETED`). There is no separate settlement step and **no webhook** —
the recipient receives only a best-effort push. Balances are always
ledger-derived (never a stored or app-computed field).

## What the runner asserts

- valid transfer → `COMPLETED`, sender debited and recipient credited **exactly once**, amount + currency preserved;
- official **receipt PDF** available (`/v1/consumer/transactions/{id}/receipt.pdf`);
- **idempotency replay** (same `idempotency_key`) → the *same* transfer, no second movement;
- every **negative** rejected with the right code — `INSUFFICIENT_FUNDS` (422), `RECIPIENT_NOT_FOUND` (404), `SELF_TRANSFER_NOT_ALLOWED` (400), `INVALID_AMOUNT` (400), `UNSUPPORTED_CURRENCY` (400), `MISSING_FIELD` (400), `UNAUTHORIZED` (401);
- **atomicity**: after every negative, both balances are exactly intact (no partial debit/credit).

## Safety boundaries (`transfer-guards.mjs`, unit-tested)

- **Inert by default** — nothing runs unless `BANZAMI_E2E=RUN`.
- **Sandbox host only** — the base URL must be the Sandbox consumer surface; a
  live host aborts before any request.
- **Tagged test handles** — only `e2e…` handles are registered.
- **Nominal amounts only** — capped well below any meaningful sum.
- Registered consumers are Sandbox accounts with **virtual** balance; their JWTs
  self-expire. No secret is printed.

## Run

```bash
# unit tests for the guards (no network)
node --test tools/e2e/transfer-guards.test.mjs

# full live E2E against the Sandbox consumer host
BANZAMI_E2E=RUN node tools/e2e/transfer-sandbox-e2e.mjs
# optional override:
#   BANZAMI_E2E_CONSUMER_BASE=https://sandbox-api.banzami.com/consumer
```

## Surfaces (audit note)

The wallet-native consumer path above (handle-based, consumer JWT) is what the
mobile app and this E2E use. The SDK `sendTransfer(senderId, recipientId)` maps
to the **id-based** gateway surface (`/v1/transfers`, merchant-key principal,
plus a sender-KYC compliance gate) — a different outer surface that funnels into
the **same** `TransferEngine.send`. Both are Sandbox-validated at the engine
level; the public documentation should describe the wallet-native model.

## Proof references are exact (`security/proof-reference-canonicality.mjs`)

Read-only. Given one real SECURE_V1 reference (ending in `0` or `1`) in
`PROOF_REF`, asks the public API and `banzami.com/r/` about it and about ~30
altered spellings — the letter O for a 0, lower case, look-alike Unicode, other
dashes, whitespace and invisible characters, percent-encoding tricks, broken
structure. Only the exact reference may verify; no alias may redirect; request
order must not change a verdict. The reference is printed masked.

```bash
PROOF_REF=BZM-… node tools/e2e/security/proof-reference-canonicality.mjs
```

Its server-side twin, section 6 of `tests/phase0/proof-lookup-assurance.sh`,
alters every stored proof's reference the same way from inside the Sandbox.
