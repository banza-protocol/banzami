# Banzami

**Banzami is Angola's instant payment network** — an independent startup building a wallet-native payment operator for Kwanza. Consumers, merchants, and developers send, receive, and accept money instantly through wallets, QR codes, and payment links. Banzami is the first operator built on the open [BANZA](#ecosystem) protocol.

> Website: [banzami.com](https://banzami.com) · Contact: contact@banzami.com · Repository: [github.com/banzami/banzami](https://github.com/banzami/banzami)

---

## What is Banzami?

Banzami is a **wallet-native payment operator**. Every account is a wallet, and every payment is an instant wallet-to-wallet transfer in Kwanza (AOA).

- **Instant payments in Kwanza** — money moves between wallets in real time.
- **QR payments** — scan to pay, scan to receive.
- **Payment links** — shareable URLs to collect money over WhatsApp, email, or social.
- **Consumer wallets** — a personal Kwanza wallet with an `@handle` identity.
- **Merchant wallets** — accept payments with no terminal hardware.
- **Developer integrations** — accept Kwanza in any app through official SDKs.

The experience is built around one motion:

```
SCAN  →  CONFIRM  →  PAID INSTANTLY
```

Reference models: Pix (Brazil), M-Pesa (Kenya), UPI (India) — wallet-native, not card-first.

---

## Mission

**Enable instant digital payments in Angola for everyone** — from individual consumers to merchants, startups, and digital platforms — replacing cash, manual bank transfers, and WhatsApp proof-of-payment with money that moves at internet speed.

---

## Products

### Consumer App
A personal Kwanza wallet.
- Wallet and balance
- Instant transfers to any `@handle`
- QR payments (scan to pay)
- Payment links

### Merchant App
Accept payments anywhere.
- Receive payments instantly
- Generate static and dynamic QR codes
- Create and share payment links
- Transaction history

### Business Dashboard
Operate a merchant business on the web.
- Merchant and account management
- Payments and reconciliation
- Settlements and payouts
- Reporting and analytics

### APIs and SDKs
Accept Kwanza in any application. Official Banzami integration SDKs:

| Language | Use |
|----------|-----|
| TypeScript / Node.js | Server-side integrations |
| Flutter | Mobile apps and in-app checkout |
| Python | Server-side integrations |
| PHP | Server-side integrations |
| Go | Server-side integrations |

---

## Core Capabilities

- **Instant payments** — real-time wallet-to-wallet settlement
- **QR payments** — static and dynamic codes
- **Payment links** — shareable, pull-based collection
- **Wallet infrastructure** — double-entry ledger, strongly consistent balances
- **Merchant onboarding** — fast, terminal-free setup
- **Consumer onboarding** — `@handle` identity, no IBAN or card required
- **SDK-first integrations** — typed clients with idempotency and signed webhooks
- **Real-time settlement** — T+0 wallet credit, configurable payout cycles

---

## Technology

| Layer | Technology | Role |
|-------|-----------|------|
| **Rust** | Financial core | Ledger, wallets, transfers, settlement — the only writer of financial state |
| **Go** | Services and APIs | Public, consumer, and admin APIs; authentication; webhooks |
| **PostgreSQL** | Database | Single source of financial truth |
| **Flutter** | Mobile | Consumer and merchant applications |
| **Next.js** | Web | Dashboard, admin, pay, and checkout applications |

---

## Repository Layout

```
core/        Rust financial core — ledger, wallets, transfers, QR, settlement, payouts
services/    Go services — api-gateway, public-api, admin-api
apps/        Product apps — mobile, merchant, dashboard, admin, pay, checkout
sdk/         Banzami integration SDKs — typescript, flutter, python, php, go, checkout-web
plugins/     Commerce platform adapters
db/          PostgreSQL migrations
infra/       Docker, deployment, and monitoring configuration
docs/        Operator documentation
tools/       Internal tooling
```

---

## Development

```bash
# Start local infrastructure (PostgreSQL, Redis)
make dev-up

# Run database migrations
make db-migrate

# Run the financial core and services
make core-run
make gateway-run
```

`make help` lists all targets. See [docs/](docs/) for full setup, service topology, and environment configuration.

---

## Documentation

All technical documentation lives in [docs/](docs/):

- Architecture and Architecture Decision Records (`docs/adr/`)
- Domain documentation (`docs/domains/`)
- Operations, runbooks, and playbooks (`docs/runbooks/`, `docs/playbooks/`)
- Sandbox and integration guides (`docs/sandbox/`, `docs/integrations/`)
- Security (`docs/security/`)

Start at [docs/index.md](docs/index.md).

---

## Ecosystem

Banzami is one operator built on the **BANZA** protocol.

**BANZA** — the open financial protocol that Banzami is built on. It is owned and governed independently of Banzami at [github.com/banza-protocol/banza](https://github.com/banza-protocol/banza).

**BanzAI** — the protocol's intelligence system. It lives at [github.com/banza-protocol/banzai](https://github.com/banza-protocol/banzai) and is not a Banzami product.

---

## Status

Banzami is in active development. The financial core (ledger, wallets, transfers, QR, payment links), the consumer and merchant apps, the Business Dashboard, and the integration SDKs are implemented and exercised against a real database in a sandbox environment.

**Roadmap (next):**
- EMIS acquiring integration — real Kwanza wallet funding
- Automated bank payouts (T+1 cycles)
- PHP SDK v1
- Production observability (Grafana)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

See [LICENSE](LICENSE).
