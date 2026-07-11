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
  links, QR), Console para workspaces/projetos/chaves, artefactos de referência
  do protocolo e o pacote de onboarding de preview.
- **EN** · Verified Sandbox routes (identity, payment sessions, payment links,
  QR), Console for workspaces/projects/keys, protocol reference artifacts, and
  the preview onboarding package.

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

## O que é simulado / What is simulated

- **PT** · A entrega outbound de webhooks para sinks HTTPS públicos externos no
  conjunto E2E público (emissão, assinatura HMAC e contrato de retries
  verificados; jornada DOA verificada).
- **EN** · Outbound webhook delivery to external public HTTPS sinks in the
  public E2E suite (emission, HMAC signing and retry contract verified; DOA
  journey verified).

## O que não está disponível / não aprovado — What is not available / not approved

- **PT** · Trilhos de Produção/live, pay/checkout públicos, fornecedores
  externos, emissão de chaves live, scopes developer de reembolsos/
  transferências (Pendente E2E — 403), Console operacional (páginas visuais são
  demo), Stage C (não implementado/não aprovado).
- **EN** · Production/live rails, public pay/checkout, external providers, live
  key issuance, developer refunds/transfers scopes (Pending E2E — 403),
  operational Console (visual pages are demo), Stage C (not implemented/not
  approved).

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
