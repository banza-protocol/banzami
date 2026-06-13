# 02 — Auditoria de Produto

**Versão:** 1.0
**Data:** 2026-06-13
**Tipo:** Auditoria estratégica — Fase 2 (Produto)
**Postura:** Investidor seed + PM de Stripe + designer de produto. Sem diplomacia.

---

## As 10 perguntas

### 1. Qual é exactamente o produto?

**Resposta honesta: depende de a quem se pergunta — e isso é o problema.**

No código, Banzami é uma **rede de pagamentos instantâneos wallet-native em Kwanza**: carteira do consumidor, @handle, QR, payment links, transferências P2P, dashboard de comerciante, SDKs. Isto é claro e coerente.

Na documentação, Banzami é "o operador de referência do protocolo BANZA", que por sua vez é orquestrado pelo "BanzAI, o Protocol Operating System". Três marcas, três repositórios, três conjuntos de documentos canónicos, uma framework de certificação (L0–L4), um modelo de federação.

**O produto que move dinheiro existe. O produto que se vende ao mundo está soterrado debaixo de uma catedral conceptual.**

### 2. Quem é o cliente principal?

No papel: o comerciante angolano (cantina, restaurante, ecommerce) que quer aceitar Kwanza instantâneo via QR/link. **Este é o cliente certo.** É quem paga (fees) e quem traz consumidores.

Na prática actual: ninguém, porque não há rail de dinheiro real.

### 3. Quem é o utilizador principal?

O consumidor angolano com smartphone que hoje paga em dinheiro ou por transferência + comprovativo no WhatsApp. O app mobile reflecte isto bem (enviar, receber, QR, @handle).

### 4. Qual é o problema resolvido?

**Real e grande:** Angola é uma economia fortemente dependente de dinheiro físico e de "transferência + foto do comprovativo". Não há um trilho instantâneo, QR-nativo, addressable por handle. O problema é legítimo — é o problema que o Pix resolveu no Brasil e o M-Pesa no Quénia.

### 5. O produto comunica claramente esse problema?

**Não.** O site público e a documentação lideram com "protocolo aberto", "certificação", "federação", "Protocol OS". Um comerciante de bairro não tem como decodificar isto. A mensagem "scan → confirm → pago" — que é a única que importa para adopção — está enterrada.

### 6. Existe posicionamento claro?

Internamente, sim, e é rígido (ADR-025): BANZA = protocolo, BanzAI = Protocol OS, Banzami = operador. Para o mercado, **este posicionamento é prematuro e contraproducente.** Posicionar-se como "um operador entre vários numa rede federada" antes de ter **um** utilizador é vender a infra-estrutura de uma cidade antes de construir a primeira casa.

### 7. O produto parece wallet / fintech / banco / gateway / super-app?

Parece — corretamente — uma **wallet-native instant payment network** (modelo Pix/M-Pesa/UPI). O código é fiel a isto: sem cartões, sem CVV, transferência carteira-a-carteira. Bom. **Mas a camada de marketing/protocolo faz parecer um consórcio de infra-estrutura financeira**, o que confunde.

### 8. Existe confusão conceptual?

**Sim — é o defeito estratégico número um.** A separação BANZA/BanzAI/Banzami é intelectualmente elegante e operacionalmente prematura. Custos observáveis:
- Três repos para manter, com documentação espelhada e potencial de drift.
- Energia de engenharia investida em certificação, federação e governança (primitivas para um ecossistema multi-operador) quando há **zero operadores**, incluindo o próprio.
- A narrativa pública afasta exactamente o cliente que precisa de ser conquistado primeiro.

### 9. O onboarding é claro?

O onboarding técnico (app: welcome → criar conta → PIN) é direto. O onboarding **conceptual** ("o que é isto e porque confio o meu dinheiro?") não está resolvido — e em pagamentos, confiança é o produto.

### 10. O utilizador percebe o valor em menos de 30 segundos?

**No app:** provavelmente sim (enviar dinheiro por @handle é auto-explicativo).
**No site/posicionamento:** não. Um visitante encontra "protocolo de infra-estrutura financeira aberta" antes de "paga e recebe Kwanza ao instante".

---

## Diagnóstico

| Dimensão | Avaliação |
|---|---|
| Problema escolhido | Excelente — real, grande, com precedentes provados (Pix, M-Pesa) |
| Solução técnica | Coerente com o problema — wallet-native, QR, instant |
| Clareza de comunicação | Fraca — soterrada em abstracção de protocolo |
| Foco | Disperso — meta-arquitectura antes de tracção |
| Maturidade de mercado | Zero — sem rails reais, sem utilizadores |

## O veredicto de produto, sem rodeios

Existem aqui **dois produtos a competir pela mesma equipa**:

1. **Banzami** — um app de pagamentos Kwanza que pode ganhar Angola. *Subfinanciado em atenção.*
2. **BANZA/BanzAI** — uma framework de protocolo aberto + "Protocol OS" para um futuro ecossistema federado de operadores. *Sobrefinanciado em atenção, sem mercado que o exija hoje.*

Um investidor financiaria o nº 1. O nº 2 é um *option value* que só faz sentido **depois** de o nº 1 provar tracção. Construí-lo primeiro é a inversão clássica de prioridades de fundador técnico: construir a plataforma antes do produto.

**Recomendação:** colapsar a narrativa pública para "Banzami — paga e recebe Kwanza ao instante". Manter BANZA/BanzAI como decisão de arquitectura **interna**, invisível ao mercado, até existir um segundo operador real a pedir federação.

---

*Próximo: `03_ux.md`.*
