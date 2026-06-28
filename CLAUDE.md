# Banzami — Reference Operator Engineering Constitution

> **I am working on Banzami — an independent commercial startup and reference operator built on the BANZA protocol.**  
> Banzami is a company. It does not own or govern the BANZA protocol.

---

## Institutional Identity

**Banzami is a startup.** It is:
- An independent commercial company
- The reference operator implementation of BANZA
- Governed separately from the BANZA protocol organization
- Hosted at `github.com/banzami` (not `github.com/banza-protocol`)
- The product domain is `banzami.com`

## Ecosystem Identity (ADR-025)

```
BANZA    = open financial infrastructure protocol        ~/banza   github.com/banza-protocol/banza
Banzami  = Independent startup / reference operator     ← THIS REPO  github.com/banzami/banzami
```

Read the shared operating rules first: [../banza/docs/governance/CLAUDE_BASE.md](../banza/docs/governance/CLAUDE_BASE.md)

---

## Reference Operator Guardrail

**Banzami is the first operator built on BANZA.**

- Banzami does NOT own the protocol.
- Banzami does NOT define the protocol rules.
- Banzami does NOT control the certification framework.
- Banzami consumes protocol definitions from `~/banza`.
- Protocol rule changes happen in `~/banza` via ADR, not here.
- The BANZA protocol continues to exist if Banzami ceases operations.

Never redefine protocol rules locally. If a financial rule is needed that does not exist in `~/banza`, the correct action is to open an ADR in `~/banza` — not to implement the rule locally in `~/banzami`.

### Protocol-first product development (BANZA ADR-035 · Banzami ADR-019)

New **structural** financial/protocolar concepts originate in the protocol and
flow **downward** — never the other way:

```
BANZA Protocol  →  Banzami Operator  →  SDK  →  Consumer / Merchant / Admin Apps
```

Banzami does NOT invent a financial/protocolar concept in an app and then retrofit
it into BANZA. A new financial object, a new way value is grouped/structured/
settled, a new lifecycle, a new event or wire field MUST start as a BANZA ADR/RFC,
then be implemented by the operator, exposed by the SDKs, and only then consumed
by apps. Apps own UX; SDKs expose capabilities; neither defines new financial
behaviour alone.

**One-line test before any product work:** *does this introduce a new financial/
protocolar concept?* If yes, it starts in `~/banza`. (Worked example: split charge
/ Collections — pre-protocol prototype, disabled by default, pending BANZA ADR-036;
see [docs/architecture/protocol-integration.md](docs/architecture/protocol-integration.md) and Banzami ADR-019.) Pure UX and operator-local policy (KYC/AML, fees within invariants, onboarding) stay here and need no protocol ADR.

---

## National-Grade Financial Infrastructure for Angola

---

# 1. Mission

## 1.1 Primary National Mission

Banzami exists to:

**Modernize and revolutionize digital payments in Angola.**

Banzami is NOT trying to become:

* a generic African fintech,
* a continental super-app,
* or a broad "Africa payments" platform.

Banzami is focused FIRST on Angola.

Everything is optimized for:

* Angolan consumers,
* Angolan merchants,
* Angolan commerce,
* Angolan mobile usage,
* Angolan payment realities,
* the Angolan Kwanza ecosystem.

## 1.2 Core National Objective

Banzami aims to become:

1. **The first true QR-native instant payment network in Angola.**
2. **The first Angola-native SDK payment infrastructure** — enabling applications, ecommerce platforms, and mobile apps to accept instant online payments in Kwanza directly inside their products.

## 1.3 The Transformation Banzami Enables

### Taxi apps
Any Angolan taxi app integrates the BANZA SDK and accepts instant in-app Kwanza payments: ride completed → instant settlement → no cash, no manual confirmation, no external proof.

### Small merchants and cantinas
Any business prints a QR, receives instant Kwanza payments, and manages a business wallet — with no expensive terminal infrastructure.

### Ecommerce and mobile apps
Banzami demonstrates how any Angolan application — taxi apps, delivery platforms, ecommerce, schools, donation platforms, creator apps — integrates BANZA SDKs and accepts instant Kwanza payments natively.

