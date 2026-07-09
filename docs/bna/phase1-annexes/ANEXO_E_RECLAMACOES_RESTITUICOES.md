# Anexo E — Reclamações e Restituições (Piloto Fase 1)

Versão: 1.0 · Data: __ / __ / 20__

> **Enquadramento institucional.** O Banzami é o operador de referência da rede BANZA,
> sociedade comercial independente e **não autorizada** até aprovação ou não-objecção
> do BNA. Este documento respeita a um **piloto proposto (Fase 1)**, de coorte fechada.
> Na Fase 0, a restituição/estorno foi validada de forma sintética, em Sandbox técnico,
> sem dinheiro real (ver PHASE0_ONLINE_PLATFORM_API_SDK_RESULTS e evidência consolidada).

## 1. Objectivo (Finalidade)

Estabelecer o procedimento de tratamento de reclamações e de execução de restituições
(estornos) no piloto, assegurando correcção do saldo, integridade contabilística e
protecção contra restituição em excesso.

## 2. Âmbito

- Reclamações de consumidores e comerciantes da coorte fechada.
- Restituições sobre pagamentos por carteira (`WALLET_PAYMENT`) liquidados no piloto.
- Exclui restituições sobre rails externos reais e qualquer operação em produção.

## 3. Partes / Participantes Afectados

- **Operador:** Banzami (executa a restituição e mantém o registo autoritativo).
- **Consumidor e comerciante:** partes da operação objecto de reclamação/restituição.
- **Plataforma/integrador:** pode consultar o estado; **não** executa nem contabiliza
  a restituição, nem emite comprovativo financeiro.
- **Autoridade de supervisão:** BNA.

## 4. Obrigações

**Do operador:** disponibilizar canal de reclamações; analisar e decidir de forma
tempestiva; executar a restituição por reversão contabilística (débito ao comerciante,
crédito ao consumidor); rejeitar restituição que exceda o valor capturado.

**Do comerciante:** cooperar na análise; aceitar as decisões dentro das regras do piloto.

## 5. Procedimento Operacional

1. Registo da reclamação (identificação da operação e do motivo).
2. Análise de elegibilidade e verificação do estado do pagamento.
3. Execução da restituição pela via aprovada (reversão por partidas dobradas).
4. Verificação de correcção de saldo (comerciante e consumidor) e do registo de reversão.
5. Rejeição determinística de restituição em excesso (limite do valor capturado).

## 6. Controlos de Risco

- Restituição apenas sobre fonte tipada e existente; guarda contra restituição em
  excesso (rejeição `REFUND_EXCEEDS_CAPTURED` ou equivalente).
- Reversão contabilística balanceada; ausência de meia-operação em caso de rejeição.
- Trilho de auditoria completo da reclamação até à restituição.

## 7. Evidência a Produzir

- Registo da reclamação e da decisão.
- Evidência da reversão (saldos antes/depois e registo de reversão).
- Evidência da guarda de restituição em excesso.
- Correspondência com a evidência sintética da Fase 0.

## 8. Relevância para o Reporte ao BNA

Demonstra a existência de mecanismo de conduta, correcção e protecção do consumidor,
com integridade contabilística, a integrar nos relatórios intermédio e final (Anexos
H e I).

## 9. Versão / Data

Versão 1.0 · Data de emissão: __ / __ / 20__ · Próxima revisão: __ / __ / 20__.

## 10. Aprovação / Assinaturas

| Papel | Nome | Data | Assinatura |
|-------|------|------|-----------|
| Responsável de Conduta/Reclamações (Banzami) | | | |
| Operador (Banzami) | | | |

*Documento preparatório interno. Não constitui prova de autorização, admissão a
sandbox regulatório, prontidão de produção nem prestação de serviço em produção.*
