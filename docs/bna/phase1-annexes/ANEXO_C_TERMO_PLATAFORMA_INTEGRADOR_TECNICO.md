# Anexo C — Termo da Plataforma / Integrador Técnico (Piloto Fase 1)

Versão: 1.0 · Data: __ / __ / 20__

> **Enquadramento institucional.** O Banzami é o operador de referência da rede BANZA,
> sociedade comercial independente e **não autorizada** até aprovação ou não-objecção
> do BNA. Este documento respeita a um **piloto proposto (Fase 1)**, de coorte fechada.
> A Fase 0 foi evidência funcional interna, em Sandbox técnico, com dados sintéticos.

> **Princípio estruturante — a plataforma não é uma instituição financeira.** A
> plataforma/integrador técnico **NÃO detém fundos**, **NÃO calcula saldos** e **NÃO
> emite comprovativos financeiros**. A plataforma apenas: (i) cria pedidos de
> pagamento; (ii) recebe o estado técnico das operações; (iii) recebe eventos/*webhooks*;
> (iv) consulta o estado do pagamento/comprovativo; e (v) reconcilia contra o estado
> autoritativo do Banzami. Toda a detenção de fundos, cálculo de saldos e emissão de
> comprovativos é exclusiva do operador Banzami e do registo contabilístico do protocolo.

## 1. Objectivo (Finalidade)

Regular a integração técnica de uma plataforma/integrador (aplicação, *marketplace*,
*software* de comércio) na coorte fechada do piloto, através das SDK/API oficiais,
delimitando responsabilidades, autenticação por chave de API e recepção de eventos.

## 2. Âmbito

- Plataformas/integradores convidados para a coorte fechada.
- Integração via SDK/API oficiais: autenticação por chave de API sintética, criação de
  *link*/intenção de pagamento, consulta de estado, recepção de *webhooks* e
  reconciliação. Detalhe operacional no Anexo J.
- Exclui LIVE/produção, chaves de produção, acesso público e activação de fornecedor
  externo real.

## 3. Partes / Participantes Afectados

- **Operador:** Banzami.
- **Plataforma/integrador:** entidade técnica aderente (nunca detentora de fundos).
- **Comerciante subjacente:** beneficiário do pagamento, vinculado no operador.
- **Autoridade de supervisão:** BNA.

## 4. Obrigações

**Da plataforma:** utilizar exclusivamente as SDK/API oficiais e chaves sintéticas do
piloto; **não** solicitar, deter, custodiar ou contabilizar fundos; **não** emitir
comprovativos financeiros; proteger as credenciais; verificar as assinaturas dos
eventos; comunicar incidentes.

**Do operador:** emitir e revogar chaves de API sintéticas; derivar o beneficiário
apenas da vinculação do projecto (a plataforma não pode indicar o beneficiário no
pedido); assegurar a autenticação, autorização por âmbito (*scope*) e a entrega de
eventos; manter o estado autoritativo dos pagamentos e comprovativos.

## 5. Procedimento Operacional

1. Provisão de uma plataforma sintética (projecto) e emissão de chave de API sintética
   (ambiente Sandbox), com âmbitos mínimos necessários.
2. Vinculação do projecto ao beneficiário (comerciante) no operador.
3. Criação de pedidos de pagamento pela plataforma via API (formato SDK).
4. Recepção de eventos/*webhooks* assinados e consulta de estado.
5. Reconciliação do que a plataforma criou vs. o que o Banzami liquidou (Anexo G).

## 6. Controlos de Risco

- Autenticação por chave: chave activa é aceite; chave inválida ou revogada é rejeitada;
  tentativa não autorizada é rejeitada; âmbito insuficiente é rejeitado — sem qualquer
  movimentação de saldo ou registo contabilístico nas rejeições.
- A plataforma nunca indica o beneficiário do pagamento (derivado da vinculação).
- Credenciais entregues de forma segregada, com princípio de menor privilégio.

## 7. Evidência a Produzir

- Registo de provisão da plataforma e emissão/revogação de chaves.
- Trilho de autenticação (aceite/rejeitado) e de autorização por âmbito.
- Registo de reconciliação plataforma vs. operador com discrepância zero.
- Correspondência com os resultados da Fase 0 relativos ao *layer* API/SDK/plataforma.

## 8. Relevância para o Reporte ao BNA

Demonstra que a camada de integração técnica não introduz risco de custódia (a
plataforma não detém fundos), com autenticação robusta e reconciliação, a integrar nos
relatórios intermédio e final (Anexos H e I).

## 9. Versão / Data

Versão 1.0 · Data de emissão: __ / __ / 20__ · Próxima revisão: __ / __ / 20__.

## 10. Aprovação / Assinaturas

| Papel | Nome | Data | Assinatura |
|-------|------|------|-----------|
| Plataforma / integrador | | | |
| Operador (Banzami) | | | |

*Documento preparatório interno. Não constitui prova de autorização, admissão a
sandbox regulatório, prontidão de produção nem prestação de serviço em produção.*