### Creator and donation economy
Apps like DOA: receive donations instantly, generate QR codes, receive wallet settlement, operate entirely in Kwanza.

### Person-to-person payments
Consumers transfer instantly, request money, pay via QR, pay via @handle — without cash.

## 1.4 Eliminating Angolan Payment Friction

Banzami aims to eliminate:

* manual payments,
* cash dependency,
* manual bank transfer confirmations,
* WhatsApp proof-of-payment flows,
* fragmented payment experiences.

The target future state:

```text
SCAN  →  CONFIRM  →  PAID INSTANTLY
```

## 1.5 Official Positioning

CORRECT descriptions of Banzami:

* Angola's instant payment network (reference operator)
* QR-native payment experience built on BANZA
* Banzami is the first operator — BANZA is the protocol
* "Powered by the BANZA protocol"

INCORRECT descriptions of Banzami:

* "Banzami is the protocol" — NO. BANZA is the protocol.
* "Banzami infrastructure" — NO. The infrastructure is BANZA.
* "Banzami ecosystem" — NO. The ecosystem is BANZA's.
* Pan-African super-app (premature — Angola first)
* Stripe for Africa (wrong model — wallet-native, not card-centric)
* Generic African fintech (not the identity)
* Crypto payment platform (not the product)

## 1.6 The Role of EMIS

EMIS is NOT the product layer.

EMIS is one of the infrastructure rails — one integration among several, enabling access to real Angolan payment infrastructure.

Banzami provides the UX layer, wallet layer, QR layer, merchant layer, developer integration, and consumer experience on top of BANZA protocol running on those rails.

## 1.7 Bank Relationship Philosophy

Banks are not competitors. Banzami is an interoperability and simplification layer.

* Banks and EMIS provide: banking rails, settlement access, regulatory integration.
* BANZA protocol provides: ledger rules, financial invariants, SDK contracts.
* Banzami provides: instant UX, QR commerce, merchant tooling, mobile payment experiences, wallet-native payments.

## 1.8 Long-Term Objective

Make digital Kwanza payments so simple, fast, and integrated that:

* physical cash usage decreases,
* manual transfer confirmations disappear,
* QR payments become the normal expectation,
* and Angolan applications integrate payments natively as a first-class feature.

## 1.9 Growth Strategy

The network grows through:

* merchants (QR adoption),
* consumers (wallet usage),
* SDK integrations (developer ecosystem),
* ecommerce and mobile apps,
* instant wallet settlement creating retention.

## 1.10 Engineering Mission

Banzami is engineered with:

* banking-grade reliability,
* financial correctness,
* developer-first experience,
* infrastructure-level scalability,
* modern security standards,
* long-term maintainability.

Banzami is NOT a simple startup product.

It is a national-scale payment operator for Angola, built on the BANZA open protocol.

Every engineering decision must prioritize:

1. correctness,
2. reliability,
3. security,
4. observability,
5. maintainability,
6. scalability,
7. documentation quality.

Short-term speed must NEVER compromise long-term system integrity.

---

# 2. Core Engineering Principles

## 2.1 Financial Correctness First

Financial systems are not traditional CRUD applications.

Every monetary movement must be:

* auditable,
* immutable,
* traceable,
* reproducible,
* reconcilable.

Never manipulate balances directly.

INVALID:

```rust
wallet.balance -= amount;
```

VALID:

```text
Customer Wallet    -1000 Kz
Merchant Pending   +1000 Kz
```

All money movement MUST go through:

* double-entry accounting,
* atomic transactions,
* immutable ledger events.

---

## 2.2 Reliability Over Hype

Banzami prioritizes:

* stability,
* predictability,
* operational excellence.

We DO NOT adopt technologies because they are trendy.

We adopt technologies only if they:

* improve reliability,
* improve security,
* improve maintainability,
* improve scalability.

---

## 2.3 Modular Monolith First

Premature microservices are forbidden.

The initial architecture is:

