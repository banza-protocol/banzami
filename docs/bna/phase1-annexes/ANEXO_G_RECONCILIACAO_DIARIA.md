# Anexo G — Reconciliação Diária (Piloto Fase 1)

Versão: 1.0 · Data: __ / __ / 20__

> **Enquadramento institucional.** O Banzami é o operador de referência da rede BANZA,
> sociedade comercial independente e **não autorizada** até aprovação ou não-objecção
> do BNA. Este documento respeita a um **piloto proposto (Fase 1)**, de coorte fechada.
> Na Fase 0, a reconciliação foi computada a partir de resultados sintéticos reais dos
> testes, com discrepância zero, em Sandbox técnico (ver PHASE0_RECONCILIACAO/evidência).

## 1. Objectivo (Finalidade)

Estabelecer o procedimento de reconciliação diária entre o valor esperado (a partir das
operações do piloto) e o valor efectivamente registado no *ledger* e nos saldos das
carteiras, assegurando integridade e ausência de discrepância.

## 2. Âmbito

- Operações da coorte fechada: QR, *link* de pagamento, intenção de pagamento,
  *checkout* online e restituições.
- Reconciliação do que foi criado vs. o que foi liquidado, cruzada com o saldo derivado
  do *ledger*.
- Exclui reconciliação contra extractos externos reais (Fase 1 posterior/produção).

## 3. Partes / Participantes Afectados

- **Operador:** Banzami (executa e conserva a reconciliação).
- **Comerciantes e plataformas:** reconciliam contra o estado autoritativo do operador
  (a plataforma **não** calcula saldos nem detém fundos).
- **Autoridade de supervisão:** BNA.

## 4. Obrigações

**Do operador:** produzir diariamente o sumário de reconciliação; investigar e reportar
qualquer discrepância; conservar a evidência.

**Dos participantes:** conciliar os seus registos com o estado autoritativo do operador;
comunicar divergências.

## 5. Procedimento Operacional

1. Recolha das operações do dia e do valor esperado por participante.
2. Leitura dos saldos derivados do *ledger* (fonte autoritativa).
3. Comparação esperado vs. registado por participante (pagador, beneficiário, carteira).
4. Apuramento da discrepância total (meta: zero).
5. Registo do sumário e tratamento de eventuais divergências.

## 6. Controlos de Risco

- Saldos derivados do *ledger* (sem coluna de saldo persistida), garantindo integridade
  por partidas dobradas.
- Reconciliação como leitura-e-comparação, sem qualquer movimentação de valores.
- Trilho de auditoria do sumário diário.

## 7. Evidência a Produzir

- Sumário de reconciliação diária (esperado vs. registado, discrepância).
- Registo de tratamento de divergências (quando existam).
- Correspondência com a evidência sintética da Fase 0 (discrepância zero).

## 8. Relevância para o Reporte ao BNA

Demonstra integridade financeira e capacidade de reconciliação, elemento central dos
relatórios intermédio e final (Anexos H e I).

## 9. Versão / Data

Versão 1.0 · Data de emissão: __ / __ / 20__ · Próxima revisão: __ / __ / 20__.

## 10. Aprovação / Assinaturas

| Papel | Nome | Data | Assinatura |
|-------|------|------|-----------|
| Responsável Financeiro/Reconciliação (Banzami) | | | |
| Operador (Banzami) | | | |

*Documento preparatório interno. Não constitui prova de autorização, admissão a
sandbox regulatório, prontidão de produção nem prestação de serviço em produção.*
