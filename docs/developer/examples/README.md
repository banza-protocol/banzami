# Banzami Developers — Examples & Fixtures / Exemplos e Fixtures

Version: 1.0

> **PT** · Artefactos de repositório para revisão e futura publicação — não são
> downloads alojados. Descrevem apenas o âmbito da documentação
> **Sandbox/Pré-visualização** atual: nunca há dinheiro real, não há trilhos live,
> não há fornecedores externos, e nada aqui é um contrato de Produção. Todos os
> valores são placeholders óbvios (`bz_test_sk_XXXX`, `idem_xxx`, `req_xxx`,
> `payment_session_xxx`) — nunca credenciais reais.
>
> **EN** · Repository artifacts for review and future publishing — not live
> hosted downloads. They describe only the current **Sandbox/Preview**
> documentation scope: no real money ever moves, there are no live rails, no
> external providers, and nothing here is a Production contract. All values are
> obvious placeholders — never real credentials.

## Contents / Conteúdo

| File | PT | EN |
|---|---|---|
| `curl/get-me.sh` | Primeira chamada (`GET /v1/me`) — sem SDK | First call (`GET /v1/me`) — no SDK required |
| `curl/create-payment-session.sh` | Criar sessão de pagamento com `Idempotency-Key` | Create a payment session with `Idempotency-Key` |
| `fixtures/get-me.response.json` | Resposta real observada (placeholders) | Observed response shape (placeholders) |
| `fixtures/create-payment-session.request.json` | Corpo do pedido | Request body |
| `fixtures/create-payment-session.response.json` | Resposta com interfaces link/QR | Response with link/QR interfaces |
| `fixtures/error.validation_error.json` | Envelope de erro canónico (400) | Canonical error envelope (400) |
| `fixtures/error.unauthorized.json` | Envelope de erro canónico (401) | Canonical error envelope (401) |
| `fixtures/webhook.event.example.json` | Envelope de evento implementado; o conteúdo de `data` **não é contratual** | Implemented event envelope; the `data` content is **non-contractual** |

## Related / Relacionados

- OpenAPI: [`../openapi/banzami-sandbox.openapi.json`](../openapi/banzami-sandbox.openapi.json)
- Postman: [`../postman/banzami-sandbox.postman_collection.json`](../postman/banzami-sandbox.postman_collection.json)
- Availability matrix / Matriz de disponibilidade: [`../availability/banzami-developers-availability.json`](../availability/banzami-developers-availability.json)
- Docs PT: `developers.banzami.com/docs` · Docs EN: `developers.banzami.com/docs/en`

**PT** · Reembolsos e transferências permanecem **Pendente E2E** para chaves
developer (403) e por isso não têm exemplos aqui. A entrega outbound de webhooks
permanece **simulada** no conjunto E2E público. Não corra `npm install
@banzami/sdk` — os SDKs ainda não estão publicados; o caminho oficial é HTTP
direto (curl).

**EN** · Refunds and transfers remain **Pending E2E** for developer keys (403)
and therefore have no examples here. Outbound webhook delivery remains
**simulated** in the public E2E suite. Do not run `npm install @banzami/sdk` —
the SDKs are not yet published; direct HTTP (curl) is the official path.