* modular,
* domain-oriented,
* strongly isolated internally,
* deployed as a controlled modular monolith.

Service extraction happens ONLY when:

* operational necessity exists,
* scaling boundaries are proven,
* domain ownership becomes complex.

---

## 2.4 Documentation Is Mandatory

Undocumented systems are considered incomplete systems.

Every implementation MUST include:

* technical documentation,
* architectural reasoning,
* operational instructions,
* security considerations,
* migration notes if applicable.

If documentation is missing:
the task is NOT complete.

---

## 2.5 Readability Over Cleverness

Code must be:

* explicit,
* understandable,
* maintainable,
* predictable.

Avoid:

* magic abstractions,
* hidden side effects,
* unnecessary metaprogramming,
* overengineered patterns.

Future engineers must understand the system quickly.

---

## 2.6 Instant Payments as a Core Architectural Principle

Banzami is designed as:

* realtime payment operator,
* QR-first payment experience,
* instant-transfer-first infrastructure.

Instant payments are NOT an optional feature.

They are a foundational product characteristic.

### Core Philosophy

By default, ALL Banzami payment experiences must feel instant.

The user experience target is:

```text
scan → confirm → paid immediately
```

### Default Payment Experience

```text
Customer scans QR
        ↓
Payment confirmation screen
        ↓
Transaction authorized
        ↓
Ledger updated
        ↓
Merchant wallet updated
        ↓
Webhook dispatched
        ↓
Merchant sees payment instantly
        ↓
Customer receives success confirmation
```

Target perceived latency:

* under 2 seconds — ideal,
* under 5 seconds — acceptable.

### Payment Critical Path

```text
auth → risk → compliance → ledger posting → wallet update → response
```

Everything else is async:

* retries, reconciliation, analytics, notifications, reporting.

Queues are NEVER used for core payment confirmation.

### Mandatory Engineering Rules

**1. Ledger writes remain synchronous and atomic.**

**2. Wallet balances update immediately** after authorization, capture, transfer, payout reservation, reversal.

**3. Webhook delivery begins immediately** after successful transaction commit.

**4. Realtime infrastructure is mandatory:** WebSocket or SSE for dashboard updates, QR status, and transaction events. Redis pub/sub for lightweight event dispatch.

### Product Philosophy

> **"Money moves at internet speed."**

Banzami is building realtime Angolan payment infrastructure with banking-grade engineering, on top of the open BANZA protocol.

---

## 2.7 Wallet-Native Identity — Core Architectural Constraint

### What Banzami IS

Banzami is:

* a **wallet-native payment network** — every account is a wallet, every payment is a wallet transfer,
* a **QR-native operator** — QR codes are the primary payment initiation mechanism,
* an **instant-transfer experience** — money moves between wallets in real time,
* a **kwanza-native money network** — AOA is the primary unit, local rails (EMIS, Multicaixa Express) are native integrations,
* a **@handle-based identity system** — payments are addressed to human-readable handles.

### What Banzami is NOT

Banzami is NOT:

* a card processor,
* a Stripe clone,
* a Visa / Mastercard gateway,
* the BANZA protocol,
* the protocol infrastructure.

### Primary Payment Rail

```text
Consumer Wallet  ──ledger transfer──▶  Merchant Wallet
```

### UX Philosophy

```text
SCAN QR → CONFIRM → INSTANT SETTLEMENT
```

Reference models: Pix (Brazil), WeChat Pay, M-Pesa, UPI — NOT Stripe checkout, NOT card entry forms.

Users must NEVER be asked for card numbers, CVV codes, expiry dates, or billing addresses.

---

# 3. Official Technology Stack

| Layer | Technology | Responsibilities |
|---|---|---|
| Financial core | **Rust** | Ledger, wallet, transaction, settlement, reconciliation, payout, risk, compliance |
| API layer | **Go** | Public APIs, admin APIs, webhook delivery, orchestration, authentication, gateway |
| Frontend | **TypeScript + Next.js + React** | Merchant dashboard, admin, analytics, disputes, payouts, developer console |
| Mobile | **Flutter** | Mobile SDKs, checkout integration, merchant integrations |
| Database | **PostgreSQL** | Single source of financial truth |
| Cache / coordination | **Redis** | Caching, rate limiting, idempotency, distributed locking, session management |
| Observability | **OpenTelemetry + Prometheus + Grafana** | Metrics, traces, structured logs, health signals |
| Infrastructure | **Docker + Hetzner/OVH + Cloudflare** | Initial deployment model |

