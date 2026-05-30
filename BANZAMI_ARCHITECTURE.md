# Banzami — Arquitectura Técnica de Referência

> This document describes: **Banzami** — the reference operator implementation.
> For other layers: [BANZA](../banza/BANZA_ARCHITECTURE.md) · [BanzAI](../banzai/BANZAI_ARCHITECTURE.md)

**Version:** 1.0  
**Date:** 2026-05-30  
**Status:** Official  
**Authority:** ADR-025

---

## Nota de Propriedade

Esta secção descreve a arquitectura técnica do **Banzami** — a implementação de referência. Não é o único modo válido de implementar o protocolo BANZA. É o modo que o Banzami escolheu. Outros operadores podem usar stacks diferentes, desde que passem o conformance suite.

As regras do protocolo que esta arquitectura implementa estão definidas em [BANZA_ARCHITECTURE.md](../banza/BANZA_ARCHITECTURE.md) e [BANZA_REFERENCE.md §7](../banza/BANZA_REFERENCE.md).

---

## Stack Tecnológico

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| Núcleo financeiro | **Rust** | Ledger, wallet, transaction, settlement, QR, risk, compliance |
| API layer | **Go** | Public APIs, admin APIs, webhook delivery, authentication, gateway |
| Frontend | **TypeScript + Next.js** | Merchant dashboard, admin, analytics, developer console |
| Mobile | **Flutter** | Banzami Wallet app, mobile SDK |
| Database | **PostgreSQL** | Single source of financial truth |
| Cache | **Redis** | Caching, rate limiting, idempotency, distributed locking |
| Observabilidade | **OpenTelemetry + Prometheus + Grafana** | Traces, metrics, structured logs |
| Infra | **Docker + Hetzner/OVH + Cloudflare** | Deployment model |

**Por que Rust para o núcleo financeiro:** Segurança de memória sem garbage collector. Comportamento determinístico. O Rust é o único escritor das tabelas financeiras.

**Por que Go para os serviços de API:** Simplicidade, concorrência, compilação rápida, excelente tooling HTTP.

---

## Mapa de Serviços

```
Internet
  │
  ├─ pay.banzami.com          → apps/pay/          (Next.js 14, port 3003)
  ├─ pay.banzami.com/{slug}   → apps/checkout/     (Next.js 14, port 3004)
  ├─ dashboard.banzami.com    → apps/dashboard/    (Next.js 14, port 3000)
  │
  ├─ api.banzami.com          → api-gateway        (Go, port 8080)  ← merchants
  └─ consumer.banzami.com     → public-api         (Go, port 8083)  ← consumers

Internal network only
  └─ admin.internal          → admin-api          (Go, port 8082)  ← operators

Loopback only (127.0.0.1)
  └─ core-api                (Rust/Axum, port 8081)
```

---

## Diagrama de Componentes

```
┌────────────────────────────────────────────────────────────────────────┐
│                            EXTERNAL ZONE                               │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────┐    │
│  │ Merchant App │  │ Consumer App │  │  Pay Page  │  │Dashboard │    │
│  │  (server)   │  │  (Flutter)   │  │(Next.js 14)│  │(Next.js) │    │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  └────┬─────┘   │
└─────────┼──────────────────┼─────────────────┼───────────────┼────────┘
          │ JWT (API key)    │ JWT (PIN)        │ No auth       │ JWT
          ▼                 ▼                  ▼               ▼
┌─────────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   api-gateway   │ │  public-api  │ │  api-gateway │ │  api-gateway │
│   Go :8080      │ │  Go :8083    │ │  /public/pay │ │  (dashboard) │
└────────┬────────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
         └─────────────────┴─────────────────┴──────────────────┘
                                    │ HTTP (loopback)
                                    ▼
                         ┌──────────────────────┐
                         │       core-api        │
                         │     Rust/Axum :8081   │
                         │                       │
                         │  ┌─────────────────┐  │
                         │  │  Domain Engines  │  │
                         │  │  - ledger        │  │
                         │  │  - wallets       │  │
                         │  │  - transactions  │  │
                         │  │  - transfers     │  │
                         │  │  - payment-links │  │
                         │  │  - qr-codes      │  │
                         │  │  - merchants     │  │
                         │  │  - consumers     │  │
                         │  │  - settlements   │  │
                         │  │  - payouts       │  │
                         │  └─────────────────┘  │
                         └──────────┬─────────────┘
                                    │ SQL
                                    ▼
                         ┌──────────────────────┐
                         │      PostgreSQL       │
                         │  (single source of   │
                         │   financial truth)   │
                         └──────────────────────┘

                 ┌──────────────────────────┐
                 │       admin-api           │
                 │       Go :8082            │
                 │  (internal network only)  │
                 └──────────┬───────────────┘
                            │ HTTP (loopback)
                            └──► core-api
```

---

## Fronteiras de Linguagem

| Linguagem | Responsabilidade | Justificação |
|-----------|-----------------|-------------|
| **Rust** | Núcleo financeiro (ledger, wallets, transfers, settlements, reconciliation) | Segurança de memória, comportamento determinístico, abstrações de custo zero |
| **Go** | Serviços de API (api-gateway, public-api, admin-api) | Simplicidade, concorrência, compilação rápida, excelente tooling HTTP |
| **TypeScript / Next.js** | Frontends web (dashboard, pay page, docs site) | Tipagem forte para estado UI complexo; App Router para SSR |
| **Flutter / Dart** | SDK mobile e checkout widget | Cross-platform (iOS + Android), UX de pagamentos P2P familiar |

