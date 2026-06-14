# Banzami — Current State

**Banzami is the first operator built on the BANZA protocol — a wallet-native
payment network for Kwanza.** This is the single current-state summary; it
describes the repository as it is, not how it got here.

## Identity
- **Banzami** — first commercial operator; wallets, QR, payment links, P2P, merchant & consumer apps, SDKs, APIs.
- **BANZA** — the open protocol Banzami implements (`github.com/banza-protocol/banza`). Banzami does not own, govern, or certify it.
- **BanzAI** — BANZA's external knowledge system. Not a Banzami product.

## What lives here (operator only)
| Zone | Contents |
|------|----------|
| `core/` | Rust financial core — ledger, wallets, transfers, QR, settlement, payouts |
| `services/` | Go services — api-gateway, public-api, admin-api |
| `apps/` | mobile, merchant, dashboard, admin, pay, checkout, validation-studio |
| `sdk/` | Banzami integration SDKs — TypeScript, Flutter, Python, PHP, Go, checkout-web |
| `plugins/` | Operator commerce adapters (generic Node/PHP/Laravel) |
| `db/`, `infra/`, `tools/` | Migrations, deployment, internal tooling |
| `docs/` | Operator documentation (see [DOCUMENTATION_MAP.md](../DOCUMENTATION_MAP.md)) |

## What is NOT here (removed)
Protocol contracts, certification/conformance vectors, the `BANZA_REFERENCE.md`
mirror, the public website (`apps/docs`), and all BanzAI/protocol-knowledge
material — these belong to BANZA, not the operator.

## Operational reality (honest)
- **Operational (validated):** double-entry ledger, atomic postings, consumer
  wallets, balance derivation, P2P transfers, `@banza` handle registration/resolution.
- **Planned / in progress:** QR product, merchant apps, Business Dashboard, SDK
  platform, REST API surface, webhooks, observability.
- **Blocked:** EMIS acquiring (real Kwanza in/out), KYC, interbank settlement.
- **Not production-ready.** Real Kwanza cannot yet enter or leave the network; the
  default acquiring provider is **simulated**. The launch gate is the **EMIS rail + KYC**.

Live operator readiness is tracked in the Validation Studio (`docs/validation/` +
`apps/validation-studio`).