Kubernetes is intentionally deferred until operational maturity requires it.

---

# 4. Repository Structure

```text
~/banzami
    /apps
        /dashboard       ← Merchant dashboard (Next.js)
        /admin           ← Admin portal (Next.js)
        /pay             ← Pay page (Next.js)
        /checkout        ← Checkout page (Next.js)

    /services
        /api-gateway     ← Go public API gateway
        /public-api      ← Go consumer API
        /admin-api       ← Go admin API

    /core
        /ledger          ← Double-entry ledger engine (Rust)
        /wallets         ← Wallet state and reserve logic (Rust)
        /transactions    ← Transaction lifecycle (Rust)
        /settlement      ← Settlement orchestration (Rust)
        /routing         ← Payment routing (Rust)
        /reconciliation  ← Reconciliation engine (Rust)
        /risk            ← Risk scoring (Rust)
        /compliance      ← Compliance core (Rust)
        /payouts         ← Payout orchestration (Rust)

    /sdk
        /flutter         ← Flutter SDK
        /typescript      ← TypeScript SDK

    /plugins             ← Commerce platform integrations

    /infra
        /docker          ← Docker Compose definitions
        /terraform       ← Infrastructure as code
        /monitoring      ← Grafana / Prometheus config
        /deployment      ← Deployment scripts

    /docs
        /adr             ← Architecture Decision Records
        /domains         ← Domain documentation
        /security
        /compliance
        /runbooks
        /playbooks
        /migration
        /audit
        /validation

    /tools

    CLAUDE.md
    README.md
    deploy.sh
```

---

# 5. Documentation Standards

## 5.1 Mandatory Documentation for Every Feature

Every implementation MUST include: README update, architecture notes, operational notes, security notes, migration notes (if needed), API documentation (if exposed).

## 5.2 Domain Documentation

Every domain MUST contain `docs/domains/<domain-name>/` explaining:
business purpose, architecture, flows, invariants, failure scenarios, reconciliation logic, security assumptions.

## 5.3 ADRs

All major technical decisions MUST create `docs/adr/ADR-NNN-title.md` with: context, decision, rationale, alternatives, consequences, tradeoffs.

## 5.4 README Rules

README files must remain synchronized with implementation reality. Outdated documentation is a defect.

---

# 6. Security Standards

* All services: authentication, authorization, audit logging, encryption at rest, TLS everywhere, idempotency, rate limiting, structured logging.
* Critical financial actions: traceability, replay protection, immutable audit trails, reconciliation guarantees.
* Secrets MUST NEVER exist in repositories, logs, screenshots, or documentation examples.
* Secret API keys: server SDK only. Publishable keys: client SDK only.

---

# 7. Engineering Quality Standards

* All code MUST be: strongly typed, tested, observable, documented, production-grade.
* Financial invariant tests MUST use real database — no mocks.
* Every financial operation MUST be idempotent.
* Database migrations: reversible when possible, documented, tested before production.

---

# 8. Observability Standards

Every service MUST expose: metrics, tracing, health checks, structured logs.

Minimum requirements: request tracing, transaction tracing, payment lifecycle visibility, settlement visibility.

Track and alert on: authorization latency, capture latency, QR payment end-to-end latency, webhook dispatch latency, transfer latency, DB transaction duration.

---

# 9. Financial Architecture Standards

## 9.1 Ledger Rules

The ledger is the single financial truth.

Rules: immutable entries, append-only philosophy, double-entry accounting, atomic posting, reconciliation-first design.

## 9.2 Reconciliation

Every external integration MUST support: reconciliation jobs, settlement verification, discrepancy reporting, retry logic.