---

## Fluxo de Dados: Pagamento via Link

```
1. Merchant cria link
   POST api.banzami.com/v1/payment-links
     → api-gateway → POST core-api/internal/v1/payment-links
     → Devolve slug: "a3f7c2d19b40"
     → Merchant partilha: https://pay.banzami.com/a3f7c2d19b40

2. Consumer abre pay page
   GET pay.banzami.com/a3f7c2d19b40
     → Next.js server component
     → GET api-gateway/public/pay/a3f7c2d19b40
     → Server-renders página com montante, descrição, QR

3. Consumer paga (autenticado)
   POST consumer.banzami.com/v1/payment-links/a3f7c2d19b40/pay
     → public-api verifica JWT
     → GET core-api/internal/v1/payment-links/by-slug/a3f7c2d19b40
     → GET core-api/internal/v1/consumer-wallets?consumer_id=...
     → POST core-api/internal/v1/transfers  (sender→merchant wallet)
     → POST core-api/internal/v1/payment-links/{id}/mark-used
     → Devolve { status: "USED" }

4. Pay page detecta pagamento
   GET api-gateway/public/pay/a3f7c2d19b40/status → { "paid": true }
     → Mostra "Pagamento efectuado"
```

---

## Fluxo de Dados: Transferência P2P

```
1. Consumer autentica
   POST consumer.banzami.com/v1/auth/token
     → public-api verifica PIN contra public_api_credentials
     → Devolve JWT { customer_id: "...", scopes: ["consumer"] }

2. Consumer envia dinheiro
   POST consumer.banzami.com/v1/transfers
     { recipient_handle: "maria_shop", amount_minor: 25000, currency: "AOA" }
     → public-api resolve carteira do remetente via consumer_id
     → public-api resolve consumidor destinatário por handle
     → public-api resolve carteira do destinatário
     → POST core-api/internal/v1/transfers
        Motor Rust:
          1. Verificação de idempotência
          2. Verificação de saldo (available >= amount)
          3. Ledger posting (sender_account -25000, recipient_account +25000)
          4. Actualiza status da transferência = COMPLETED
          Tudo numa transacção PostgreSQL
     → Devolve transferência completada
```

---

## Fronteiras de Segurança

| Fronteira | Controlo |
|----------|---------|
| Internet → api-gateway | TLS, autenticação JWT, rate limiting (Redis) |
| Internet → public-api | TLS, autenticação JWT, rate limiting |
| Internet → admin-api | **Nunca exposto** — rede interna apenas |
| Go services → core-api | Loopback (127.0.0.1) + firewall; sem token de auth |
| core-api → PostgreSQL | Loopback; credenciais via `DATABASE_URL` env var |
| Secrets | Variáveis de ambiente; nunca no código fonte ou logs |

---

## Observabilidade

Todos os serviços Go expõem:
- `GET /health` — liveness probe (returns `200 ok`)
- `GET /metrics` — Prometheus metrics (request counts, durations, error rates)
- OpenTelemetry traces via OTLP quando `OTLP_ENDPOINT` está definido

O Rust core-api expõe o mesmo via o seu Axum router.

Grafana dashboards estão definidos em `infra/monitoring/`.

---

## Background Workers

| Worker | Serviço | Intervalo | Propósito |
|--------|---------|----------|---------|
| QR expiry | core-api | 60s | Expirar QR codes dinâmicos após `expires_at` |
| Payment link expiry | core-api | 60s | Expirar payment links após `expires_at` |

Ambos os workers usam `tokio::time::interval` com `MissedTickBehavior::Skip`.

---

## Grafo de Dependências

```
apps/pay          → api-gateway (public endpoints, sem auth)
apps/dashboard    → api-gateway (merchant JWT)
public-api        → core-api (loopback HTTP)
public-api        → PostgreSQL (credentials table only)
api-gateway       → core-api (loopback HTTP)
api-gateway       → PostgreSQL (webhooks table)
api-gateway       → Redis (rate limiting, idempotency)
admin-api         → core-api (loopback HTTP)
core-api          → PostgreSQL (all financial data)
sdk/flutter       → public-api, api-gateway
sdk/typescript    → api-gateway
sdk/python        → api-gateway
apps/checkout     → api-gateway (public endpoints)
plugins/*         → api-gateway
```

---

## Implementação de Invariantes

O Banzami implementa os invariantes financeiros do protocolo BANZA (ver [BANZA_REFERENCE.md §7](../banza/BANZA_REFERENCE.md)) através do Rust core-api. Os invariantes são impostos no nível do kernel — não no nível da API ou da UI.

Nenhum código Go ou TypeScript pode violar os invariantes financeiros: só o Rust core-api escreve nas tabelas financeiras, e o Rust impõe os invariantes em tempo de compilação e em tempo de execução.

---

**Referências:**

- ADR-001 — Go/Rust service boundary
- ADR-002 — Double-entry ledger
- ADR-005 — Modular monolith
- ADR-013 — Wallet-native identity
- [BANZA_ARCHITECTURE.md](../banza/BANZA_ARCHITECTURE.md) — Protocol kernel architecture
- [BANZAMI_DEPLOYMENT.md](BANZAMI_DEPLOYMENT.md) — How to deploy this architecture
- [BANZAMI_OPERATIONS.md](BANZAMI_OPERATIONS.md) — How to operate this architecture
- `docs/architecture/` — Detailed per-domain architecture docs
