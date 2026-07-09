# Pacote de Anexos — Candidatura Fase 1 ao BNA (Banzami)

Versão: 1.0 · Data: __ / __ / 20__

> **Enquadramento.** O Banzami é o operador de referência da rede BANZA, sociedade
> comercial independente e **não autorizada** para prestação de serviços de pagamento
> até aprovação ou não-objecção do Banco Nacional de Angola (BNA). Este pacote é
> **preparatório e interno** e respeita a um **piloto proposto (Fase 1)**, de coorte
> fechada. Separa-se claramente a **Fase 0** (evidência funcional interna, em Sandbox
> técnico, com participantes e saldos sintéticos, sem dinheiro real, sem dados reais de
> clientes e sem fornecedores externos) da **Fase 1** (piloto proposto, sujeito a
> aprovação do BNA). Não é reivindicada aprovação/admissão do BNA, prontidão de
> produção, disponibilização pública, pagamentos reais, uso de dados reais nem
> activação de fornecedor externo.

## Fontes (fonte de verdade)

- Plano de Teste Detalhado Banzami V1.0 (actualizado).
- Evidência consolidada da Fase 0: `evidence/phase0/PHASE0_CLOSURE_NOTE.md`,
  `PHASE0_FUNCTIONAL_TEST_REPORT.md`, `PHASE0_ONLINE_PLATFORM_API_SDK_RESULTS.md`.

Estado consolidado da Fase 0 (referência): PASS 29 · FAIL 0 · SIMULATED 6 · DEFERRED 0
· BLOCKED 0. Simulações limitadas em vigor: entrega/repetição de *webhooks* (exige
recetor público HTTPS); liquidação por rail externo EMIS/HMAC; ensaio de reinício de
serviço; classificação de incidentes em mesa.

## Índice de Anexos

| Anexo | Documento |
|-------|-----------|
| A | Termo de Consentimento do Consumidor |
| B | Contrato de Participação do Comerciante |
| C | Termo da Plataforma / Integrador Técnico |
| D | Política de Protecção de Dados |
| E | Reclamações e Restituições |
| F | Incidentes, Fraude e Suspensão |
| G | Reconciliação Diária |
| H | Modelo de Relatório Intermédio ao BNA |
| I | Modelo de Relatório Final da Fase 1 |
| J | Procedimento de API/SDK, Chaves e Webhooks |
| K | Reserva, Contingência e Salvaguarda |
| L | Infra-estrutura, Segurança e Operação |

Documentação interna de infra-estrutura complementar (sanitizada): ver
`docs/infra/BANZAMI_SANDBOX_INFRASTRUCTURE_RUNBOOK.md`,
`docs/infra/BANZAMI_SERVER_MIGRATION_CHECKLIST.md` e
`docs/infra/BANZAMI_INFRASTRUCTURE_SECURITY_MODEL.md`.

## Princípios transversais

- Todos os fluxos limitados a **coorte fechada**.
- Funcionalidades abrangidas, quando aplicável: QR, *link* de pagamento, intenção de
  pagamento, *checkout* online, API/SDK, plataforma/integrador e *webhooks*.
- As plataformas/integradores **não detêm fundos, não calculam saldos e não emitem
  comprovativos financeiros**.
- O Banzami permanece **não autorizado** até aprovação/não-objecção do BNA.