## 9.3 Monetary Precision

Floating-point arithmetic is forbidden for money. Use integer minor units.

---

# 10. API Standards

Public APIs MUST follow: REST consistency, versioning, idempotency, structured error handling, pagination standards, authentication standards.

Every endpoint MUST include: examples, request schemas, response schemas, failure responses.

---

# 11. Git Standards

```text
Branch naming: feature/* fix/* infra/* security/* docs/*

Commit format: type(scope): description

Examples:
  feat(wallets): add transaction reservation flow
  fix(ledger): prevent duplicate settlement posting
  docs(api): update webhook retry documentation
```

---

# 12. Operational Philosophy

Banzami is a national-scale payment operator.

Operator engineering requires: discipline, consistency, operational maturity, reliability culture.

We optimize for: decades of maintainability, operational excellence, financial integrity, institutional trust.

---

# 13. SDK-First Ecosystem Policy

**Banzami is an SDK-first operator.**

ALL external applications integrating Banzami MUST use an official BANZA protocol SDK. Direct HTTP integrations using `fetch()`, `axios()`, curl wrappers, or handcrafted API clients are NOT acceptable in official examples, demos, merchant integrations, documentation, showcase applications, reference implementations, plugins, templates, or tutorials.

### SDK Requirements

All SDKs must provide: typed APIs, environment isolation (sandbox / live), automatic idempotency key management, retries with exponential backoff, webhook signature verification, QR payment helpers, payment intent helpers, standardized error hierarchy, tracing and observability hooks, structured logging support, production-grade documentation.

### Secret Key Rule

Secret API keys MUST NEVER be used in frontend, browser, or mobile client code.

### Mandatory SDKs for v1

Server-side: TypeScript/Node.js, PHP, Python, Go  
Client-side: Flutter, JavaScript Browser  
Future: Laravel package, WordPress/WooCommerce plugin, Android native, iOS native

---

# 14. Documentation

Operator documentation lives as markdown under `docs/` (see
[docs/DOCUMENTATION_MAP.md](docs/DOCUMENTATION_MAP.md)). The public Banzami website
was removed — there is no website content pipeline. Protocol documentation
(BANZA_REFERENCE, certification, conformance) is owned by the BANZA protocol repo,
not this operator.

---

# 15. Brand Architecture (ADR-025)

**Authoritative reference:** ADR-025 (Ecosystem Naming Inversion, 2026-05-29). Supersedes ADR-016.

## 15.1 The Three-Layer Model

```
BANZA    = protocol (open infrastructure, rules, certification, kernel)
Banzami  = reference operator (product, UX, wallets, merchant services)
```

## 15.2 Use "Banzami" for operator/product context

Use Banzami when referring to:

* the payment experience users interact with,
* wallets and balances ("Banzami Wallet"),
* the payment network as experienced by users ("rede Banzami"),
* QR payments from the user perspective ("Banzami QR"),
* the merchant solution ("Banzami Business"),
* the operator-specific APIs and integrations,
* payment links and checkout experience,
* consumer-facing copy ("Paga com Banzami", "adoptar o Banzami").

## 15.3 Use "BANZA" or "Banza" for protocol context

Use BANZA/Banza when referring to:

* the open protocol specification,
* the Rust financial kernel,
* the certification framework,
* the SDK ecosystem (protocol-level SDKs),
* the federation model,
* ADRs governing the protocol,
* documentation source of truth (BANZA_REFERENCE.md),
* "built on Banza" / "powered by the Banza protocol".

## 15.4 Product hierarchy (ADR-025)

```
BANZA (open protocol)
└── Banzami (reference operator)
    ├── Banzami Wallet
    ├── Banzami Business
    ├── Banzami QR
    ├── Banzami Checkout
    ├── Banzami Pay Links
    └── @banza (the Banzami handle — operator's word for "handle"/username)
```

> **`@banza` is NOT the BANZA protocol.** It is simply the name Banzami chose to
> replace the English word "handle"/username — picked because it is easy to
> pronounce and memorable. It is intentional Banzami product terminology; never
> rename it to `@banzami` and never treat it as protocol naming.

