# Anexo B — Contrato de Participação do Comerciante (Piloto Fase 1)

Versão: 1.0 · Data: __ / __ / 20__

> **Enquadramento institucional.** O Banzami é o operador de referência da rede BANZA,
> sociedade comercial independente e **não autorizada** até aprovação ou não-objecção
> do Banco Nacional de Angola (BNA). Este documento respeita a um **piloto proposto
> (Fase 1)**, de coorte fechada, e **não** constitui prestação de serviço em produção.
> A Fase 0 foi evidência funcional interna, em Sandbox técnico, com dados e saldos
> sintéticos, sem dinheiro real, sem dados reais de clientes e sem fornecedores externos.

## 1. Objectivo (Finalidade)

Definir os termos de participação de um comerciante na coorte fechada do piloto,
regulando a aceitação de pagamentos instantâneos em Kwanza por QR, *link* de
pagamento, *checkout* online e pedido de pagamento, bem como as obrigações de conduta,
reconciliação e reporte.

## 2. Âmbito

- Comerciantes pessoas colectivas ou singulares (negócio) convidados para a coorte.
- Funcionalidades: carteira de negócio (Banzami Business), recebimento por QR, *link*
  de pagamento, *checkout* online, pedido de pagamento, restituições (Anexo E) e
  reconciliação diária (Anexo G).
- Exclui LIVE/produção, disponibilização ao público fora da coorte e liquidação por
  rails externos reais.

## 3. Partes / Participantes Afectados

- **Operador:** Banzami.
- **Comerciante participante:** aderente à coorte fechada.
- **Consumidores:** pagadores dentro do piloto (Anexo A).
- **Autoridade de supervisão:** BNA.

## 4. Obrigações

**Do comerciante:** prestar informação verdadeira de identificação e de negócio (KYB
aplicável); utilizar as funcionalidades apenas no âmbito do piloto; tratar reclamações
e restituições de forma célere (Anexo E); conservar a evidência das operações.

**Do operador:** disponibilizar a carteira de negócio e as ferramentas de recebimento;
aplicar os limites prudenciais do piloto; assegurar registo contabilístico por partidas
dobradas e reconciliação diária; garantir a protecção de dados (Anexo D); **não**
movimentar saldos fora das regras aprovadas.

## 5. Procedimento Operacional

1. Convite, verificação de elegibilidade e KYB do comerciante.
2. Criação da carteira de negócio e das credenciais de recebimento.
3. Aceitação expressa do presente Contrato antes da activação.
4. Recebimento de pagamentos (QR/*link*/*checkout*/pedido) dentro dos limites.
5. Reconciliação diária e conservação de evidência (Anexos G e H).

## 6. Controlos de Risco

- Limites prudenciais de recebimento (por operação, diário e de saldo) aplicados de
  forma determinística; rejeições não movimentam saldo nem alteram o registo.
- Registo imutável e reconciliável de cada movimento (partidas dobradas).
- Suspensão cautelar em caso de indício de fraude ou incidente material (Anexo F).

## 7. Evidência a Produzir

- Registo de adesão e KYB do comerciante.
- Trilho de auditoria dos recebimentos e restituições.
- Sumário de reconciliação diária (esperado vs registado) com discrepância zero.
- Correspondência com os resultados funcionais da Fase 0.

## 8. Relevância para o Reporte ao BNA

Evidencia a governação da relação com o comerciante, a integridade contabilística e a
reconciliação, elementos a integrar nos relatórios intermédio e final (Anexos H e I).

## 9. Versão / Data

Versão 1.0 · Data de emissão: __ / __ / 20__ · Próxima revisão: __ / __ / 20__.

## 10. Aprovação / Assinaturas

| Papel | Nome | Data | Assinatura |
|-------|------|------|-----------|
| Comerciante participante | | | |
| Operador (Banzami) | | | |

*Documento preparatório interno. Não constitui prova de autorização, admissão a
sandbox regulatório, prontidão de produção nem prestação de serviço em produção.*
