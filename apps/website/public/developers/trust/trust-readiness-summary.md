# Banzami Developers — Trust & Readiness Summary / Resumo de Confiança e Prontidão

<!--
scope: sandbox_preview
production_contract: false
regulatory_approval: false
live_rails: false
real_money: false
public_sdk_packages_published: false
self_service_access: false
-->

> **PT** · Este resumo apoia a avaliação técnica de parceiros aprovados em
> Sandbox/Preview. Não é um contrato de Produção, não ativa trilhos live, não
> autoriza dinheiro real e não representa aprovação regulatória. O acesso ao
> preview é controlado — não é um registo público self-service.
>
> **EN** · This summary supports technical assessment for approved partners in
> Sandbox/Preview. It is not a Production contract, does not activate live
> rails, does not authorize real money, and does not represent regulatory
> approval. Preview access is controlled — not a public self-service signup.

## O que está disponível agora / What is available now

- **PT** · Rotas Sandbox verificadas (identidade, sessões de pagamento, payment
  links, QR, contas de projeto, transferências entre contas do mesmo titular,
  reembolsos e webhooks — todas com chave de projeto), Console para
  workspaces/projetos/chaves e as páginas de Webhooks e Actividade com os dados
  reais do projeto, artefactos de referência do protocolo e o pacote de
  onboarding de preview.
- **EN** · Verified Sandbox routes (identity, payment sessions, payment links,
  QR, project accounts, transfers between accounts of the same owner, refunds
  and webhooks — all with a project key), the Console for workspaces/projects/
  keys plus the Webhooks and Activity pages showing the project's real data,
  protocol reference artifacts, and the preview onboarding package.

## O que é Sandbox/Preview apenas / What is Sandbox/Preview only

- **PT** · Tudo nesta documentação. Nunca há dinheiro real; as chaves `bz_live_`
  são recusadas fail-closed.
- **EN** · Everything in this documentation. No real money ever moves;
  `bz_live_` keys are rejected fail-closed.

## O que é controlado / What is controlled

- **PT** · O acesso aos SDKs (pré-visualização controlada, pacotes não
  publicados) e o onboarding de parceiros (elegibilidade → aprovação → revisão).
- **EN** · SDK access (controlled preview, packages not published) and partner
  onboarding (eligibility → approval → review).

## O que já não é simulado / What is no longer simulated

- **PT** · A entrega outbound de webhooks. É verificada no Sandbox implantado
  contra um recetor HTTPS genuinamente público: assinatura confirmada de forma
  independente sobre os bytes originais, rejeição de adulteração do corpo, do
  digest e do timestamp, retries com backoff e isolamento de falhas. A entrega
  em Produção continua fora do âmbito.
- **EN** · Outbound webhook delivery. It is verified on the deployed Sandbox
  against a genuinely public HTTPS receiver: signature confirmed independently
  over the raw bytes, tamper rejection of body, digest and timestamp, retries
  with backoff and failure isolation. Production delivery remains out of
  scope.

## O que não está disponível / não aprovado — What is not available / not approved

- **PT** · Trilhos de Produção/live, pay/checkout públicos (não implantados —
  pay.banzami.com responde 503), fornecedores externos, emissão de chaves live,
  SDK Flutter (não publicado no pub.dev), dashboard da Consola (pré-visualização
  demo), Stage C (não implementado/não aprovado).
- **EN** · Production/live rails, public pay/checkout (not deployed —
  pay.banzami.com answers 503), external providers, live key issuance, the
  Flutter SDK (not published on pub.dev), the Console dashboard (demo preview),
  Stage C (not implemented/not approved).

## Como a honestidade é mantida / How honesty is enforced

- **PT** · Suites de testes de claims (P0–P2E) guardam vocabulário proibido,
  estados de disponibilidade, ausência de comandos de instalação falsos e
  paridade dos artefactos públicos com as fontes.
- **EN** · Claim-safety test suites (P0–P2E) guard forbidden vocabulary,
  availability states, absence of fake install commands, and public-artifact
  parity with the repo sources.

## Artefactos / Artifacts

`/developers/trust/developer-trust-summary.json` ·
`/developers/trust/sandbox-evidence-map.json` ·
`/developers/trust/risk-limitations-matrix.json` ·
`/developers/trust/partner-readiness-package.json` ·
`/developers/trust/decision-gates.json` ·
`/developers/trust/preview-security-posture.json` ·
`/developers/artifacts/manifest.json`

**PT** · Nenhum portão nesta documentação autoriza trilhos live, pagamentos com
dinheiro real, lançamento público, emissão de chaves de Produção ou aprovação
regulatória.

**EN** · No gate in this documentation authorizes live rails, real-money
payments, public launch, production key issuance, or regulatory approval.