## 15.5 SDK naming (operator-level, Banzami-prefixed)

The SDKs are built and published by the operator (Banzami), so they carry the
Banzami name. (This supersedes the earlier "protocol-level, Banza-prefixed" SDK
naming: `banza` appears in the operator product only for the BANZA protocol
itself and for `@banza` — which is the Banzami handle term, not the protocol.)

* TypeScript: `@banzami/sdk`, class `BanzamiClient`
* PHP: `banzami/sdk-php`, namespace `Banzami\`, class `BanzamiClient`
* Go: `banzami-go`
* Python: `banzami-python`, package `banzami`
* Flutter: `banzami_flutter`, class `BanzamiClient`
* Node plugins scope: `@banzami/*`

**Preserved as protocol-level wire contracts** (unchanged to avoid breaking
existing integrations; the BANZA protocol defines the signing convention):

* Webhook header: `banza-signature`
* Env vars: `BANZA_WEBHOOK_SECRET`, `BANZA_API_KEY`

## 15.6 Grammatical gender — binding rule

Both brand names are grammatically **masculine** in Portuguese:

| Wrong | Correct |
|-------|---------|
| a Banzami | o Banzami |
| da Banzami | do Banzami |
| a Banza | o Banza |
| da Banza | do Banza |

## 15.7 Canonical names (BANZAMI-INSTITUTIONAL-SEPARATION-001, 2026-05-30)

The institutional separation is complete. These are the current canonical names:

* `@banza` — permanent handle identity; the Banzami term for "handle"/username (NOT the BANZA protocol)
* `banzami.com` — **active** primary domain
* `contact@banzami.com`, `security@banzami.com` — **active** contact emails
* `github.com/banzami/banzami` — **active** GitHub repo (post-transfer)
* `github.com/banza-protocol` — BANZA protocol organization (not Banzami)
* Rust crate names (`banzami-types`, `banzami-ledger`, etc.) — out of scope (deferred)

## 15.8 Canonical positioning phrases

> "Banzami é construído sobre o protocolo BANZA."  
> "BANZA é o protocolo. Banzami é como Angola paga."  
> "Banzami é o operador de referência da rede BANZA."

## 15.9 Content update flow

Keep operator documentation (`docs/`, root `BANZAMI_*.md`) coherent with the code. Protocol naming and rules are owned by BANZA — change them via an ADR in `~/banza`, not here.

---

# 16. Validation Governance — Claude Approval Gates

## 16.1 Rule

Claude must NEVER apply validation status changes to `docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json` without first producing a structured proposal and receiving the exact approval phrase from the human.

## 16.2 Required Approval Phrases

| Action | Required exact phrase |
|--------|-----------------------|
| Apply JSON change | `APPROVE VALIDATION <ITEM_ID> <fingerprint>` |
| Create git commit | `APPROVE COMMIT <ITEM_ID>` |

## 16.3 Rejected Phrasings

`yes` · `ok` · `confirm` · `go` · `apply` · `looks good` · `pode avançar` · `sim` · `continua` · `approved` · any paraphrase or equivalent — these NEVER trigger a write operation.

## 16.4 Phase Separation

Applying the JSON change and creating the git commit are separate governance actions, each requiring its own approval phrase.

## 16.5 Proposal Requirements

Before any approval gate, Claude must produce a full VALIDATION PROPOSAL containing: current → proposed status, validation fingerprint (16-char SHA256), architecture lock status (`requires[]`), financial invariant status, acceptance criteria check (PASS/PARTIAL/FAIL/UNVERIFIABLE per criterion with file:line citations), evidence found, fields to be updated, history entry preview, risks, suggested commit message.

## 16.6 Fingerprint Contract

```
SHA256(item_id | SHA256(git_diff)[0:16])[0:16]
APPROVE VALIDATION <ID> <fingerprint>
```

If the fingerprint differs on apply: abort and require a new proposal.

## 16.7 Financial Invariants

Items in `cat-ledger`, `cat-wallet`, `cat-p2p`, `cat-qr`, `cat-payouts`, `cat-refunds` are financially critical. ALL invariants must be PASS before VALIDATED can be proposed.

## 16.8 Architecture Lock

An item may NOT become VALIDATED unless every item in `requires[]` is already VALIDATED.

## 16.9 Confidence Score

VALIDATED requires `confidence.score >= 80`.

## 16.10 Validation Domains

Every matrix item MUST have a `validationDomain` from the 11 canonical domains in `docs/validation/VALIDATION_DOMAINS.md`.

---

# 17. Governance Primitive Freeze

The validation governance architecture is **mature and sufficient**. No new governance primitives should be introduced unless justified by a concrete operational need.

Accepted justifications:
1. A real implementation problem arises
2. A real security issue is identified
3. A real operational bottleneck is encountered
4. A real audit or compliance requirement appears
5. A real product scaling issue emerges

NOT accepted: theoretical elegance, abstractions without operational value, meta-governance layers, speculative future-proofing, complexity for its own sake.

**The project priority is product execution:**
wallets, ledger engine, QR payment flows, merchant UX (Banzami Business), consumer UX (Banzami app), settlement and reconciliation, SDKs, sandbox environment, closed-loop payments, ecommerce and mobile app integrations.

---

# 18. Final Principle

Every engineer working on Banzami must understand:

This operator handles money.

Trust is the product.

Everything else is secondary.

---

# 19. Repository Layout Freeze

The repository layout is frozen. The semantic zones below are binding architectural constraints.

## 19.1 Zone Definitions

| Zone | Rule |
|------|------|
| `apps/` | Product-facing applications only (dashboard, admin, pay, checkout, docs site, mobile apps). Nothing operational or governance-related. |
| `services/` | Go API services (gateway, public-api, admin-api) |
| `core/` | Rust financial core (ledger, wallets, transactions, settlement, etc.) |
| `sdk/` | This operator's own client SDKs (checkout-web, Flutter) for integrating with this operator's product. Not protocol SDKs — BANZA is contract-first and has no official SDK. |
| `plugins/` | Commerce platform plugins |
| `docs/` | Documentation — ADRs, domains, runbooks, audit, migration, validation |
| `infra/` | Docker, Terraform, monitoring, deployment |
| `tools/` | Internal tooling and scripts |
| `evidence/` | Conformance and audit evidence artifacts (e.g. BANZA conformance reports). Generated evidence only — never a source of truth and never protocol authority. Passing a BANZA conformance suite is evidence, not certification: BANZA owns the certification framework. |

## 19.2 Frozen Rules

1. No new top-level directory may be added without: (a) updating `README.md`, (b) updating this section, and (c) adding to `tools/check-repository-layout.mjs`.
2. Protocol contracts (OpenAPI, webhook schemas, QR payload, event/federation contracts) are **owned by `~/banza`** and consumed from there — never duplicated as a local source of truth. This operator has no `contracts/` directory; the canonical home is `~/banza/contracts/`. If offline access is needed, vendor a read-only, version-pinned mirror — never a parallel authority.
3. Protocol rule changes belong in `~/banza`, not here. If a financial invariant or protocol contract needs updating, open an ADR in `~/banza`. Operator-local policy (e.g. KYC/AML tiers, fees, onboarding UX) stays here and needs no protocol ADR — see `~/banza/docs/governance/BANZA-PROTOCOL-VS-OPERATOR-POLICY.md`.

## 19.3 Compliance Check

```bash
make check-repo-layout
# or directly:
node tools/check-repository-layout.mjs
```

---

## 19.4 Deploy Script

```bash
./deploy.sh <service>         # deploy one service
./deploy.sh                   # deploy all services
./deploy.sh --no-cache <svc>  # force full rebuild
```

Server: `root@217.160.9.248`  
Services: `core-api`, `admin-api`, `api-gateway`, `public-api`, `admin-frontend`, `dashboard-frontend`, `pay-frontend`, `checkout-frontend`, `staging`

Deploy note: changes are not done until pushed to `origin/main` AND deployed via `./deploy.sh`.
