# Anexo J — Procedimento de API/SDK, Chaves e Webhooks (Piloto Fase 1)

Versão: 1.0 · Data: __ / __ / 20__

> **Enquadramento institucional.** O Banzami é o operador de referência da rede BANZA,
> sociedade comercial independente e **não autorizada** até aprovação ou não-objecção
> do BNA. Este documento respeita a um **piloto proposto (Fase 1)**, de coorte fechada.
> Na Fase 0, a camada API/SDK/plataforma foi validada em Sandbox técnico com chaves
> sintéticas. A entrega de *webhooks* para o exterior **não** foi executada em ambiente
> real, por exigir um recetor público HTTPS; permaneceu como simulação identificada.

> **Princípio estruturante.** A plataforma/integrador **NÃO detém fundos**, **NÃO
> calcula saldos** e **NÃO emite comprovativos financeiros**. Apenas cria pedidos,
> recebe estado técnico e eventos, consulta comprovativos e reconcilia contra o Banzami.

## 1. Objectivo (Finalidade)

Definir o procedimento técnico e de controlo para a integração de plataformas via
SDK/API oficiais: autenticação por chave, criação de pedidos, consulta de estado,
recepção e verificação de *webhooks*, e reconciliação.

## 2. Âmbito

- Plataformas da coorte fechada, ambiente Sandbox, chaves sintéticas.
- Funcionalidades expostas: criação de *link*/intenção de pagamento, consulta de estado,
  eventos/*webhooks*, reconciliação. Sem chaves de produção e sem acesso público.

## 3. Partes / Participantes Afectados

- **Operador:** Banzami (autoridade de chaves e de eventos).
- **Plataforma/integrador:** consumidor da API/SDK (nunca detentor de fundos).
- **Autoridade de supervisão:** BNA.

## 4. Obrigações

**Do operador:** emitir chaves sintéticas com âmbitos mínimos; permitir revogação;
derivar o beneficiário apenas da vinculação do projecto; assinar os eventos; disponibilizar
consulta de estado e de comprovativo.

**Da plataforma:** proteger credenciais; verificar a assinatura dos eventos; deduplicar
por identificador de evento; **não** deter fundos, calcular saldos ou emitir comprovativos.

## 5. Procedimento Operacional

1. **Chaves:** provisão da plataforma (projecto sintético) e emissão de chave; utilização
   por cabeçalho de autorização; revogação quando necessário. Chave activa é aceite;
   chave inválida/revogada é rejeitada; âmbito insuficiente é rejeitado.
2. **Pedidos:** criação de *link*/intenção de pagamento no formato exposto pela SDK;
   o beneficiário nunca é indicado pela plataforma.
3. **Estado/comprovativo:** consulta autenticada do estado do pagamento e da referência
   de comprovativo (referência verificável, não forjável, sem dados pessoais
   desnecessários).
4. **Webhooks:** registo de destino; entrega assinada (assinatura HMAC); repetição com
   recuo exponencial e limite de tentativas; idempotência por identificador de evento.
   *No piloto, a entrega para o exterior exige um recetor público HTTPS; enquanto tal
   não for autorizado, a emissão e a assinatura são verificadas internamente.*
5. **Reconciliação:** a plataforma concilia o que criou vs. o que o Banzami liquidou.

## 6. Controlos de Risco

- Autenticação e autorização por âmbito; rejeições sem qualquer movimentação de saldo
  ou registo contabilístico.
- Menor privilégio nas chaves; segregação de credenciais (nunca em configuração
  inspeccionável nem em registos).
- Verificação de assinatura e idempotência nos eventos.

## 7. Evidência a Produzir

- Registo de emissão/revogação de chaves e de âmbitos.
- Trilho de autenticação/autorização (aceite/rejeitado, âmbito insuficiente).
- Evidência de emissão/assinatura de eventos e do contrato de repetição/idempotência.
- Registo de reconciliação plataforma vs. operador.

## 8. Relevância para o Reporte ao BNA

Demonstra que a integração técnica não introduz risco de custódia e opera com
autenticação robusta e eventos verificáveis, a integrar nos relatórios (Anexos H e I).

## 9. Versão / Data

Versão 1.0 · Data de emissão: __ / __ / 20__ · Próxima revisão: __ / __ / 20__.

## 10. Aprovação / Assinaturas

| Papel | Nome | Data | Assinatura |
|-------|------|------|-----------|
| Responsável Técnico (Banzami) | | | |
| Operador (Banzami) | | | |

*Documento preparatório interno. Não constitui prova de autorização, admissão a
sandbox regulatório, prontidão de produção nem prestação de serviço em produção.*
