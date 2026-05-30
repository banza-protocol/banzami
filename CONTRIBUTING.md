# Contributing to Banzami

Thank you for your interest in contributing to Banzami — the reference operator implementation of the BANZA financial infrastructure protocol.

---

## What this repository is

Banzami is the reference operator. It demonstrates how to implement the BANZA protocol as a production payment product for Angola.

**What lives here:**
- Product applications (merchant dashboard, admin portal, docs site, pay page, checkout)
- Go API services (gateway, public-api, admin-api)
- Rust financial core implementation (ledger, wallets, transactions, settlement, QR)
- Flutter mobile SDK integration
- Infrastructure and deployment

**What does NOT live here:**
- Protocol specifications (those live in `~/banza`)
- Protocol rule changes — any change to a financial invariant or protocol contract must go through the ADR process in `github.com/banza-protocol/banza`
- BanzAI internals (those live in `~/banzai`)

---

## What you can contribute to

| Area | Examples |
|---|---|
| **Merchant dashboard** | UI improvements, new analytics views, accessibility |
| **Consumer experience** | QR flow improvements, wallet UX, payment confirmation |
| **Go services** | API improvements, performance, error handling |
| **Rust core** | Bug fixes within protocol bounds, performance improvements |
| **Flutter SDK** | Mobile UX, platform integrations |
| **Documentation** | Operator guides, integration guides, runbooks |
| **Infrastructure** | Docker, deployment scripts, monitoring |

## What is out of scope here

- Protocol rule changes — open an ADR in `github.com/banza-protocol/banza` first
- BanzAI Protocol OS changes — contribute to `github.com/banza-protocol/banzai`
- SDK certification vectors — live in `~/banza/contracts/sdk-certification/`

---

## Contribution Principles

### Financial correctness first

Every change that touches money movement must preserve all financial invariants. The invariants are defined in the BANZA protocol — see [BANZA_REFERENCE.md](../banza/BANZA_REFERENCE.md). Never manipulate balances directly. All money movement goes through the double-entry ledger.

### Operator guardrail

Banzami implements the protocol — it does not define the protocol. If a change requires modifying a financial rule, the correct path is to open an ADR in `github.com/banza-protocol/banza`, not to implement the rule locally here.

### No direct HTTP integrations in examples

All external application integrations in documentation and examples must use official BANZA SDKs. Never showcase `fetch()` or raw HTTP calls as the recommended integration path.

---

## How to Contribute

### 1. Open an issue first

For anything beyond a trivial bug fix or documentation improvement, open an issue to discuss the change before writing code.

### 2. Fork and branch

```bash
git clone https://github.com/banza-protocol/banzami.git
cd banzami
git checkout -b feature/your-change
```

Branch naming conventions:

```
feature/*   — new features
fix/*        — bug fixes
docs/*       — documentation only
infra/*      — infrastructure/deployment
security/*   — security improvements
refactor/*   — refactoring (no functional change)
```

### 3. Commit conventions

```
type(scope): description

Types: feat, fix, refactor, docs, test, infra, validation, security
```

Examples:
```
feat(wallets): add transaction reservation flow
fix(ledger): prevent duplicate settlement posting
docs(sdk): update webhook retry documentation
infra(docker): update base image to debian-slim
```

### 4. Testing requirements

- All financial operations: unit tests + integration tests (real database — no mocks for financial invariant tests)
- Every financial operation must be idempotent
- Security changes: explicit test for the attack vector fixed
- Database migrations: reversible when possible, tested before merging

### 5. Documentation requirements

For new features:
- Update the relevant section in `docs/domains/<domain-name>/`
- Update `docs/BANZA_REFERENCE.md` if the feature changes the operator's public-facing behaviour
- API changes require OpenAPI spec updates in `contracts/`

### 6. Pull request

- Write a clear description of what changes and why
- Reference the issue number
- Ensure CI passes before requesting review

---

## Financial Invariants

Any contribution touching payment flows must preserve:

| Invariant | Rule |
|---|---|
| INV-LEDGER-001 | Débitos = Créditos em cada posting |
| INV-LEDGER-002 | Entradas de ledger são imutáveis |
| INV-STL-001 | gross_minor = net_minor + fee_minor |
| INV-STL-002 | Saldos nunca negativos |

See [BANZA_REFERENCE.md §7](../banza/BANZA_REFERENCE.md) for the full invariant list.

---

## Contact

- Bug reports: open a GitHub issue
- Security vulnerabilities: **security@banzami.com** (do NOT open a public issue)
- Protocol questions: open an issue or discussion in `github.com/banza-protocol/banza`
