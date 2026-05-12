# Banzami

Modern financial infrastructure for Angola.

Banzami is a national-scale fintech platform providing payments, wallets, settlement, reconciliation, merchant infrastructure, and payout systems. It is engineered to banking-grade reliability, financial correctness, and infrastructure-level scalability.

> **See [CLAUDE.md](CLAUDE.md) for the full Engineering Constitution.** All architectural and operational decisions must conform to it. Reading it is mandatory before contributing.

## Status

Pre-implementation scaffolding. The directory tree has been bootstrapped; no production code yet.

## Repository Layout

```
banzami/
├── apps/         Next.js applications (dashboard, admin, docs)
├── services/     Go services (api-gateway, public-api, admin-api)
├── core/         Rust financial core (ledger, wallets, settlement, …)
├── sdk/          Client SDKs (Flutter, TypeScript)
├── plugins/      E-commerce integrations (WooCommerce, Shopify)
├── infra/        Docker, Terraform, monitoring, deployment
├── docs/         Architecture, ADRs, runbooks, domain docs
├── tools/        Internal developer tooling
├── CLAUDE.md     Engineering Constitution (mandatory reading)
└── README.md     This file
```

Each top-level directory contains a `README.md` describing its scope, contents, and conventions.

## Technology Stack

| Layer                | Technology                            |
| -------------------- | ------------------------------------- |
| Financial core       | Rust                                  |
| API & orchestration  | Go                                    |
| Frontend             | TypeScript, Next.js, React            |
| Mobile               | Flutter                               |
| Database             | PostgreSQL                            |
| Cache & coordination | Redis                                 |
| Observability        | OpenTelemetry, Prometheus, Grafana    |
| Infrastructure       | Docker, Hetzner / OVH, Cloudflare     |

See CLAUDE.md §3 for rationale. Kubernetes is intentionally deferred (§3.8).

## Engineering Principles (Summary)

1. **Financial correctness first** — double-entry accounting, immutable ledger, never mutate balances directly.
2. **Reliability over hype** — adopt technology only if it improves reliability, security, maintainability, or scalability.
3. **Modular monolith first** — microservices only when operationally necessary.
4. **Documentation is mandatory** — undocumented features are incomplete.
5. **Readability over cleverness** — explicit, predictable, maintainable code.

## Branch & Commit Conventions

Branches: `feature/*`, `fix/*`, `infra/*`, `security/*`, `docs/*`

Commits: `type(scope): description`

Examples:

```
feat(wallets): add transaction reservation flow
fix(ledger): prevent duplicate settlement posting
docs(api): update webhook retry documentation
```

See CLAUDE.md §12.

## Contributing

1. Read [CLAUDE.md](CLAUDE.md) — the engineering constitution is binding.
2. All implementations require accompanying documentation per §5 (architecture notes, operational notes, security notes, README updates).
3. All major technical decisions require an ADR under [`docs/adr/`](docs/adr/).
4. All money movement must use double-entry accounting and integer minor units (§10).
