# Banzami Developers Docs — Proposed Information Architecture

Version: 1.0
Status: **PROPOSAL ONLY — NOT IMPLEMENTED.** Companion to
[DOCUMENTATION_AUDIT.md](DOCUMENTATION_AUDIT.md).

Design inputs: Flask (Quickstart → Tutorial → Guides → Reference layering), Bitcoin
Developer (hard Guide/Reference/Examples/Glossary separation), Stripe (per-endpoint
depth, test fixtures, credential-scoped truth) — combined with Banzami's unique
test-guarded honesty system, which this IA preserves and extends.

## Principles

1. **Honesty is architecture.** One machine-readable availability map drives every
   badge; honesty tests cover every developer-facing page. Nothing may claim more
   than `evidence/developer-platform/*` supports.
2. **Guide ≠ Reference.** Guides teach a task once; the reference is exhaustive per
   resource. No page mixes both.
3. **curl-first.** Every capability is demonstrated with a copy-pasteable curl
   request AND its real Sandbox response before any SDK appears. SDKs are optional
   accelerators (they are not published yet — the docs must never depend on them).
4. **Credential-scoped truth.** Every endpoint page states which credential can call
   it *today* (developer key scope · merchant credential · internal-only), so
   "Disponível em Sandbox" is always true for the reader, not just the platform.
5. **Portuguese first** (pt-PT), EN later (P2). Section labels stay consistent.

## Proposed tree

```text
developers.banzami.com/docs
│
├── 1. Começar
│   ├── 1.1 Introdução                  ← rewrite of current intro (3 camadas, DOA ref, ProducaoCard)
│   ├── 1.2 Quickstart (15 min)         ← curl-first: OTP→console→chave→GET /v1/me→payment session; real req+resp
│   ├── 1.3 Tutorial completo           ← NEW: payment link + webhook assinado, fim-a-fim no Sandbox
│   └── 1.4 Ambientes                   ← NEW: Sandbox vs Produção (em preparação), o que muda, chaves bz_test_/bz_live_
│
├── 2. Guias
│   ├── 2.1 Autenticação e chaves       ← NEW: tipos de chave, troca chave→token (mostrada), rotação, revelação única
│   ├── 2.2 Sessões de pagamento        ← NEW guia de tarefa (+link, +QR da sessão)
│   ├── 2.3 Payment links               ← NEW (criação, slug público, estados, mark-used)
│   ├── 2.4 QR Banzami                  ← NEW (estático/dinâmico/decode/pay)
│   ├── 2.5 Transferências              ← rewrite (credencial correta, idempotência mostrada, COMPLETED síncrono)
│   ├── 2.6 Reembolsos                  ← rewrite (typed-source ADR-030, cap acumulado, replay idempotente)
│   ├── 2.7 Webhooks                    ← rewrite: assinatura (mantida) + contrato de retries + como testar
│   ├── 2.8 Idempotência                ← NEW: o header/param real em todos os exemplos mutantes
│   ├── 2.9 Erros e resolução           ← NEW: envelope, catálogo status↔código, o que fazer por erro
│   └── 2.10 Segurança                  ← NEW: segredos, allowlists, replay, boas práticas de webhook endpoint
│
├── 3. Referência da API
│   ├── 3.0 Convenções                  ← NEW: base URL, auth, versionamento /v1, paginação, rate limits + headers, envelope de erro
│   ├── 3.1 Identidade      (GET /v1/me)
│   ├── 3.2 Payment Sessions (business/payment-sessions · /{id} · /link · /qr)
│   ├── 3.3 Payment Links    (payment-links · público /public/pay/{slug})
│   ├── 3.4 Payment Requests (payment-requests · pay/decline/cancel)
│   ├── 3.5 QR               (qr/static|dynamic|decode|pay · /{id})
│   ├── 3.6 Transferências   (transfers)
│   ├── 3.7 Reembolsos       (refunds)
│   ├── 3.8 Webhooks         (endpoints · events · deliveries · replay · health)
│   └── 3.9 OpenAPI          ← P2: spec descarregável, referência gerada
│
├── 4. Testar no Sandbox
│   ├── 4.1 Cenários de teste           ← NEW: resultados determinísticos, montantes de teste
│   ├── 4.2 Fundos e instrumentos       ← NEW: sandbox/fund, sandbox/instruments, simulate/payment
│   └── 4.3 Testar webhooks             ← NEW: gerar payload assinado, verificar localmente
│
├── 5. SDKs
│   └── 5.1 Matriz de maturidade        ← rewrite: linhas ligadas a evidência; consumo por código-fonte;
│                                          anti-instrução "Não corra npm install" mantida até publicação real
│
├── 6. Plataforma
│   ├── 6.1 Disponibilidade             ← NEW: mapa único de badges (fonte das availability claims + testes)
│   ├── 6.2 Console: o que está ativo   ← NEW: páginas reais vs pré-visualização (dashboard/webhooks/logs = ilustrativos)
│   └── 6.3 Going Live                  ← NEW: pipeline com "Ativação de Produção — PENDENTE" (sem promessas de data)
│
├── 7. Changelog                        ← rewrite: entradas datadas, por capacidade
│
└── 8. Conceitos                        ← kept: glossário (19 termos, popovers, deep-links) — mover intacto
```

## Navigation model

- Left sidebar: the 8 top-level areas, expandable; scroll-spy within a page
  (current behaviour preserved).
- Every page: availability badge (from the single status map) + credential badge
  ("chamável com: chave de developer · credencial de merchant · interno").
- Code samples: tabbed **curl | TypeScript | Python | PHP** (curl always first and
  always complete: request + real Sandbox response). Copy button + toast kept.
- Glossary popovers (`GlossaryTerm`) available on every page, not only /docs.

## Content sourcing rules

| Content | Source of truth |
|---|---|
| Endpoint list & shapes | Gateway/developer-api routers + handlers (verified in repo) |
| Availability badges | Single status map, reconciled with `evidence/developer-platform/DEVELOPER_DOCS_WEBSITE_ALIGNMENT.md` |
| Webhook events | The 5 verified events only (test-enforced); retry contract from the outbox worker |
| Scopes & credentials | `AllowedScopes` closed set + release/binding gates (ADR-046/047) |
| SDK maturity | Evidence-linked matrix; no install commands until published |

## Honesty-system extensions (part of P0)

1. Forbidden-token tests extended to the overview page and every new docs page
   (unverified `payment.*` events, `/v1/charges`, marketing phrasings, install
   commands for unpublished packages).
2. A test asserting every availability badge value matches the status map.
3. A test asserting mock/stub Console pages render their non-operational label.

## Out of scope for the implementation PR(s)

No runtime changes, no Console feature work beyond labels, no Stage C, no SDK
publication, no production/live claims, no external-provider references.
