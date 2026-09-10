# developers.banzami.com — Application Integration (portal outline)

**Status:** Draft (content source for the developer portal) · **Version:** 1.0

This is the canonical structure for the public developer portal. Each entry maps
to existing operator documentation so the portal is assembled from source-of-truth
docs, never rewritten by hand. The **DOA** integration is the official end-to-end
example.

## Table of contents

1. **Introdução** — what Banzami is; the app/operator boundary
   → [architecture/application-integration-engine.md §1–3](../architecture/application-integration-engine.md)
2. **Primeiros passos** — sandbox first, SDK-first
   → [architecture/authentication-engine.md](../architecture/authentication-engine.md)
3. **Criar aplicação / Business** → [ADR-028](../adr/ADR-028-application-business-account-requirement.md), [architecture/business-accounts.md](../architecture/business-accounts.md)
4. **Obter API Key** → [architecture/authentication-engine.md](../architecture/authentication-engine.md)
5. **Prontidão financeira do Projecto** (`GET /v1/financial-setup`, `getFinancialSetup()`) → [application-integration-engine.md §4](../architecture/application-integration-engine.md#4-financial-readiness--get-v1financial-setup), [ADR-057](../adr/ADR-057-project-financial-readiness.md). (`GET /v1/integration` é apenas a vista da sessão do comerciante → [architecture/business-resolution-engine.md](../architecture/business-resolution-engine.md).)
6. **Receber pagamentos** → [ADR-030](../adr/ADR-030-payment-sessions.md), [architecture/qr-engine.md](../architecture/qr-engine.md)
7. **Collections** → [architecture/collections-implementation-plan.md](../architecture/collections-implementation-plan.md)
8. **Split Bill** → Collections (equal split)
9. **Settlement** → [architecture/settlement-resolution-engine.md](../architecture/settlement-resolution-engine.md), [ADR-057](../adr/ADR-057-project-financial-readiness.md) (substitui o ADR-029)
10. **Application Fee** — a taxa é do operador, o destino é da aplicação → [application-integration-engine.md §7](../architecture/application-integration-engine.md#7-application-fee-who-prices-who-receives)
11. **Operator Fee** → [architecture/pricing-resolution-engine.md](../architecture/pricing-resolution-engine.md), [architecture/economic-model.md](../architecture/economic-model.md)
12. **Pricing** (perfis de preço atribuídos pelo operador) → [architecture/pricing-mapping.md](../architecture/pricing-mapping.md), [ADR-031](../adr/ADR-031-transaction-type-pricing-dimension.md)
13. **SDK Flutter** → [architecture/integration-ecosystem.md §3.1](../architecture/integration-ecosystem.md)
14. **SDK TypeScript** → [architecture/integration-ecosystem.md §3.2](../architecture/integration-ecosystem.md)
15. **SDK REST** → [architecture/integration-ecosystem.md — Layer 1](../architecture/integration-ecosystem.md)
16. **Webhooks** → [architecture/authentication-engine.md — Webhooks](../architecture/authentication-engine.md)
17. **Troubleshooting** → [application-integration-engine.md §13](../architecture/application-integration-engine.md#13-errors), [~/doa/docs/integration/troubleshooting.md]
18. **FAQ** — the responsibility table ([§3](../architecture/application-integration-engine.md#3-responsibilities-the-hard-boundary))
19. **Boas práticas** — SDK-first, sandbox-first, resolve-don't-derive, verify webhooks
20. **Exemplo completo (DOA)** — the canonical reference (below)

## Canonical example — DOA (end to end)

The portal's flagship walkthrough, mirroring a real integration from zero:

1. **Criar a conta Business** `@doa` (donation category).
2. **Autenticar** com a API Key sandbox (`bz_test_*`) → JWT via SDK.
3. **Ler a prontidão financeira** com `GET /v1/financial-setup`
   (`getFinancialSetup()`, chave do Projecto, scope `identity:read`): estado do
   Financial Setup, @banza, KYB, wallet, perfil de preço, elegibilidade do destino
   da taxa e `settlement.ready` com `blockers` / `warnings`. A prontidão é
   calculada pelo core com as mesmas regras que a liquidação aplica. Uma chave de
   Projecto em `GET /v1/integration` recebe 403 `USE_FINANCIAL_SETUP`.
4. **Taxas** — nenhuma aplicação envia uma taxa. A taxa de liquidação vem do
   perfil de preço que o operador atribuiu (p. ex. `sandbox-default`: liquidação
   0 bps / levantamento 75 bps; `sandbox-reference`: 200 / 75). A DOA indica
   apenas **quem** recebe a taxa (`fee_destination_banza_name: "@doa"`). Se a taxa
   resolvida for > 0, `@doa` tem de ser uma conta Business ACTIVE, com KYB
   APPROVED, wallet ACTIVE e classificada `APPLICATION` / `PLATFORM` pelo operador
   (ADR-028); se for 0, não é exigido destino. Qualquer campo de preço no pedido
   (`application_fee_bps`, …) é recusado com 400 `PRICING_FIELD_NOT_ACCEPTED`.
5. **Receber pagamentos** — cada vaquinha cria uma sub-conta `CAMPAIGN` e uma
   Payment Session; o doador paga por link/QR; o operador credita a sub-conta.
6. **Liquidação** — no fecho, o operador aplica a taxa do perfil atribuído,
   regista no ledger (taxa → destino, líquido → beneficiário) e paga o
   beneficiário; a DOA reflete o estado.
7. **Auditoria** — cada transação tem `request_id` + prova pública `/r/{ref}`
   ([architecture/public-verification-engine.md](../architecture/public-verification-engine.md)).

DOA source docs: `~/doa/docs/integration/banzami-integration.md` (+ `deployment.md`,
`configuration.md`, `troubleshooting.md`).

## Diagrams (all SVG, `SVG-BZ-*`, README visual language)

`banzami-application-integration-v1` · `banzami-business-resolution-v1` ·
`banzami-application-fee-v1` · `banzami-settlement-flow-v1` ·
`banzami-integration-lifecycle-v1` · reuse `banzami-doa-example-v1`,
`banzami-wallet-accounts-v1`, `banzami-money-flow-v1`, `banzami-ecosystem-architecture-v1`.

> **Diagramas desactualizados (anteriores ao ADR-057):** `banzami-business-resolution-v1`
> e `banzami-integration-lifecycle-v1` ainda mostram `GET /v1/integration` como
> superfície de prontidão; `banzami-application-fee-v1`,
> `banzami-application-integration-v1`, `banzami-settlement-flow-v1` e
> `banzami-doa-example-v1` ainda mostram uma taxa escolhida pela aplicação. Até
> serem redesenhados, o texto é a referência.

> Rule for the portal: **never PNG, never Mermaid** — SVG only, in the Banzami
> visual language, so the public docs match the README and stay consistent.
