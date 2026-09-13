# Developer documentation — terminology (PT ↔ EN)

Version: 1.0

The canonical vocabulary of the public developer documentation at
developers.banzami.com. Portuguese is European Portuguese as written in Angola
(AO90 spelling); English is written natively, not translated from the
Portuguese. Technical meaning is identical in both languages.

Enforced by `tools/check-docs-editorial.mjs` (AWKWARD_TRANSLATION, REGIONAL,
UNPROFESSIONAL, MARKETING, INTERNAL, AI_SOUNDING rules) and by the PT/EN
structure and claims-ledger gates. A term that is not in this table and is not a
literal from the API (a field, a code, a header) should be added here before it
is used in the documentation.

## Product and account model

| PT | EN | Rule |
|---|---|---|
| Banzami (masculino: *o* Banzami, *do* Banzami) | Banzami | Operator and product name. Never "a Banzami". |
| BANZA | BANZA | The protocol only. Not the product, not the SDK. |
| Consola | Console | The developer console. PT never "Console" in prose. |
| conta (de pessoa) | account | The sign-in identity. |
| workspace | workspace | Kept in PT: it is the Console's own label. |
| projeto | project | AO90: *projeto*, not *projecto*. |
| Business | Business | The verified entity that receives money. Capitalised in both languages; PT does not translate it. |
| configuração financeira | Financial Setup | PT lower case in prose, EN title case (Console label). PT never "Financial Setup". |
| conta (wallet account) | account | A segregated account inside a Business. PT prose says *conta*; "(wallet account)" appears once, in the glossary. |
| @banza | @banza handle | Banzami's word for a handle. Not the protocol. |
| implementação de referência | reference implementation | DOA. |
| cliente privilegiado do Banzami | privileged Banzami tenant | Used once, to say DOA is *not* one. PT never "tenant" or "inquilino". |

## Environments

| PT | EN | Rule |
|---|---|---|
| Sandbox | Sandbox | The current public environment. Capitalised. |
| Financial Live | Financial Live | Not available; described as *indisponível (fail-closed)* / *unavailable (fail-closed)*. |
| dinheiro fictício | test money | Sandbox balances. |

## Money

| PT | EN | Rule |
|---|---|---|
| unidades menores | minor units | `amount_minor`; 100 = 1 Kz. Taught at the first money example of every guide. |
| montante | amount | |
| taxa | fee | Never "comissão" for the operator fee. |
| bruto / taxa / líquido | gross / fee / net | Settlement amounts. |
| pontos base (bps) | basis points (bps) | 200 bps = 2%. |
| perfil de preço | pricing profile | Assigned by Banzami; never chosen by the developer. |
| destino da taxa | fee destination | |
| saldo | balance | |

## Payments and money movement

| PT | EN | Rule |
|---|---|---|
| sessão de pagamento | Payment Session | EN title case (resource name); PT lower case in prose. PT never "payment session". |
| link de pagamento | Payment Link | Same rule. |
| página de pagamento | payment page | pay.banzami.com. |
| pagador | payer | |
| beneficiário | beneficiary | Of a settlement. |
| transferência | transfer | Between a project's accounts. |
| reembolso (total, parcial) | refund (full, partial) | |
| liquidação | settlement | PT never "settlement" in prose; the event names keep `application_settlement.*`. |
| transação | transaction | AO90: *transação*. |
| comprovativo | receipt | The proof document. |
| referência de prova (`BZM-…`) | proof reference | Publicly verifiable. |
| referência da transação | transaction reference | The 8-character activity reference; not publicly verifiable. |
| recetor | receiver | AO90: *recetor*. |

## Integration

| PT | EN | Rule |
|---|---|---|
| chave de API / chave secreta / chave publicável | API key / secret key / publishable key | |
| scope | scope | Kept in PT: it is the literal permission name. |
| rodar (uma chave, um segredo) | rotate | PT never "rotacionar". |
| revogar | revoke | |
| segredo do webhook | webhook secret | |
| assinatura | signature | `banza-signature`. |
| entrega / reentrega | delivery / replay | PT never "retry" in prose; *nova tentativa*. |
| deduplicar | deduplicate | |
| idempotência / chave de idempotência | idempotency / idempotency key | |
| pedido / resposta | request / response | PT never "requisição". |
| registos | logs | Console → Registos / Console → Logs. |
| atividade | activity | Workspace administrative record. |
| prontidão | readiness | PT never "readiness" in prose. |
| candidatura | application | A Business verification application. |
| código de consentimento | consent code | Connecting an existing Business. |

## Regional rules (PT)

Angola/Portugal usage, never Brazilian: *utilizador* (not usuário), *ficheiro*
(not arquivo), *ecrã* (not tela), *telemóvel* (not celular), *registo* (not
cadastro), *gerir* (not gerenciar), *palavra-passe* (not senha).

## Register

- Professional financial language. No colloquialisms ("a sério", "quem quiser",
  "vaquinha", "é só", "basta"; EN "just", "simply", "easy").
- No marketing adjectives, no internal vocabulary (gate, assurance, binding, root
  wallet, ADR, RA-numbers), no AI-sounding filler.
- Page intros state what the thing is and when to use it; never "Esta página
  explica" / "This page explains".
- Headings are actions or nouns a developer searches for.
- Links name their destination; never "clique aqui" / "click here".
