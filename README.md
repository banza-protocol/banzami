![Banzami — Angola's Wallet-Native Payment Network](docs/diagrams/banzami-hero-v1.svg)

**Angola's wallet-native payment network.** Banzami is the **first operator
built on the open BANZA protocol** — an independent Angolan startup building the
network that moves Kwanza at internet speed, where every account is a wallet,
every payment is an instant transfer, and money settles in seconds without cash,
cards, terminals, or proof-of-payment screenshots.

> **Money moves at internet speed.**

![Status](https://img.shields.io/badge/status-active%20development-blue)
![Role](https://img.shields.io/badge/role-Payment%20Network-red)
![Model](https://img.shields.io/badge/model-Wallet--Native-darkred)
![Currency](https://img.shields.io/badge/currency-AOA%20Kwanza-lightgrey)
![Built on](https://img.shields.io/badge/built%20on-BANZA-darkred)

| | |
|---|---|
| Network | Angola's wallet-native payment network |
| Website | [banzami.com](https://banzami.com) |
| Contact | contact@banzami.com |
| Repository | [github.com/banzami/banzami](https://github.com/banzami/banzami) — this repository |
| Built on | [BANZA](https://github.com/banza-protocol/banza) — the open financial protocol |

---

## Overview

Banzami is **infrastructure first**. It is not a wallet app, a QR app, or a
payment-link app — those are products that sit on top of the network. Banzami
is the network itself: a real-time, wallet-native settlement layer for Kwanza,
addressable by a human-readable **`@banza`** — accessible through QR codes,
payment links, and developer SDKs.

> **What is a `@banza`?** It is the Banzami handle — the name we give to a user's
> username. We call it `@banza` because it is short, easy to pronounce, and easy
> to remember (you pay `@maria`, not an IBAN). It is **not** the BANZA protocol:
> `@banza` is simply Banzami's word for "handle".

```
Pix      → Brazil
M-Pesa   → Kenya
UPI      → India
Banzami  → Angola
```

Banzami is the first operator built on the open [BANZA](#ecosystem) protocol.

---

## The Problem

Today, paying another person or a merchant in Angola is slow, manual, and built
on trust in a photo of a receipt. Cash fills the gap, with all its cost and risk.
Banzami replaces the entire flow with one motion: **scan, confirm, paid.**

![The problem Banzami solves](docs/diagrams/banzami-problem-v1.svg)

---

## The Banzami Network

Consumers, merchants, and developers connect to a single wallet-native network.
Money never leaves the ledger; it moves between wallets in real time. Every
participant holds a wallet, and QR codes, payment links, and SDKs are simply
different ways to initiate the same transfer.

![The Banzami network](docs/diagrams/banzami-network-v1.svg)

---

## Core Products

![Core products — consumer app, merchant app, business dashboard, SDK platform](docs/diagrams/banzami-products-v1.svg)

---

## How Money Moves

Banzami is **wallet-native**. There are no card rails and no dependency on
physical POS terminals (TPA). A payment is a ledger movement between two wallets,
and the merchant is credited the moment the transfer commits.

![How money moves — consumer wallet to instant transfer to merchant wallet](docs/diagrams/banzami-money-flow-v1.svg)

The financial core enforces correctness: every posting is double-entry and
atomic, every balance is derived from the ledger, and every operation is
idempotent and replay-safe.

---

## Developer Platform

Any Angolan application — a taxi app, a delivery platform, an e-commerce store,
a donation platform — accepts instant Kwanza through one API and five official
SDKs. Integration takes hours, not weeks.

![Developer platform — SDKs to Banzami API to the payment network](docs/diagrams/banzami-developer-platform-v1.svg)

---

## Architecture

Strict language boundaries: Rust owns financial correctness, Go owns the API
surface, PostgreSQL is the single source of truth. The Rust core is the only
writer of financial state — no service above it can violate a financial invariant.

![Architecture — apps, Go services, Rust core, PostgreSQL](docs/diagrams/banzami-architecture-v1.svg)

---

## Why Banzami

### For consumers
A free Kwanza wallet with a human `@banza` (your Banzami handle). Send and receive
money instantly, pay any merchant by scanning a QR — no cash, no IBAN, no card.

### For merchants
Accept payments with zero terminal hardware. Print a QR or share a link, receive
money in seconds, and manage everything from one dashboard with instant settlement.

### For developers
One API and five SDKs to accept Kwanza natively inside any app. Typed clients,
idempotency, signed webhooks, and a full sandbox — from `install` to first
payment in minutes.

### For platforms
Marketplaces, delivery apps, and e-commerce platforms embed wallet-native
payments and instant settlement directly into their product, in Kwanza, without
building payment infrastructure.

---

## National Impact

Banzami exists to make digital Kwanza payments the default in Angola.

| Lever | Effect |
|-------|--------|
| **Financial inclusion** | A wallet for anyone with a phone — no bank branch, no card |
| **Digital commerce** | Any merchant accepts digital payment without a terminal |
| **Instant payments** | Settlement in seconds replaces manual transfers and cash |
| **QR economy** | A printed QR turns any counter into a point of sale |
| **SDK economy** | Local developers build payment-native apps on shared rails |

Less cash in circulation, fewer manual confirmations, and a payment surface
every Angolan application can build on.

---

## Ecosystem

Banzami is the first commercial operator built on the BANZA protocol. BANZA
defines the open protocol; Banzami implements it as a wallet-native payment
network. BanzAI is an adjacent protocol knowledge system that helps developers
and operators understand the protocol — it does not operate payments and is not
part of the Banzami operator.

![Ecosystem — BANZA defines, Banzami operates, BanzAI explains](docs/diagrams/banzami-ecosystem-v1.svg)

**BANZA** — the open financial protocol, owned and governed independently at
[github.com/banza-protocol/banza](https://github.com/banza-protocol/banza).
**BanzAI** — the protocol's knowledge system, at
[github.com/banza-protocol/banzai](https://github.com/banza-protocol/banzai).

---

## Repository Structure

| Directory | Contents |
|-----------|----------|
| `core/` | Rust financial core — ledger, wallets, transfers, QR, settlement, payouts |
| `services/` | Go services — `api-gateway`, `public-api`, `admin-api` |
| `apps/` | Product apps — mobile, merchant, dashboard, admin, pay, checkout, website |
| `sdk/` | Banzami integration SDKs — TypeScript, Flutter, Python, PHP, Go |
| `plugins/` | Commerce platform adapters |
| `db/` | PostgreSQL migrations |
| `infra/` | Docker, deployment, and monitoring |
| `docs/` | Operator documentation |
| `tools/` | Internal tooling |
| `evidence/` | Conformance and audit evidence artifacts (e.g. BANZA conformance reports) |

---

## Development

```bash
make dev-up        # start local infrastructure (PostgreSQL, Redis)
make db-migrate    # run database migrations
make core-run      # run the Rust financial core
make gateway-run   # run the API gateway
```

`make help` lists all targets. Full setup, service topology, and environment
configuration: [docs/](docs/).

---

## Documentation

All technical documentation lives in [docs/](docs/) — architecture, domains,
runbooks, security, sandbox, and integration guides. Start at
[docs/DOCUMENTATION_MAP.md](docs/DOCUMENTATION_MAP.md).

---

## Status

Banzami is an **operator-side payment product and sandbox implementation aligned
with the BANZA protocol**. BANZA is the protocol; Banzami is a candidate
operator/product implementation built to consume BANZA conformance tooling — it
does not own or govern the protocol (see [Ecosystem](#ecosystem)).

It is in active development and **not yet launch-ready**. The financial core —
double-entry ledger, atomic postings, consumer wallets, balance derivation, P2P
transfers, and `@banza` handles — is implemented and validated against a real
database. QR payments, merchant apps, the Business Dashboard, and the SDK platform
are in progress. Real Kwanza funding and withdrawals — through an approved payment
rail such as EMIS or a partner-bank route — and KYC/KYB are not yet operational;
the default acquiring provider is simulated.

```text
Status:                         NOT YET launch-ready
Internal engineering blockers:  0
External blockers:              10
BANZA L0 dry-run evidence:      validated
BANZA certification:            not issued
Production federation:          not live
```

**Product roadmap**

| Horizon | Focus |
|---------|-------|
| **Now** | Wallets, transfers, QR, payment links, SDKs, sandbox |
| **Next** | Real Kwanza funding via an approved rail (EMIS or partner bank) · automated bank/rail payouts · PHP SDK v1 · production observability |
| **Later** | Broader merchant tooling, platform integrations, and network growth |

---

## Validation Studio and Implementation Matrix

The **Validation Studio** is Banzami's readiness control room. It tracks every
implementation domain, launch blocker, external dependency, roadmap item, and
piece of validation evidence — and it deliberately keeps "implemented" separate
from "launch-ready". It separates internal engineering readiness from external
dependencies, and it is the source of truth for current Banzami readiness.

- Source of truth: [`docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json`](docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json)
- App: [`apps/validation-studio/`](apps/validation-studio/) — `make studio` (local-only)

**Current snapshot**

```text
Total tracked:     87
Launch scope:      76
Launch-ready:      66/76
Code-complete:     68/76
Internal blockers:  0
External blockers: 10
Launch status:     NOT YET
```

What the figures mean:

- **Launch-ready** — VALIDATED against real evidence (production-proven for its scope).
- **Code-complete** — VALIDATED or IMPLEMENTED (internal engineering done).
- **Internal blockers** — not launch-ready for reasons still under Banzami's own engineering control.
- **External blockers** — blocked by a dependency outside Banzami's engineering control (KYC/KYB vendor, money-in/out rails, BNA / regulatory).
- **Roadmap** — tracked future scope (e.g. BANZA L1–L4); **not** a launch blocker.
- **Baseline** — an achieved capability shown for context (e.g. the L0 baseline) without double-counting the evidence it points to.

---

## Why the matrix matters

The matrix is not a marketing dashboard. It is a governance and readiness
instrument. It answers: what is implemented, what is validated, what is blocked,
what is external, and what must not yet be claimed. Concretely, it:

- prevents false readiness claims;
- shows what is done, blocked, or future;
- documents evidence for each validated item;
- protects against subjective "we are ready" assertions;
- creates an auditable governance trail (every VALIDATED status carries a fingerprint, approver, and commit);
- separates code completion from business launch readiness.

---

## BANZA protocol conformance

Banzami runs the **official BANZA conformance suite** against its sandbox
(`https://sandbox.banzami.org`) as an **operator candidate**. The current result
is **Level 0, 5/5 passed**, cross-validated on two distribution channels:

- PyPI: `banza-conformance==0.1.0`
- GHCR: `ghcr.io/banza-protocol/banza-conformance:v0.1.0`

The report is archived at
[`evidence/banza-conformance/l0/banzami-sandbox-l0-report.json`](evidence/banza-conformance/l0/banzami-sandbox-l0-report.json)
(see the [evidence README](evidence/banza-conformance/l0/README.md)).

**PASS means conformance evidence, not certification.** The BANZA protocol owns
the certification framework; no production certificate is issued or served
(`/.well-known/banza/certificate.json` is intentionally absent), and Banzami is
not in any production operator registry. Production certification is gated on
later operator milestones (real rails, KYC/KYB, production keys), none complete.

Reproduce the L0 run:

```bash
# Convenience wrapper (auto-detects the PyPI CLI or Docker)
make banza-conformance-l0

# Official PyPI tool
pip install banza-conformance==0.1.0
banza-conformance \
  --url https://sandbox.banzami.org \
  --level 0 \
  --output evidence/banza-conformance/l0/banzami-sandbox-l0-report.json

# Pinned Docker image (GHCR)
docker run --rm -v "$PWD/reports:/reports" \
  ghcr.io/banza-protocol/banza-conformance:v0.1.0 \
  --url https://sandbox.banzami.org \
  --level 0 \
  --output /reports/banzami-sandbox-l0-report.json
```

### BANZA Level Roadmap

| Level | Meaning | Banzami status | Evidence / next step |
|-------|---------|----------------|----------------------|
| **L0** | Sandbox protocol conformance | **VALIDATED baseline** | archived L0 evidence (PyPI + GHCR 5/5) |
| **L1** | Core payments | PLANNED | gap analysis required |
| **L2** | Payment initiation | FUTURE | not started |
| **L3** | Federation | FUTURE / M2–M3 gated | requires BANZA CA certificate and production trust |
| **L4** | External interoperability | FUTURE | profile-defined |

Levels and rules are defined by BANZA, not by Banzami — see the protocol's
`BANZA_CERTIFICATION.md` and [docs/certification.md](docs/certification.md).
L1–L4 are roadmap; none are validated and none imply certification.

---

## Launch readiness

Banzami has **no current internal engineering blockers** in the launch scope, but
it is **not launch-ready** because external dependencies remain unresolved. The
10 external blockers include:

- KYC/KYB provider (vendor decision pending);
- money-in rails (funding through an approved provider);
- money-out rails (withdrawals / settlement through an approved provider);
- BNA / regulatory / licensing dependencies.

Until those are resolved, launch status remains **NOT YET**, regardless of how
much internal engineering is complete.

---

## What this does not mean

- Banzami is **not** a certified BANZA operator.
- Banzami has **not** received a BANZA production certificate.
- L0 PASS is **not** certification — it is dry-run conformance evidence.
- L1 / L2 / L3 / L4 are **not** validated.
- Production federation is **not** live.
- M2 / M3 are **not** complete.
- Conformance does **not** replace legal, regulatory, KYC/KYB, AML-CFT, banking, or licensing obligations.

---

## Useful commands

```bash
make studio                # Validation Studio — local readiness control room (:3099)
make banza-conformance-l0  # Run BANZA L0 conformance against the sandbox (evidence)
make check-repo-layout     # Repository layout compliance check
make dev-up                # Start local infrastructure (PostgreSQL, Redis)
make db-migrate            # Run database migrations
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

See [LICENSE](LICENSE).
