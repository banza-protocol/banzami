# Banzami — Documento de Referência Oficial

**Version:** 1.0  
**Date:** 19/05/2026  
**Status:** Official  
**Author:** Banzami

---

> **Banzami constrói a infraestrutura que permitirá Angola pagar digitalmente.**  
> **Banza é a rede de pagamentos instantâneos QR-native em Kwanza, construída pela Banzami.**  
> Carteira-a-carteira. Liquidação instantânea. Sem cartão. Construída para cada angolano.

---

Angola não precisa de uma cópia do sistema de pagamentos de outro país.  
Angola precisa do seu próprio — construído para o Kwanza, para o QR, para o smartphone em cada bolso.

**Isso é a Banza — o produto principal da Banzami.**

---

## Índice

1. [O que é o Banzami?](#1-o-que-é-o-banzami)
2. [Por que o Banzami Existe](#2-por-que-o-banzami-existe)
3. [Por que Agora?](#3-por-que-agora)
4. [A Visão](#4-a-visão)
5. [Uma Manhã em Luanda](#5-uma-manhã-em-luanda)
6. [Como a Banza Funciona](#6-como-a-banza-funciona)
7. [Funcionalidades Principais](#7-funcionalidades-principais)
8. [Casos de Uso Reais em Angola](#8-casos-de-uso-reais-em-angola)
9. [Ecossistema de Pagamentos QR](#9-ecossistema-de-pagamentos-qr)
10. [Filosofia Wallet-Native](#10-filosofia-wallet-native)
11. [Banza para Comerciantes](#11-banza-para-comerciantes)
12. [Banza para Programadores](#12-banza-para-programadores)
13. [Banza para Consumidores](#13-banza-para-consumidores)
14. [O Motor de Crescimento da Banza](#14-o-motor-de-crescimento-da-banza)
15. [Ecossistema de Negócio Banzami](#15-ecossistema-de-negócio-banzami)
16. [Segurança e Integridade Financeira](#16-segurança-e-integridade-financeira)
17. [Arquitectura Técnica](#17-arquitectura-técnica)
18. [O Ecossistema Banzami](#18-o-ecossistema-banzami)
19. [Roadmap e Futuro](#19-roadmap-e-futuro)
20. [Declaração de Visão Final](#20-declaração-de-visão-final)

---

## 1. O que é o Banzami?

**Banzami** constrói a infraestrutura que permite ao país pagar digitalmente — a plataforma, a missão institucional e o ecossistema de parceiros que tornam possível uma nova era de comércio digital em Angola.

**Banza** é o produto principal da Banzami: a **rede de pagamentos instantâneos de Angola** — uma infraestrutura completa de pagamentos digitais construída especificamente para o comércio angolano, comerciantes angolanos e consumidores angolanos.

> *Banzami constrói a infraestrutura. Banza move o dinheiro.*  
> *Banzami constrói a infraestrutura que permitirá Angola pagar digitalmente. Banza é como Angola paga.*

### Hierarquia do produto

```
Banzami (organização / ecossistema)
└── Banza (produto principal de pagamento)
    ├── Banza Wallet
    ├── Banza Business
    ├── Banza QR
    ├── Banza Checkout
    ├── Banza Pay Links
    ├── Banza API
    ├── Banza SDK
    └── @banza (identidade de pagamento)
```

A Banza não é um banco. Não é um processador de cartões. Não é uma plataforma fintech genérica adaptada de um modelo ocidental e rebaptizada para África.

A Banza é uma **rede de pagamentos wallet-native**: cada conta é uma carteira digital, cada pagamento é uma transferência instantânea de carteira-para-carteira, e cada interação comercial é um código QR. O dinheiro move-se entre carteiras em tempo real — confirmado, liquidado e visível em segundos.

### Os quatro pilares da Banza

| Pilar | O que significa |
|-------|----------------|
| **Wallet-native** | Cada conta é uma carteira digital em Kwanza. Os pagamentos são transferências directas entre carteiras. Sem IBAN. Sem código bancário. Sem cartão. |
| **QR-native** | A principal superfície de pagamento para comerciantes é um código QR. O comerciante imprime um QR. O consumidor faz o scan. O pagamento é instantâneo. Sem terminal de cartão, sem hardware, sem atrito. |
| **Liquidação instantânea** | O dinheiro move-se no momento em que o pagamento é confirmado. Não no próximo dia útil. Não após verificação manual. Instantaneamente — na mesma transacção. |
| **SDK-first** | Qualquer aplicação angolana — apps de táxi, plataformas de delivery, sites de ecommerce, plataformas de doações — integra a Banza em horas e aceita pagamentos instantâneos em Kwanza nativamente no seu produto. |

### A experiência de pagamento canónica

```
O consumidor faz o scan do QR do comerciante
          ↓
Confirma o valor e a identidade do comerciante (um toque)
          ↓
Pagamento comprometido e liquidado atomicamente
          ↓
O comerciante recebe notificação instantânea + actualização do saldo
          ↓
O consumidor vê a confirmação de sucesso
```

**Tempo total desde o scan até à liquidação confirmada: menos de 3 segundos.**

### Identidade na Banza

Cada pessoa e cada comerciante na rede Banza tem um **@banza** — uma identidade de pagamento nativa, legível por humanos, que funciona como endereço para qualquer pagamento. Pagar na Banza tem este aspecto:

```
Pagar: @cantina.luanda
Valor: 2.500 Kz
```

Sem número de conta bancária. Sem IBAN. Sem códigos de referência. Sem dados de cartão. Apenas um @banza e um valor.

### Quem a Banza serve

- **Comerciantes** — desde cantinas e bancas de mercado até plataformas de ecommerce e apps de táxi
- **Programadores** — a construir a próxima geração de aplicações angolanas que precisam de aceitar pagamentos
- **Consumidores** — cada angolano que quer pagar, enviar dinheiro e receber pagamentos instantaneamente
- **Bancos e parceiros** — que querem oferecer aos seus clientes uma camada moderna de comércio digital

---

### Por que os nomes Banzami e Banza?

**Banza** é uma palavra enraizada na tradição linguística Kimbundu — uma das línguas vivas mais antigas de Angola, falada por milhões de angolanos, presente em topónimos por todo o país e tecida na memória cultural desta nação. Uma *banza* é um lugar. Um encontro. Uma casa. Um centro de vida onde as pessoas se reúnem.

A **Banza** — o produto de pagamento — herda directamente este significado: um espaço onde o comércio acontece, onde o dinheiro circula, onde angolanos se encontram para trocar valor.

A **Banzami** — a organização — parte dessa mesma raiz e constrói a partir dela o ecossistema que torna tudo isso possível.

Um nome distintamente angolano — não uma palavra emprestada, não um conceito traduzido, não uma marca inventada noutro continente — era a única escolha honesta.

O nome é um sinal: esta plataforma foi feita aqui. Para aqui.

---

## 2. Por que o Banzami Existe

Angola tem um problema de pagamentos. Não é um problema tecnológico — Angola tem uma forte penetração móvel, infraestrutura de internet crescente e uma população pronta para o comércio digital. O problema é que a experiência de pagamento existente está quebrada de formas previsíveis e corrigíveis.

### 2.1 A dependência do dinheiro físico

Apesar da utilização generalizada de smartphones, o dinheiro físico continua a ser o método de pagamento dominante em Angola por uma razão clara: **o dinheiro físico é mais simples do que as alternativas digitais existentes**.

Pagar digitalmente hoje significa encontrar uma agência bancária ou ATM, iniciar uma transferência, copiar um código de referência, aguardar confirmação e, por vezes, provar manualmente o pagamento ao comerciante. Para compras pequenas do dia-a-dia — uma refeição numa cantina, uma corrida para casa, uma compra no mercado — o dinheiro físico é simplesmente mais rápido.

**A Banza torna os pagamentos digitais mais rápidos do que o dinheiro físico.**

### 2.2 O problema da prova via WhatsApp

O fluxo de pagamento "digital" actual no comércio informal angolano não é digital de forma alguma:

```
Passo 1 — O cliente inicia uma transferência bancária
Passo 2 — O cliente tira um screenshot da confirmação
Passo 3 — O cliente envia o screenshot ao comerciante via WhatsApp
Passo 4 — O comerciante inspecciona o screenshot manualmente
Passo 5 — O comerciante decide se confia nele
```

Isto é reconciliação manual disfarçada de pagamento digital. Cria disputas. Screenshots podem ser fabricados. Falha completamente à escala. O comerciante tem de confiar numa fotografia no ecrã, e o cliente tem de esperar que o comerciante a honre.

**A Banza elimina isto por completo.** Quando um cliente faz o scan de um QR Banza e confirma o pagamento, o comerciante vê uma notificação instantânea e criptograficamente confirmada na sua app. Sem screenshots. Sem mensagens de WhatsApp. Sem verificação manual. O pagamento é liquidado e a carteira do comerciante é actualizada em tempo real.

### 2.3 A lacuna nos pagamentos in-app

As apps de táxi angolanas, plataformas de delivery e marketplaces não conseguem fechar o ciclo de pagamento dentro dos seus produtos. O passo do pagamento força os utilizadores para fora da app — para dinheiro físico, para uma transferência bancária externa, para soluções improvisadas que falham mais vezes do que funcionam.

O resultado: experiências de utilizador quebradas, altas taxas de abandono e comerciantes que não conseguem oferecer um serviço digital fluido independentemente de quão bom seja o seu produto.

A Banza fornece a infraestrutura SDK que permite a qualquer aplicação angolana incorporar um fluxo de pagamento completo — confirmação, liquidação, recibo — sem o consumidor sair alguma vez da app.

### 2.4 A lacuna do SDK

Não existe nenhum SDK de pagamentos nativo angolano. Um programador a construir uma aplicação angolana não tem uma API limpa, tipada e pronta para produção para aceitar pagamentos instantâneos em Kwanza. Improvisa — com vulnerabilidades de segurança, comportamento inconsistente, sem lógica de retry e sem suporte significativo quando algo corre mal.

A Banza é a primeira infraestrutura de pagamentos construída especificamente para programadores angolanos: SDKs tipados, idempotência automática, retry com backoff exponencial, verificação de assinaturas de webhooks e testes em sandbox — tudo de nível de produção, tudo pronto a usar.

### 2.5 O problema de exclusão dos comerciantes

Pequenos comerciantes — cantinas, farmácias, vendedores de mercado — estão excluídos do comércio digital porque as soluções existentes requerem hardware caro, acordos bancários formais com requisitos complexos, ou infraestrutura de terminais de cartão à qual a maioria dos comerciantes angolanos simplesmente não tem acesso.

A Banza não requer nada disto. Um comerciante precisa de um telefone e um código QR impresso. Esse é o único requisito de infraestrutura para começar a aceitar pagamentos digitais instantâneos.

---

## 3. Por que Agora?

As condições para uma transformação da rede de pagamentos em Angola não são possibilidades futuras. São realidades presentes.

### 3.1 O smartphone já está lá

Angola tem uma das taxas de penetração móvel de crescimento mais rápido no continente. Os smartphones já não são escassos. Estão em cantinas, em mercados, em táxis, em escolas, em casas por toda a Luanda, Benguela, Huambo e além. O dispositivo que entrega a Banza já está no bolso da pessoa que precisamos de alcançar.

A barreira de infraestrutura que antes bloqueava o comércio digital — "as pessoas não têm telemóveis" — já não existe.

### 3.2 A economia do WhatsApp é a prova

Angola já tem uma economia digital. Funciona no WhatsApp. Produtos são vendidos, serviços são negociados e até pagamentos são confirmados — via screenshots — pelo WhatsApp todos os dias.

Isto não é sinal de que os angolanos não estão prontos para o comércio digital. É prova de que já conduzem comércio digital, usando as ferramentas disponíveis. A Banza é a ferramenta melhor. Faz o que o WhatsApp-mais-screenshots faz, mas correctamente, instantaneamente e com segurança.

O hábito já existe. A Banza melhora-o.

### 3.3 O QR já provou o modelo globalmente

No Brasil, o Pix criou uma rede de pagamentos instantâneos QR-native que se tornou o método de pagamento dominante em menos de três anos. Na Índia, o UPI processa milhares de milhões de transacções mensalmente usando transferências instantâneas por identificadores virtuais de utilizador — o mesmo conceito do @banza. Na China, o WeChat Pay tornou o scan de QR tão habitual que o dinheiro físico se tornou a excepção nas grandes cidades.

Nenhum desses países tinha vantagens especiais. Tinham uma infraestrutura clara, um lançamento focado e um produto genuinamente melhor do que o dinheiro físico. Angola tem exactamente as mesmas pré-condições. O modelo está provado.

### 3.4 A economia informal precisa de infraestrutura digital

A maioria do comércio angolano acontece informalmente. Vendedores de mercado, comerciantes de rua, freelancers, pequenos negócios — estes não são casos extremos. São a espinha dorsal económica do país. As soluções de pagamento digital existentes têm sistematicamente excluído estas pessoas.

Uma rede de pagamentos QR-native, sem hardware, sem taxa mensal, é a primeira solução que se adapta ao modo como o comércio informal angolano realmente funciona.

### 3.5 A geração de programadores está pronta

Angola tem uma geração crescente de programadores a construir aplicações móveis, plataformas web e serviços digitais para o mercado local. São qualificados, motivados e a trabalhar em problemas reais. O que lhes falta é uma API de pagamentos angolana — uma forma limpa e fiável de aceitar Kwanza nos seus produtos.

A Banza é essa infraestrutura. A comunidade de programadores está pronta para construir com ela.

### 3.6 A oportunidade do salto tecnológico

Angola tem a oportunidade de saltar por completo a fase da infraestrutura de cartões. As economias ocidentais construíram redes de pagamentos em torno de cartões nos anos 80 e estão agora a migrar lentamente para longe deles. Angola nunca construiu uma rede de cartões à escala. Isso significa que Angola pode ir directamente para o modelo melhor: wallet-native, QR-first, liquidação instantânea.

Angola não precisa de repetir um desvio de 40 anos. Pode começar no destino.

---

## 4. A Visão

A economia digital de Angola não está quebrada — está inacabada. A infraestrutura existe. A população está pronta. O que falta é a camada de pagamentos que os liga.

A visão da Banzami é completar essa camada — através da Banza.

### O futuro alvo

```
Uma dona de cantina em Luanda imprime um código QR e coloca-o no balcão.
Um cliente encomenda, pega no telefone e faz o scan do QR.
O pagamento é confirmado em menos de 3 segundos.
O telemóvel da dona mostra: "Recebeu 2.500 Kz."
Nenhum dinheiro muda de mãos. Nenhum screenshot é enviado. Ninguém espera por nada.
```

```
Um taxista termina uma corrida.
A app mostra a tarifa.
O passageiro toca em "Pagar."
O dinheiro move-se da carteira Banza do passageiro para a carteira do motorista instantaneamente.
A corrida fecha. O motorista vê o pagamento. O passageiro recebe um recibo.
Sem dinheiro físico. Sem atrito. Sem confirmação manual.
```

```
Um estudante precisa de pagar as propinas.
A escola envia um pedido de pagamento para a app Banza do encarregado de educação.
O encarregado vê o valor, o nome da escola e o trimestre.
Um toque. Pago. A escola regista-o imediatamente.
```

```
Um utilizador abre uma app de táxi angolana.
Escolhe o destino. A app calcula a tarifa: 3.200 Kz.
"Confirmar e pagar com Banza."
O fluxo de pagamento Banza abre dentro da própria app — sem sair, sem redireccionamentos.
O utilizador confirma com o seu @banza e PIN.
O pagamento é autorizado. O táxi é pedido automaticamente.
O motorista recebe a corrida — e a confirmação de pagamento — em simultâneo.
A corrida começa. Nenhum dinheiro muda de mãos no fim.
A app de táxi usa o Banza SDK. Uma chamada de SDK. Pagamento integrado.
```

```
Uma cliente vê um vestido numa loja angolana online.
Adiciona ao carrinho. Vai ao checkout.
"Pagar com Banza."
A aplicação abre o fluxo de pagamento Banza.
Ela confirma o valor: 15.000 Kz.
O comerciante recebe confirmação via webhook em menos de 2 segundos.
O pedido muda imediatamente para: "Pagamento confirmado."
Sem cartão internacional. Sem IBAN. Sem referência manual.
Compra online em Kwanza. Instantaneamente.
```

Estes não são futuros ambiciosos. São alcançáveis hoje, com infraestrutura que já existe, para utilizadores que já estão ligados. A Banza é a camada que falta.

### Como é o sucesso

A missão da Banzami está alcançada quando:

- Os pagamentos QR são a **expectativa normal** nas lojas, restaurantes e mercados angolanos — não uma novidade
- Cada app de táxi, plataforma de delivery e site de ecommerce angolano usa o Banza SDK como motor de pagamentos
- A prova de pagamento via WhatsApp desapareceu do comércio angolano
- Uma parte significativa das transacções angolanas do dia-a-dia acontece digitalmente, sem dinheiro físico
- Os programadores angolanos têm uma infraestrutura de pagamentos da qual se orgulham de construir
- A rede Banza tornou-se infraestrutura — parte do modo como Angola funciona

Os modelos de referência para este tipo de transformação existem. O **Pix** do Brasil tornou os pagamentos QR o padrão nacional em menos de três anos. O **UPI** da Índia tornou as transferências instantâneas por identificadores virtuais o padrão para mil milhões de pessoas. Ambos começaram com foco: um país, uma rede, uma promessa clara a cada utilizador.

**A Banza é isso para Angola.**

---

## 5. Uma Manhã em Luanda

*Isto não é uma demonstração de produto. É uma visão da vida ordinária quando a Banza se tiver tornado o padrão.*

---

**7h15.** A Amélia acorda, verifica a sua Banza Wallet no telemóvel. Recebeu 5.000 Kz durante a noite — o seu irmão mais novo pagou-lhe de volta dinheiro que ela lhe tinha emprestado na semana passada. Ele enviou de Benguela às 23h00. Chegou instantaneamente. Não houve transferência bancária. Não houve mensagem de WhatsApp. Ele escreveu `@amelia`, inseriu o valor, confirmou com o seu PIN, e estava feito.

**8h00.** Na cantina da esquina perto do seu apartamento, a Amélia pede café e pão. Aponta o telemóvel para o código QR colado na parede. A app mostra `@cantina.margarida`. Ela escreve `1.500 Kz` e prime o polegar para confirmar. O telemóvel da Margarida acende-se no balcão: *"Recebeu 1.500 Kz de @amelia."* Sem troco. Sem espera. Pequeno-almoço feito.

**8h30.** A Amélia trabalha como designer gráfica freelance. Um cliente devia-lhe pelo logótipo. Ela tinha enviado um link de pagamento na semana passada: `pay.banzami.org/fatura-logo-92`. Esta manhã abre a Banza Business no portátil e vê o estado mudar para **Pago** — o cliente pagou às 8h22. Ela tem o dinheiro. Tem o recibo digital. Não teve de enviar uma única mensagem de WhatsApp para o perseguir.

**12h30.** Almoço com três colegas. O restaurante gera um QR dinâmico para a mesa do grupo — total 18.000 Kz, dividido por quatro. Cada pessoa faz o scan do QR do seu telemóvel e paga 4.500 Kz. A app do restaurante mostra `18.000 Kz recebidos` em segundos após o último scan. Ninguém tira a carteira. Ninguém faz aritmética mental a tentar fazer o troco. A mesa liberta-se em minutos.

**17h00.** A Amélia apanha um táxi para casa. A app mostra a tarifa no fim da corrida: 3.200 Kz. Ela toca em "Pagar." Um toque, confirmação biométrica. O telemóvel do motorista notifica-o. A corrida fecha na app. Nenhum dos dois mencionou dinheiro físico.

**19h30.** A escola da filha enviou um pedido de pagamento esta manhã — propinas mensais de Março: 35.000 Kz. A Amélia abre-o na app Banza. O nome da escola está lá. O valor está lá. A descrição diz "Propinas — Março 2026." Paga com um toque. A escola marca a propina como liquidada. Sem fila. Sem banco. Sem recibo para guardar.

**22h00.** Antes de dormir, a Amélia verifica a sua carteira. Hoje gastou 1.500 Kz (cantina), 4.500 Kz (almoço), 3.200 Kz (táxi), 35.000 Kz (propinas). Recebeu 5.000 Kz (irmão) e 25.000 Kz (cliente). Cada transacção está lá, com timestamp, etiqueta, clara. Sem mistério. Sem Kwanza em falta. Visibilidade total sobre o seu dia.

---

*O dinheiro físico nunca apareceu. Imagens de prova de WhatsApp nunca foram enviadas. Ninguém ficou em fila num banco. Nenhum código de referência foi copiado. Ninguém esperou.*

*Isto é uma terça-feira normal em Luanda. Com a Banza.*

---

## 6. Como a Banza Funciona

### 6.1 A operação fundamental

Tudo na Banza é construído sobre uma operação:

```
Carteira do Consumidor  ────[transferência instantânea no ledger]────>  Carteira do Comerciante
```

Quando um consumidor paga um comerciante, o dinheiro move-se de uma carteira digital para outra. A transferência é atómica, instantânea e registada num ledger financeiro imutável. Não existe estado intermédio, sem período pendente, sem atraso na liquidação. O dinheiro está na carteira do comerciante no momento em que o consumidor confirma o pagamento.

Este é o núcleo da rede Banza. Cada funcionalidade do produto — códigos QR, links de pagamento, pedidos de pagamento, integrações SDK — é uma forma diferente de iniciar esta mesma operação fundamental.

### 6.2 Carteiras

Cada pessoa e cada comerciante na Banza tem uma **carteira digital em Kwanza** — uma Banza Wallet. Detém saldos em AOA, recebe pagamentos e envia transferências. Não é uma conta bancária — é uma conta de pagamento nativa Banza, acessível instantaneamente a partir de qualquer dispositivo.

```
┌──────────────────────────────────────────────────┐
│  @joao                                           │
│  ID Carteira: wlt_...                            │
│                                                  │
│  Disponível:   12.750 Kz  ← gastável agora       │
│  Reservado:     2.500 Kz  ← operação pendente    │
│  ──────────────────────────────────────────────  │
│  Total:        15.250 Kz                         │
└──────────────────────────────────────────────────┘
```

O saldo **disponível** pode ser gasto ou transferido imediatamente. O saldo **reservado** cobre operações pendentes. Ambos são sempre exactos. Não existe "por favor verifique daqui a alguns minutos."

### 6.3 @Banza

Cada conta Banza tem um **@banza** — um identificador único e legível por humanos que funciona como identidade de pagamento nativa.

```
@joao          ← @banza de consumidor
@cantina.luanda      ← @banza de comerciante
@escola.benguela     ← @banza de instituição
@doa.creators        ← @banza de plataforma
```

O @banza substitui a necessidade de números de conta bancária, IBANs ou códigos de referência. Para enviar dinheiro a alguém, escreve o seu @banza. Para receber dinheiro, partilha o seu @banza. Os comerciantes imprimem o seu @banza em cartazes físicos ao lado do seu código QR. É simultaneamente uma marca, um endereço e uma identidade de pagamento nativa da Banza.

### 6.4 Pagamentos QR

Um **código QR** é um endereço de pagamento visual — um atalho digitalizável para uma carteira. Fazer o scan informa a app do consumidor exactamente para onde o pagamento deve ir.

**QR Estático** — permanente, ligado a uma carteira. O consumidor faz o scan, insere o valor e paga. Impresso uma vez, usado indefinidamente.

**QR Dinâmico** — gerado para uma transacção específica, com um valor fixo e expiração. O consumidor faz o scan e só precisa de confirmar.

```
Fluxo de scan QR:

┌──────────────────────────────────┐
│  O consumidor abre a câmara do   │
│  telemóvel ou a app Banza        │
└──────────────┬───────────────────┘
               │
               v
┌──────────────────────────────────┐
│  Faz o scan do código QR do      │
│  comerciante                     │
└──────────────┬───────────────────┘
               │
               v
┌──────────────────────────────────┐
│  A app descodifica:              │
│  → Comerciante: @cantina.luanda  │
│  → Valor: 2.500 Kz (dinâmico)    │
│    ou o consumidor insere        │
│    (estático)                    │
└──────────────┬───────────────────┘
               │
               v
┌──────────────────────────────────┐
│  Ecrã de confirmação:            │
│  "Pagar 2.500 Kz a               │
│   @cantina.luanda?"              │
│                                  │
│  [✓ Confirmar com impressão]     │
└──────────────┬───────────────────┘
               │ biométrico / PIN
               v
┌──────────────────────────────────┐
│  ✓ PAGO - 2.500 Kz               │
│  @cantina.luanda                 │
│  Há 2 segundos                   │
└──────────────────────────────────┘
```

Simultaneamente:

```
Telemóvel do comerciante: 📳 "Recebeu 2.500 Kz de @joao"
Carteira do comerciante: saldo actualizado em tempo real
```

### 6.5 Links de pagamento

Um **link de pagamento** é um URL partilhável que contém um pedido de pagamento pré-configurado. O comerciante envia-o via WhatsApp, SMS, email ou redes sociais. O consumidor abre-o num browser e paga com a sua Banza Wallet.

```
https://pay.banzami.org/abc123
```

Os links de pagamento substituem directamente o fluxo "envia-me o screenshot do WhatsApp". O consumidor clica num link, vê o comerciante e o valor, confirma o pagamento, e o comerciante vê a liquidação instantânea — sem screenshot, sem verificação manual, sem necessidade de confiança.

### 6.6 Pedidos de pagamento

Um **pedido de pagamento** é uma factura digital enviada directamente para a carteira de um consumidor específico. O consumidor vê-o como uma notificação e paga ou recusa com um único toque.

```
O comerciante envia:  "Pagamento de 15.000 Kz — Encomenda #42"
O consumidor recebe: notificação push → abre a app Banza
O consumidor toca:   "Pagar"
Resultado:           liquidação instantânea + recibo para ambos
```

### 6.7 EMIS e a camada bancária

A Banza integra-se com o **EMIS** (Empresa Interbancária de Serviços) — a infraestrutura de pagamentos interbancários de Angola — através da infraestrutura da Banzami, para permitir que o dinheiro flua entre carteiras Banza e o sistema bancário angolano.

O EMIS é o caminho. A Banza é o produto. A Banzami constrói a ponte.

```
┌────────────────────────────────────────────┐
│   Banza (produto Banzami)                  │
│   carteiras · QR · SDKs · ferramentas      │
│   @banza · links de pagamento · UX inst.   │
├────────────────────────────────────────────┤
│   EMIS / Multicaixa Express                │
│   (rede de liquidação interbancária        │
│    de Angola)                              │
├────────────────────────────────────────────┤
│   Bancos Angolanos                         │
│   (contas, liquidação regulada)            │
├────────────────────────────────────────────┤
│   BNA — Banco Nacional de Angola           │
│   (autoridade monetária, regulação)        │
└────────────────────────────────────────────┘
```

A Banza não substitui o sistema bancário. Constrói a camada de comércio acima dele — com a infraestrutura da Banzami.

---

## 7. Funcionalidades Principais

### Pagamentos

| Funcionalidade | Descrição |
|----------------|-----------|
| **Pagamentos QR** | O consumidor faz o scan do QR do comerciante; liquidação instantânea de carteira-para-carteira; sem hardware necessário |
| **Transferências P2P** | O consumidor envia dinheiro para qualquer @banza; instantâneo; sem dados bancários necessários |
| **Links de pagamento** | URLs partilháveis; o consumidor abre no browser e paga; o comerciante vê confirmação instantânea |
| **Pedidos de pagamento** | Factura digital enviada para a carteira de um consumidor; pagar ou recusar com um toque |
| **Liquidação instantânea** | Dinheiro na carteira do destinatário no momento em que o pagamento é confirmado; sem períodos pendentes |

### Ferramentas para comerciantes

| Funcionalidade | Descrição |
|----------------|-----------|
| **Carteira do comerciante** | Carteira de negócio dedicada para receber pagamentos, acompanhar saldos e solicitar pagamentos |
| **Banza Business** | Plataforma operacional do comerciante: interface móvel para operação diária e interface web para análises, reembolsos, disputas e gestão de equipa |
| **Loja QR** | Página de perfil público do comerciante em `pay.banzami.org/profiles/@banza` |
| **Geração de QR estático** | Código QR permanente para a carteira do comerciante; imprimir e exibir em qualquer lugar |
| **Geração de QR dinâmico** | QR por transacção com valor fixo e expiração |
| **Levantamentos** | Transferência do saldo da carteira para uma conta bancária angolana a pedido |
| **Reembolsos** | Emite reembolsos parciais ou totais a partir da Banza Business ou da API |
| **Gestão de disputas** | Processo de resolução estruturado para disputas de pagamento |

### Plataforma de programadores

| Funcionalidade | Descrição |
|----------------|-----------|
| **API REST** | API HTTP versionada e idempotente para todas as operações da plataforma |
| **SDK TypeScript** | SDK Node.js/browser completamente tipado com idempotência e retry automáticos |
| **SDK PHP** | SDK compatível com PSR-18 com integração Laravel |
| **SDK Go** | Cliente Go nativo com propagação de contexto e erros estruturados |
| **SDK Python** | SDK async-first com Pydantic v2 e suporte Django/FastAPI |
| **SDK Flutter** | SDK móvel para fluxos de pagamento in-app e comércio QR |
| **Sistema de webhooks** | Entrega de eventos em tempo real com verificação de assinatura HMAC-SHA256 e retry automático |
| **Ambiente sandbox** | Ambiente de teste completamente isolado; superfície de API idêntica; sem dinheiro real |

### Infraestrutura

| Funcionalidade | Descrição |
|----------------|-----------|
| **Idempotência** | Todas as operações de pagamento são seguras para retry; submissões duplicadas não produzem efeitos secundários |
| **Ledger de dupla entrada** | Cada movimento monetário registado como entradas de ledger imutáveis; completamente auditável |
| **Reconciliação** | Reconciliação automática diária de todos os saldos de carteiras e entradas de ledger |
| **Motor de risco** | Triagem de transacções em tempo real para sinais de fraude e conformidade |
| **KYC/KYB** | Verificação de identidade para consumidores e comerciantes; por níveis conforme o volume de transacções |

---

## 8. Casos de Uso Reais em Angola

### 8.1 Apps de táxi e transporte

**O problema hoje:**  
Uma app de transporte angolana completa uma corrida mas não consegue cobrar o pagamento na app. O motorista diz "só dinheiro." O passageiro procura troco. A plataforma tem zero visibilidade sobre os pagamentos. O motorista carrega dinheiro o dia todo — um risco de segurança.

**Com a Banza:**  
A corrida termina. A app mostra a tarifa. O passageiro vê um ecrã de confirmação. Um toque — biométrico ou PIN. A tarifa transfere-se instantaneamente da carteira do passageiro para a do motorista. A plataforma recebe um webhook. A corrida fecha automaticamente.

```
ANTES: Corrida termina → motorista pede dinheiro → passageiro procura troco → sem registo digital
DEPOIS: Corrida termina → app mostra tarifa → passageiro toca "Pagar" → liquidação instantânea
```

### 8.2 Cantinas e pequenos comerciantes

**O problema hoje:**  
Uma dona de cantina quer aceitar pagamentos digitais. Um terminal POS bancário requer um acordo bancário formal e cobra por transacção. A maioria dos pequenos comerciantes não se qualifica. A única alternativa é aceitar transferências bancárias e aguardar screenshots de WhatsApp — alguns dos quais são fabricados.

**Com a Banza:**  
A dona regista-se na Banza, cria uma carteira e descarrega o seu código QR. Imprime-o em papel e coloca-o no balcão. Quando um cliente faz o scan e paga, o telemóvel da dona mostra "Recebeu 2.500 Kz." Sem terminal. Sem taxa mensal. Sem espera. Sem screenshots.

```
ANTES: Cliente paga → envia screenshot WhatsApp → dona verifica manualmente
DEPOIS: Cliente faz scan do QR → paga instantaneamente → telemóvel da dona confirma em tempo real
```

### 8.3 Ecommerce e lojas online

**O problema hoje:**  
Um site de ecommerce angolano não tem forma fiável de cobrar pagamentos online em Kwanza. Os processadores internacionais não suportam AOA. Os clientes são redirecionados para portais bancários externos. O abandono do checkout é elevado.

**Com a Banza:**  
O site integra o Banza TypeScript SDK. No checkout, o cliente confirma o pagamento com a sua carteira. A liquidação é instantânea. A loja recebe um webhook e cumpre a encomenda. Sem redirecionamento. Sem portal externo.

```typescript
// Checkout de ecommerce — TypeScript
const link = await client.createPaymentLink({
  merchantId:  'mch_...',
  walletId:    'wlt_...',
  amountMinor: 45000,           // 45 000 Kz
  description: 'Encomenda #1042 — 3 produtos',
});
// Cliente paga → webhook dispara → encomenda cumprida
```

### 8.4 Plataformas de doações e criadores

**O problema hoje:**  
Um criador ou ONG a gerir uma plataforma como o DOA não consegue aceitar doações digitais instantâneas em Kwanza. Os apoiantes enviam transferências bancárias e mandam prova por email. Muitos desistem. A plataforma não tem acompanhamento em tempo real.

**Com a Banza:**  
A plataforma integra Banza Pay Links ou pedidos de pagamento Banza. Um apoiante toca em "Apoiar com 1.000 Kz." A doação transfere-se instantaneamente. O criador vê-a em tempo real. Todo o fluxo acontece dentro da app.

```
ANTES: Apoiante envia transferência → manda prova por email → plataforma aguarda
DEPOIS: Apoiante toca "Apoiar" → transferência instantânea → criador vê imediatamente
```

### 8.5 Apps de delivery e marketplaces

**O problema hoje:**  
Uma app de entrega de comida não consegue fechar o ciclo de pagamento na app. O pagamento na entrega cria riscos de segurança para os motoristas, risco de fraude para os comerciantes e UX quebrada para os consumidores.

**Com a Banza:**  
A app de delivery integra o SDK Flutter. Quando o motorista marca uma encomenda como entregue, a app do consumidor solicita o pagamento. Um toque — liquidação instantânea. O restaurante e o motorista vêem ambos. O dinheiro físico desaparece do fluxo por completo.

### 8.6 Escolas e instituições

**O problema hoje:**  
Uma escola cobra propinas via transferência bancária. Os encarregados fazem fila nos bancos. Os recibos são entregues manualmente. A escola não tem visão em tempo real dos saldos em dívida.

**Com a Banza:**  
A escola emite pedidos de pagamento para cada aluno. Os encarregados recebem uma notificação, vêem o nome do aluno e o valor, e pagam com um toque. A Banza Business mostra pagos e em dívida em tempo real.

```
ANTES: Encarregado faz fila no banco → transferência manual → entrega recibo → escola processa manualmente
DEPOIS: Encarregado toca "Pagar" → liquidação instantânea → escola vê em tempo real
```

### 8.7 Freelancers e profissionais

**O problema hoje:**  
Um designer freelance factura um cliente. O cliente faz uma transferência bancária. O freelancer aguarda horas pela confirmação. Não existe registo de pagamento estruturado.

**Com a Banza:**  
O freelancer gera um link de pagamento ou pedido. O cliente clica, confirma e a carteira é creditada instantaneamente. Ambas as partes têm um recibo digital com timestamp.

### 8.8 Restaurantes e cafés

**O problema hoje:**  
Um jantar em grupo termina. A mesa tenta dividir a conta via transferências bancárias individuais para a conta do empregado. O empregado tem de reconciliar múltiplos pagamentos manualmente antes de a mesa poder sair.

**Com a Banza:**  
O restaurante gera um QR dinâmico para o total da mesa. Os clientes fazem o scan e pagam a sua parte. Cada pagamento é confirmado instantaneamente. Quando o valor total é atingido, a mesa está feita.

---

## 9. Ecossistema de Pagamentos QR

Os códigos QR não são uma funcionalidade na Banza — são a **principal superfície de pagamento**.

A lógica é fundamental. Um código QR é um endereço de pagamento visual. Pode ser impresso, exibido num ecrã, partilhado como imagem ou incorporado num documento. Não requer terminal de cartão, hardware NFC nem equipamento proprietário. Um comerciante com um telemóvel e uma impressora tem tudo o que precisa.

### 9.1 QR Estático

Um QR estático codifica uma referência de carteira e @banza. Impresso uma vez, usado indefinidamente.

**Colocação típica:** colado na parede de uma cantina, num posto de mercado, na mesa de um restaurante, mostrado no ecrã de um telemóvel.

```
┌──────────────────────────────────────────────┐
│                                              │
│   Payload QR: banza://pay/@cantina.luanda  │
│                                              │
│   ┌──────────────────┐                       │
│   │  ## .. ## ## ##  │  @cantina.luanda      │
│   │  ##    ## ## ##  │                       │
│   │  .. ## .. .. ..  │  Scan para Pagar      │
│   │  ## .. ## ## ##  │                       │
│   └──────────────────┘                       │
│                                              │
└──────────────────────────────────────────────┘
```

Quando um consumidor faz o scan de um QR estático, vê o nome do comerciante e insere o valor. Uma confirmação, pagamento instantâneo.

### 9.2 QR Dinâmico

Um QR dinâmico codifica um valor específico e expira após o uso ou um limite de tempo.

```
Payload QR: banza://pay/qr/qrc_abc123
            └── resolve para: @cantina.luanda, 2.500 Kz, expira em 5 min
```

O consumidor faz o scan. O valor está pré-preenchido. Só precisa de confirmar. Usado para fluxos por transacção: pedidos de restaurante, confirmações de entrega, integrações POS.

### 9.3 Loja QR do comerciante

Cada comerciante tem uma página de perfil público em `pay.banzami.org/profiles/@banza`:

```
┌──────────────────────────────────────────────┐
│  [Logo]  Cantina da Margarida                │
│          @cantina.luanda                     │
│          Comida · Luanda, Maianga            │
│                                              │
│  "A melhor comida caseira do bairro."        │
│                                              │
│  [ Pagar agora — 2.500 Kz ]                  │
│                                              │
│  IG: @cantina.luanda  WA: +244 9xx xxx xxx   │
└──────────────────────────────────────────────┘
```

Partilhável no Instagram, WhatsApp, flyers impressos e email. Qualquer consumidor que chegue pode pagar instantaneamente.

### 9.4 QR P2P

Os consumidores exibem o seu QR pessoal para receber dinheiro de amigos ou família. Fluxo idêntico ao QR de um comerciante — de carteira-para-carteira, instantâneo.

**Uso comum:** dividir uma conta, pagar a um amigo, pais a enviar dinheiro para almoço a uma criança na escola.

### 9.5 Por que o QR é a superfície certa para Angola

| Alternativa | Por que falha |
|-------------|--------------|
| Terminais de cartão | Hardware caro, acordo bancário necessário, exclui a maioria dos comerciantes |
| Transferência bancária | IBAN e códigos de referência, sem confirmação instantânea, reconciliação manual |
| Pagamentos NFC | Requer hardware com capacidade NFC, não é universal |
| Dinheiro físico | Sem registo digital, risco de segurança, sem pagamento remoto ou online |
| **QR (Banza)** | Funciona com qualquer smartphone, custo zero de hardware, confirmação instantânea, gratuito para exibir, funciona remotamente |

O QR elimina a barreira de infraestrutura que manteve os pequenos comerciantes fora do comércio digital. Um comerciante com um telemóvel e uma impressora está pronto para aceitar pagamentos digitais instantâneos.

---

## 10. Filosofia Wallet-Native

### 10.1 O que significa wallet-native

Num sistema baseado em cartões, o dinheiro flui através de redes de cartões (Visa, Mastercard), é autorizado por emissores e liquida entre bancos em um a três dias úteis. O consumidor nunca detém directamente dinheiro — detém acesso a um saldo ligado a um cartão que uma rede estrangeira processa em seu nome.

A Banza é fundamentalmente diferente.

Cada titular de conta possui uma **Banza Wallet em Kwanza**. Quando um consumidor paga um comerciante, o dinheiro move-se directamente de uma carteira para outra numa única operação de ledger atómica. Sem rede de cartões. Sem autorização estrangeira. A liquidação não é diferida — acontece na mesma transacção.

### 10.2 O caminho de pagamento principal

```
┌───────────────────┐                      ┌───────────────────┐
│   Consumidor      │                      │   Comerciante     │
│   Carteira        │ --[transferencia]--> │   Carteira        │
│   @joao           │      no ledger       │   @cantina.luanda │
│   Saldo: 15Kz     │                      │   Saldo: 0Kz      │
└───────────────────┘                      └───────────────────┘
         ↓ Após pagamento                           ↓
    Saldo: 12.5 Kz                          Saldo: 2.5 Kz
```

Esta é a imagem completa. Sem rede de cartões. Sem processador intermediário. Uma operação de ledger. Ambos os saldos actualizam instantânea e atomicamente.

### 10.3 A Banza NÃO é card-first

| Modelo de pagamento | Como funciona | Banza? |
|---------------------|--------------|--------|
| Stripe / Terminal POS | Tokenização do cartão → rede de cartões → autorização do emissor → liquidação em dias | ✗ |
| Transferência bancária | IBAN + referência → mensagens interbancárias → liquidação em horas/dias | ✗ |
| Mobile money (sem rede local) | Conta flutuante estrangeira → liquidação adiada | ✗ |
| **Banza** | **Carteira → transferência no ledger → carteira — instantâneo, local, em Kwanza** | **✓** |

Os cartões não existem na rede principal Banza. Numa fase futura, o carregamento por cartão permitirá aos consumidores financiar a sua Banza Wallet a partir de um cartão de débito — mas esse cartão é usado para adicionar fundos, não para fazer pagamentos. Cada pagamento, independentemente de como a carteira foi financiada, é uma transferência de carteira-para-carteira.

### 10.4 Redes locais, dinheiro local

A liquidação da Banza corre em infraestrutura angolana — EMIS e o sistema bancário angolano. Isto não é uma limitação. É uma vantagem deliberada.

Uma rede de pagamentos construída em infraestrutura de cartões estrangeiros depende de aprovação estrangeira, preços estrangeiros e disponibilidade estrangeira. A liquidação da Banza é angolana, em Kwanza, em redes que Angola controla. Funciona quando as redes internacionais não funcionam. Cobra em AOA sem conversão de moeda. Opera dentro do quadro regulatório do Banco Nacional de Angola.

Infraestrutura local para uma economia local.

### 10.5 Três expressões da mesma identidade

```
Carteira ↔ Carteira   a identidade financeira — detém e transfere Kwanza
QR ↔ QR               a identidade física — como paga presencialmente
@banza ↔ @banza        a identidade digital — como endereça pagamentos em qualquer lugar
```

Estas três camadas são expressões da mesma conta subjacente. Juntas, tornam a Banza utilizável em todos os contextos: comércio físico, comércio digital, pagamentos remotos e transferências pessoa-a-pessoa.

---

## 11. Banza para Comerciantes

### 11.1 Primeiros passos

Um comerciante regista-se na Banza, fornece informações básicas do negócio e recebe uma Banza Wallet de comerciante e um @banza em minutos. Um código QR estático está pronto para download imediatamente.

Sem terminal POS necessário. Sem acordo de cartão necessário. Sem volume mensal mínimo. A verificação KYC é necessária antes da liquidação em directo, mas o processo é totalmente digital.

O tempo entre "quero aceitar pagamentos digitais" e "estou a aceitar pagamentos digitais" deve ser medido em minutos, não semanas.

### 11.2 Banza Business

A Banza Business é a plataforma operacional para comerciantes no ecossistema Banza. Não é uma aplicação — é um sistema completo com duas interfaces complementares que servem o mesmo negócio em contextos diferentes.

```
             Banza Business
         /                      \
┌──────────────────┐   ┌──────────────────┐
│  Interface movel │   │   Interface web  │
├──────────────────┤   ├──────────────────┤
│  operacao diaria │   │  administracao   │
│  QR              │   │  analytics       │
│  notificacoes    │   │  equipa / SDK    │
│  saldo e pedidos │   │  disputas        │
└──────────────────┘   └──────────────────┘
```

Um negócio pequeno pode operar inteiramente pela interface móvel. Um negócio maior usa ambas. A escolha é do comerciante — a plataforma é sempre a mesma.

#### 11.2.1 Interface móvel

Optimizada para operação diária no terreno. É a interface principal para cantinas, táxis, bancas de mercado, vendedores ambulantes e qualquer comerciante que opere sem computador.

> Sem TPA. Sem computador. Só o telefone — e o negócio funciona.

**O que a interface móvel permite:**

- Receber notificações de pagamento instantâneas
- Gerar QR estático e dinâmico a qualquer momento
- Acompanhar transacções e saldo em tempo real
- Emitir links de pagamento via WhatsApp, SMS ou redes sociais
- Confirmar pagamentos recebidos
- Gerir pedidos de pagamento
- Iniciar levantamentos para conta bancária

**Cenários reais em Angola:**

| Tipo de negócio | Fluxo com a interface móvel |
|-----------------|------------------------------|
| **Cantina de bairro** | QR impresso na parede → cliente faz scan → notificação imediata |
| **Motorista de táxi** | Gera QR antes da viagem → cliente paga → confirmação automática |
| **Banca de mercado** | @banza exibido → cliente transfere → saldo actualizado em segundos |
| **Delivery** | Link de pagamento enviado → cliente confirma → entrega desbloqueada |
| **Escola** | QR dinâmico por propina → pagamento registado → sem recibo manual |

#### 11.2.2 Interface web

A interface web é a superfície administrativa avançada da Banza Business — não é um produto separado. É o centro de controlo do mesmo negócio, acessível via navegador.

**O que a interface web oferece:**

| Secção | O que permite |
|--------|--------------|
| **Saldo da carteira** | Saldo disponível e reservado, actualizado em tempo real |
| **Transacções** | Cada pagamento recebido — timestamp, valor, @banza do consumidor |
| **Análises** | Volume diário/mensal, contagens de transacções, horas de pico |
| **Links de pagamento** | Criar, partilhar e gerir links de pagamento |
| **Pedidos de pagamento** | Enviar pedidos de pagamento a consumidores específicos |
| **Reembolsos** | Emitir reembolsos totais ou parciais |
| **Disputas** | Ver e responder a disputas de consumidores |
| **Levantamentos** | Transferir saldo para uma conta bancária angolana a pedido |
| **Chaves API** | Gerar e gerir credenciais para integrações SDK |
| **Acesso da equipa** | Adicionar pessoal com permissões controladas |

### 11.3 Como o pagamento flui

```
Consumidor
     |
     v
QR / @banza / Link
     |
     v
┌─────────────────────┐
│   Ledger Banza      │  <- pagamento liquidado instantaneamente
└─────────────────────┘
     |
     v
┌─────────────────────┐
│  Banza Business   │  <- comerciante notificado imediatamente
├─────────────────────┤
│  Interface movel    │  <- operacao diaria, QR, saldo
│  Interface web      │  <- analytics, gestao avancada
└─────────────────────┘
```

### 11.4 Superfícies de pagamento

| Superfície | Como | Melhor para |
|------------|------|------------|
| **QR Estático** | Imprimir e exibir permanentemente | Cantinas, quiosques, retalho físico |
| **QR Dinâmico** | Gerado por transacção, com valor pré-definido | Restaurantes, POS, delivery |
| **Link de pagamento** | Partilhar via WhatsApp, SMS ou redes sociais | Vendas remotas, comércio informal |
| **Pedido de pagamento** | Enviar directamente ao @banza do consumidor | Facturação, serviços por encomenda |
| **Integração SDK** | Incorporar numa app ou plataforma web | Apps de táxi, delivery, ecommerce local |

### 11.5 Levantamentos

Os saldos da carteira são transferidos para uma conta bancária angolana a pedido — a partir da interface móvel, da interface web ou via API. A Banza inicia a transferência imediatamente via EMIS e acompanha-a com total transparência. Sem pedidos manuais. Sem prazos opacos.

### 11.6 A loja QR

Cada comerciante tem um perfil público permanente em `pay.banzami.org/profiles/@banza`. Esta é a identidade digital que ancora o comerciante na rede Banza — partilhável como link, imprimível como QR, descobrível via pesquisa. Qualquer consumidor que chegue pode pagar instantaneamente.

### 11.7 SDK/API para ecommerce e apps

Aplicações angolanas — apps de táxi, delivery, ecommerce, escolas, plataformas de doações — podem integrar pagamentos Banza directamente no fluxo do utilizador.

O consumidor paga dentro da app, em Kwanza, sem sair para outro ambiente. A carteira do comerciante actualiza instantaneamente. Sem gateway externo. Sem redireccionamento. Sem fricção.

A integração é feita via Banza SDK oficial. Ver secção 12 para documentação técnica completa.

| Plataforma | SDK |
|------------|-----|
| **Web / Node.js** | TypeScript SDK |
| **PHP / Laravel** | PHP SDK |
| **Mobile (Flutter)** | Flutter SDK |
| **Qualquer linguagem** | API REST |

---

## 12. Banza para Programadores

### 12.1 Arquitectura SDK-first

A Banza é construída para programadores. O caminho de integração recomendado é sempre através de um Banza SDK oficial — nunca chamadas HTTP directas, nunca clientes artesanais, nunca soluções improvisadas.

Os SDKs oficiais fornecem por defeito:

- **Superfícies de API tipadas** — sem adivinhação sobre formas de pedido ou resposta
- **Idempotência automática** — cada POST é seguro para retry; sem cobranças duplicadas
- **Retry com backoff exponencial** — falhas transitórias são tratadas sem código
- **Verificação de assinatura de webhooks** — segurança por defeito, não por configuração opcional
- **Isolamento de ambiente** — sandbox e directo são completamente separados; sem chamadas acidentais para produção
- **Erros estruturados** — hierarquia de erros significativa, não códigos HTTP brutos

### 12.2 SDKs disponíveis

| Banza SDK | Linguagem | Uso principal |
|-----------|-----------|--------------|
| `@banza/sdk` | TypeScript / Node.js | APIs backend, ecommerce, fluxos de pagamento server-side |
| `banza/sdk-php` | PHP | Aplicações web, Laravel, WooCommerce |
| `banza-go` | Go | Serviços de alto desempenho, microsserviços |
| `banza-python` | Python | Django, FastAPI, pipelines de dados |
| `banza_flutter` | Flutter / Dart | Apps móveis, fluxos de pagamento in-app, comércio QR |

### 12.3 SDK TypeScript — exemplo de integração

```typescript
import { BanzaClient } from '@banza/sdk';

const client = new BanzaClient({
  baseUrl: 'https://api.banzami.org',   // infrastructure endpoint (Banzami org)
  apiKey:  'bz_live_...',
});

// Gerar um QR dinâmico para uma corrida de táxi
const qr = await client.createDynamicQr({
  ownerId:     'cns_driver_id',
  amountMinor: 3200,              // 3 200 Kz
  reference:   'Corrida #1041',
  expiresAt:   new Date(Date.now() + 5 * 60 * 1000),
});

// Passageiro faz scan → confirma → webhook dispara:
// { type: "transaction.completed", data: { ... } }
```

### 12.4 SDK PHP — exemplo de link de pagamento

```php
use Banza\BanzaClient;

$client = new BanzaClient(apiKey: 'bz_live_...');

// Criar um link de pagamento para uma encomenda WooCommerce
$link = $client->createPaymentLink([
    'merchant_id'  => 'mch_...',
    'wallet_id'    => 'wlt_...',
    'amount_minor' => 45000,          // 45 000 Kz
    'description'  => 'Encomenda #1042',
    'expires_at'   => (new DateTime('+24 hours'))->format(DateTime::RFC3339),
]);

// Redirecionar cliente para: https://pay.banzami.org/{$link['slug']}
```

### 12.5 SDK Flutter — folha de pagamento in-app

```dart
// App de delivery: accionar pagamento quando a encomenda é confirmada entregue
final result = await BanzaPay.confirm(
  context:     context,
  merchantId:  'mch_...',
  amountMinor: 8500,           // 8 500 Kz
  reference:   'Pedido #77',
  currency:    'AOA',
);

if (result.status == PaymentStatus.completed) {
  Navigator.pushNamed(context, '/order-complete');
}
```

O SDK trata de todo o fluxo de pagamento dentro de uma folha — autenticação do consumidor, pesquisa de carteira, UI de confirmação, estado em tempo real, callbacks de sucesso/falha. A app anfitriã recebe um resultado tipado e nunca implementa lógica de pagamento de raiz.

### 12.6 Webhooks

Cada evento significativo na Banza aciona uma entrega de webhook assinado. As aplicações subscrevem tipos de eventos e recebem-nos em segundos após a acção desencadeadora.

```typescript
// Gestor de webhooks Express
app.post('/webhooks/banza', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const event = BanzaWebhooks.constructEvent(
      req.body,
      req.headers['banza-signature'],
      process.env.BANZA_WEBHOOK_SECRET,
    );

    switch (event.type) {
      case 'transaction.completed':
        await fulfillOrder(event.data.metadata.orderId);
        break;
      case 'payout.completed':
        await markPayoutSettled(event.data.id);
        break;
      case 'refund.completed':
        await processRefundConfirmation(event.data.id);
        break;
    }

    res.json({ received: true });
  } catch (err) {
    if (err instanceof BanzaWebhookError) return res.status(400).send('Invalid signature');
    throw err;
  }
});
```

### 12.7 Ambiente sandbox

Cada conta tem acesso a um sandbox completo com chaves API separadas (`bz_sandbox_...`), dados isolados e sem movimento de dinheiro real. A superfície de API do sandbox é idêntica à de produção. Construa, teste e valide toda a integração antes de tocar numa credencial em directo.

### 12.8 Referência de API principal

| Categoria | Operações |
|-----------|-----------|
| Transacções | Criar, capturar, anular, listar, obter |
| Carteiras | Obter saldo, listar transacções |
| Transferências | Criar, listar |
| Códigos QR | Criar estático, criar dinâmico, descodificar, marcar como usado |
| Links de pagamento | Criar, obter, listar, cancelar, obter público, obter estado |
| Pedidos de pagamento | Criar, obter, listar, pagar, recusar, cancelar |
| Reembolsos | Criar, obter, listar |
| Disputas | Abrir, obter, listar |
| Levantamentos | Criar, obter, listar |
| Webhooks | Registar endpoint, listar eventos, listar entregas |
| Comerciantes | Criar, obter, actualizar |
| Consumidores | Criar, obter por @banza |
| Chaves API | Criar, listar, revogar |

---

## 13. Banza para Consumidores

### 13.1 A experiência do consumidor

A Banza é para cada angolano com um smartphone. Não é necessária uma conta bancária tradicional para começar. Não é necessário conhecimento técnico. Um telemóvel. Uma Banza Wallet. Tudo o resto segue-se.

### 13.2 Obter uma carteira

```
1. Inserir o seu número de telemóvel
2. Verificar com um código de uso único
3. Escolher o seu @banza
4. Definir um PIN (biométrico opcional)

→ Carteira pronta. Pode receber dinheiro imediatamente.
```

Menos de dois minutos do início ao fim.

### 13.3 Pagar com QR

```
Chega a uma cantina.
Um código QR está no balcão.

Abre a Banza. Toca em "Pagar."
Faz o scan.

A app mostra: "Pagar a @cantina.luanda"
Insere 1.500 Kz.
Confirma com a impressão digital.

Ecrã: ✅ Pago. 1.500 Kz.

O telemóvel da dona da cantina acende-se.
Feito.
```

### 13.4 Enviar dinheiro a um amigo

```
Deve dinheiro a um amigo pelo almoço.

Abre a Banza. Toca em "Enviar."
Escreve: @maria
Insere: 3.000 Kz
Toca em "Confirmar."

Feito. A carteira da Maria é creditada instantaneamente.
Ela recebe: "Recebeu 3.000 Kz de @joao."
```

### 13.5 Pagar um link de pagamento

Um comerciante envia via WhatsApp:

```
"Aqui está o link: pay.banzami.org/xyz789"
```

Toca nele. Uma página abre:
- Nome e logótipo do comerciante
- Valor: 15.000 Kz
- Descrição: Encomenda #12

Toca em "Pagar com Banza." Confirma com PIN. Feito.

### 13.6 Receber um pedido de pagamento

A escola do seu filho envia um pedido de pagamento. A sua app mostra:

```
📩 Pagamento solicitado
35.000 Kz — Escola Primária de Benguela (Março)
[Pagar]  [Ver detalhes]
```

Um toque. Pago. A escola regista-o imediatamente.

### 13.7 A sua carteira é o seu registo

A app Banza mostra cada transacção — enviada e recebida — com timestamps, valores e o @banza da outra parte. Sem cobranças misteriosas. Sem dinheiro físico por contabilizar. Visibilidade completa sobre a sua actividade financeira.

---

### 13.8 Por que os consumidores vão adoptar a Banza

A questão não é se os pagamentos digitais são melhores. São objectivamente. A questão é se a Banza é melhor do que as alternativas específicas que os angolanos usam hoje.

| Alternativa actual | Vantagem Banza |
|--------------------|-----------------|
| Dinheiro físico | Sem troco necessário; pagamentos remotos possíveis; recibo digital completo; sem risco de transportar dinheiro |
| Transferência bancária | Sem códigos de referência; sem IBAN; confirmação instantânea; sem prova de screenshot necessária |
| Screenshot WhatsApp | Criptograficamente confirmado; sem risco de prova fabricada; o comerciante vê em tempo real |
| Aguardar confirmação | Não há espera. A liquidação é instantânea. |
| Dividir contas manualmente | Divisão baseada em QR; cada pessoa paga a sua parte independentemente; sem aritmética mental, sem recordação incómoda |

Para além das comparações:

- **Uma identidade para todos os pagamentos.** O seu @banza é o seu endereço para cada pagamento: comerciantes, amigos, família, instituições.
- **Mais seguro do que dinheiro físico.** O dinheiro fica na sua carteira até confirmar um pagamento. Um telemóvel perdido não significa dinheiro perdido.
- **Sem problema de troco.** Ninguém precisa de troco exacto. Ninguém se desculpa por não ter notas pequenas.
- **Famílias e distância.** Envie dinheiro a família noutra cidade instantaneamente. Sem filas, sem códigos de transferência, sem espera.
- **Invisível para estranhos.** Os pagamentos QR são entre o seu telemóvel e o sistema do comerciante. Ninguém vê a sua informação financeira.

A história da adopção pelo consumidor não é sobre adopção de tecnologia. É sobre tornar algo que as pessoas já querem fazer — pagar e ser pago — mais simples e mais fiável do que alguma vez foi.

---

## 14. O Motor de Crescimento da Banza

Uma rede de pagamentos não é um produto que se constrói e lança. É uma rede que se faz crescer — e o seu valor compõe-se à medida que cresce.

### O mecanismo do motor

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│         Mais comerciantes aceitam QR                             │
│                    │                                             │
│                    v                                             │
│         Mais razões para os consumidores obterem uma carteira    │
│                    │                                             │
│                    v                                             │
│         Mais consumidores têm carteiras                          │
│                    │                                             │
│                    v                                             │
│         Mais comerciantes querem aceitar QR                      │
│                    │                                             │
│            ┌───────┘                                             │
│            v                                                     │
│         Mais integrações SDK                                     │
│                    │                                             │
│                    v                                             │
│         Mais consumidores descobrem a Banza dentro de apps       │
│                    │                                             │
│                    v                                             │
│         Mais circulação de carteiras                             │
│                    │                                             │
│                    v                                             │
│         Menos dependência de dinheiro físico                     │
│                    │                                             │
│                    v                                             │
│         A Banza torna-se o padrão                                │
│                    │                                             │
│                    └──────────────────> (ciclo acelera)          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Os três motores de crescimento

**Motor 1 — Densidade QR dos comerciantes**

Cada comerciante que se junta à Banza é uma nova razão para um consumidor obter uma Banza Wallet. Uma cantina, uma farmácia, um vendedor de mercado, um restaurante — cada um é um nó na rede. À medida que a densidade de comerciantes aumenta num bairro ou cidade, o atrito para um consumidor ficar sem Banza Wallet aumenta. Eventualmente a questão não é "devo obter a Banza?" mas "por que é que ainda não tenho a Banza?"

**Motor 2 — Integrações SDK**

Cada app angolana que integra o Banza SDK traz toda a sua base de utilizadores para contacto com a Banza Wallet. Uma app de táxi com 50.000 utilizadores activos cria mais activações de carteiras do que qualquer campanha de marketing. Uma plataforma de delivery, um serviço de streaming, uma app de jogos — cada integração é um multiplicador na adopção pelo consumidor, sem custo de aquisição adicional.

**Motor 3 — Circulação de carteiras**

À medida que mais consumidores têm carteiras e mais comerciantes aceitam pagamentos, o dinheiro começa a circular dentro da rede Banza. Um consumidor paga uma cantina. A cantina paga um fornecedor. O fornecedor paga pessoal. O pessoal paga comerciantes. Cada Kwanza que fica na rede em vez de sair como levantamento em dinheiro aumenta a liquidez para todos e reduz o atrito de sair.

### Por que densidade antes de expansão

O motor não gira pela geografia. Gira dentro de um mercado.

Uma rede Banza com 10.000 comerciantes angolanos e 500.000 carteiras angolanas é dramaticamente mais valiosa para cada participante do que uma presença Banza em 10 países com 100 comerciantes cada. O efeito de rede requer concentração. É por isso que Angola vem primeiro — não porque outros mercados são sem importância, mas porque o motor deve estar a girar fortemente antes que a expansão faça sentido.

---

## 15. Ecossistema de Negócio Banzami

A Banzami não é uma empresa de produto único — é um ecossistema de participantes interligados, todos conectados pelo produto Banza, cada um beneficiando do crescimento da rede.

### 15.1 Participantes da rede

```
┌─────────────────────────────────────────────────────────────┐
│                       REDE BANZA                            │
│                                                             │
│  ┌──────────────┐    paga    ┌──────────────────────────┐   │
│  │  Consumidores│───────────>│  Comerciantes            │   │
│  │  (carteiras) │<───────────│  (Banza Business)      │   │
│  └──────────────┘   recebe   └──────────────────────────┘   │
│         │                              │                    │
│         v                              v                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │       Motor de Ledger e Carteiras Banza              │   │
│  │    (dupla entrada, instantâneo, imutável)            │   │
│  └──────────────────────────────────────────────────────┘   │
│         │                              │                    │
│         v                              v                    │
│  ┌──────────────┐             ┌──────────────────────────┐  │
│  │  Apps com    │             │  EMIS / Bancos Angolanos │  │
│  │  Banza SDK   │             │  (liquidação interbanc.) │  │
│  └──────────────┘             └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 15.2 Relações com bancos e parceiros

Os bancos angolanos não são concorrentes da Banza. São parceiros essenciais da Banzami.

- **Os bancos fornecem:** contas licenciadas, infraestrutura de liquidação, conformidade regulatória e os saldos em Kwanza que financiam as Banza Wallets.
- **A Banza fornece:** UX de pagamento instantâneo, camada de comércio QR, Banza SDKs para programadores, ferramentas para comerciantes e o efeito de rede que torna os pagamentos digitais habituais.

Os bancos ganham um produto de comércio moderno sobre a sua infraestrutura existente sem o construírem eles próprios. A Banzami ganha acesso à infraestrutura regulada que não pode possuir directamente. Esta é uma parceria com incentivos alinhados — não um conflito.

### 15.3 Modelo de receita

| Fonte de receita | Mecanismo |
|-----------------|-----------|
| **Comissões de transacção** | Pequena percentagem de cada liquidação de comerciante bem-sucedida |
| **Comissões de levantamento** | Taxa nominal por levantamento bancário de uma carteira de comerciante |
| **Licenciamento SDK empresarial** | Preços por volume para integradores de alta transacção |
| **Ferramentas premium para comerciantes** | Análises avançadas, gestão multi-localização (futuro) |

Todas as comissões são transparentes e divulgadas no onboarding. Sem encargos ocultos. Sem mínimos mensais. Sem custos de hardware.

---

## 16. Segurança e Integridade Financeira

A Banza lida com dinheiro real. A segurança e a integridade financeira não são funcionalidades — são a fundação sobre a qual tudo o resto é construído.

### 16.1 Ledger de dupla entrada

Cada movimento monetário na Banza é registado como uma **entrada de ledger de dupla entrada** imutável — o mesmo princípio contabilístico usado por bancos e instituições financeiras há séculos.

```
O consumidor paga 2.500 Kz a um comerciante:

  Carteira do Consumidor   │ DÉBITO  │ -2.500 Kz
  Carteira do Comerciante  │ CRÉDITO │ +2.500 Kz
  ──────────────────────────────────────────────
  Líquido:                 │         │     0 Kz
```

Nenhum dinheiro é criado ou destruído. Cada Kwanza no sistema é contabilizado em cada momento. Se uma entrada de ledger criasse um desequilíbrio, a operação é rejeitada antes de ser confirmada.

### 16.2 Imutabilidade e trilhos de auditoria

As entradas de ledger não podem ser editadas ou apagadas. Um reembolso não modifica a transacção original — cria uma nova entrada oposta. Isto significa que o historial financeiro completo de cada carteira é sempre completamente reconstruível.

Em caso de qualquer auditoria, disputa ou inquérito regulatório, cada pagamento pode ser rastreado desde o início até à liquidação com um registo completo e inviolável.

### 16.3 Idempotência

Cada operação de pagamento é **idempotente** — submeter a mesma operação duas vezes não produz efeito adicional. As falhas de rede por vezes causam retries. Sem idempotência, um retry criaria uma cobrança duplicada.

A Banza atribui uma chave de idempotência única a cada operação. Se a mesma chave for submetida novamente, o resultado original é devolvido imediatamente, sem criar uma nova transacção.

### 16.4 Motor de risco

Cada transacção passa por um motor de risco em tempo real antes de ser confirmada no ledger:

- velocidade de transacção (frequência invulgar de uma única carteira)
- anomalias de valor (valores muito fora do intervalo normal de uma carteira)
- sinais de conta (contas recentemente registadas, identidade não verificada)
- sinais de dispositivo e sessão (impressão digital de dispositivo ou localização inconsistente)

As transacções acima dos limiares de risco são retidas para revisão ou recusadas antes de o ledger ser tocado.

### 16.5 KYC e KYB

**KYC (Know Your Customer):** cada consumidor é verificado de identidade antes de os pagamentos em directo serem activados. A verificação usa documentos de identidade angolanos (B.I., Passaporte ou Carta de Condução), por níveis conforme o volume de transacções.

**KYB (Know Your Business):** cada comerciante é verificado. Verificação NIF para entidades formais; verificação de identidade para comerciantes individuais.

Estes processos satisfazem os requisitos do BNA (Banco Nacional de Angola) para operadores de pagamento digital.

### 16.6 Encriptação e segurança de dados

| Protecção | Norma |
|-----------|-------|
| Dados em repouso | Encriptação AES-256 |
| Dados em trânsito | TLS 1.3 |
| Chaves API | Hash SHA-256 em repouso; chave bruta mostrada apenas uma vez |
| Segredos de webhook | Hash em repouso; apenas assinatura HMAC |
| Documentos KYC | Armazenamento encriptado com registo de auditoria de acesso |

### 16.7 Isolamento sandbox

O sandbox e a produção são **completamente isolados** — diferentes chaves API, diferentes dados, diferente infraestrutura. O dinheiro real nunca se move no sandbox. Este isolamento é aplicado tanto na camada API como na camada de infraestrutura. Não há forma de encaminhar acidentalmente tráfego sandbox para produção.

### 16.8 Reconciliação

A reconciliação automática corre diariamente:

- Soma de todos os saldos de carteiras reconciliada com todos os créditos e débitos do ledger
- Valores de liquidação EMIS esperados reconciliados com créditos bancários reais
- Valores de pagamento pendentes reconciliados com transferências bancárias concluídas

Qualquer discrepância — por menor que seja — aciona um alerta e um fluxo de resolução. A plataforma visa zero discrepâncias não resolvidas em qualquer ponto no tempo.

---

## 17. Arquitectura Técnica

### 17.1 Princípios de design

A Banza é construída como **infraestrutura financeira à escala nacional**, pela Banzami. Não um MVP de startup. Não uma prova de conceito. Infraestrutura concebida para operar durante décadas.

Cada decisão arquitectural é ordenada por:

1. **Correcção** — as operações financeiras são seguras, auditáveis e determinísticas acima de tudo
2. **Fiabilidade** — a plataforma está disponível quando os comerciantes e consumidores precisam
3. **Segurança** — cada camada é construída com um modelo de ameaças
4. **Observabilidade** — cada componente emite métricas, traços e logs estruturados
5. **Manutenibilidade** — a base de código é concebida para operação a longo prazo, não velocidade a curto prazo

### 17.2 Stack tecnológico

| Camada | Tecnologia | Porquê |
|--------|-----------|--------|
| **Core financeiro** | Rust | Segurança de memória, desempenho determinístico, sem pausas de garbage collection no caminho de pagamento |
| **Camada API** | Go | Simplicidade, fiabilidade, excelente concorrência para servir APIs |
| **Frontend** | TypeScript + Next.js | Type-safe, moderno, excelente experiência de programador |
| **SDKs móveis** | Flutter | Cross-platform; base de código única para Android e iOS |
| **Base de dados** | PostgreSQL | A única fonte de verdade financeira; garantias ACID; provado à escala |
| **Cache e coordenação** | Redis | Rate limiting, armazenamento de idempotência, gestão de sessão, pub/sub para eventos em tempo real |
| **Observabilidade** | OpenTelemetry + Prometheus + Grafana | Visibilidade full-stack desde o gateway API até à escrita no ledger |
| **Infraestrutura** | Docker + Hetzner/OVH + Cloudflare | Infraestrutura fiável, económica e próxima de África |

### 17.3 Arquitectura principal

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENTES                               │
│    App Banza · Banza Business · Apps Integradas · Banza SDKs    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS / TLS 1.3
                           v
┌─────────────────────────────────────────────────────────────────┐
│               CLOUDFLARE (DDoS, WAF, CDN)                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           v
┌─────────────────────────────────────────────────────────────────┐
│                  API GATEWAY (Go)                               │
│       Auth · Rate limiting · Routing · Entrega de webhooks      │
└──────┬──────────────────────────────────────────┬───────────────┘
       │                                          │
       v                                          v
┌────────────────────┐                ┌──────────────────────────┐
│  API PÚBLICA (Go)  │                │    API ADMIN (Go)        │
│  Pagamentos · QR   │                │    Liquidações           │
│  Transfer. · SDK   │                │    Disputas              │
│  Perfis            │                │    Reconciliação         │
└──────┬─────────────┘                └───────────┬──────────────┘
       │                                          │
       └───────────────────────┬──────────────────┘
                               v
┌─────────────────────────────────────────────────────────────────┐
│                      CORE API (Rust)                            │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐     │
│  │  Motor   │  │  Motor   │  │  Motor   │  │  Liquidação  │     │
│  │  Ledger  │  │Carteiras │  │  Transac.│  │  Reconciliac.│     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘     │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐     │
│  │  Motor   │  │Conformid.│  │  Motor   │  │  Reembolsos /│     │
│  │  Risco   │  │   Core   │  │Pagamentos│  │  Disputas    │     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘     │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               v
┌─────────────────────────────────────────────────────────────────┐
│                          POSTGRESQL                             │
│               (única fonte de verdade financeira)               │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               v
┌─────────────────────────────────────────────────────────────────┐
│                    EMIS / BANCOS ANGOLANOS                      │
│                  (rede de liquidação interbancária)             │
└─────────────────────────────────────────────────────────────────┘
```

### 17.4 O caminho crítico de pagamento

O caminho crítico é mantido deliberadamente mínimo:

```
auth → verificação de risco → conformidade → escrita no ledger → actualização de carteira → resposta
```

Tudo fora deste caminho é assíncrono:
- entrega de webhooks
- registo de análises
- trabalhos de reconciliação
- despacho de notificações push
- relatórios

Isto mantém a operação que o consumidor e o comerciante esperam — a confirmação — o mais rápida possível, sem bloqueios desnecessários.

### 17.5 Garantia de liquidação instantânea

Três contratos arquitecturais sustentam cada transacção:

1. **As escritas no ledger são síncronas e atómicas.** A transacção não é confirmada até as entradas do ledger serem duráveis. A correcção financeira nunca é trocada por velocidade.
2. **Os saldos das carteiras actualizam imediatamente** após cada transacção confirmada. Quando o ecrã de sucesso do consumidor aparece, o saldo do comerciante já mudou. Não existe "irá actualizar brevemente."
3. **A entrega de webhooks começa imediatamente** após a confirmação da transacção. A integração server-side do comerciante recebe o evento em segundos após a confirmação.

### 17.6 Abordagem de monólito modular

A Banza é um **monólito modular** — uma unidade implementável com módulos internos fortemente isolados, fronteiras de domínio claras e interfaces internas explícitas.

Esta é uma escolha deliberada. Os microsserviços prematuros introduzem complexidade de sistemas distribuídos, sobrecarga operacional e modos de falha que não são justificados até que os limites de escala sejam provados por tráfego real. O monólito modular é mais simples de raciocinar, implementar e manter — e pode ser decomposto em serviços exactamente quando, e apenas quando, a evidência o exige.

### 17.7 Observabilidade

Cada serviço emite:

- **Métricas** (Prometheus) — taxas de pedidos, taxas de erro, percentis de latência, operações de carteiras, volumes de liquidação
- **Traços** (OpenTelemetry) — traços de pedidos ponta-a-ponta desde o gateway API até à escrita no ledger
- **Logs estruturados** — JSON com IDs de transacção, tipos de operação e resultados
- **Sinais de saúde** — endpoints de liveness e readiness

Três painéis principais Grafana fornecem visibilidade operacional:

| Painel | Cobertura |
|--------|----------|
| **Pagamentos** | Taxas de transacção, taxas de erro, conclusão QR, entrega de webhooks |
| **Carteiras e Ledger** | Volume de transferências, percentis de latência, taxas de leitura de saldos, reembolsos e disputas |
| **Liquidações e Levantamentos** | Taxas de liquidação, throughput de levantamentos, operações de reconciliação |

---

## 18. O Ecossistema Banzami

### 18.1 Mapa completo da plataforma

```
┌─────────────────────────────────────────────────────────────────────┐
│                       PLATAFORMA BANZAMI                            │
│                                                                     │
│  CAMADA DO CONSUMIDOR                                               │
│  ┌──────────────────┐   ┌──────────────────────────────────────┐    │
│  │  App Banza       │   │  pay.banzami.org                     │    │
│  │  (Flutter)       │   │  links · QR · lojas de comerciantes  │    │
│  └──────────────────┘   └──────────────────────────────────────┘    │
│                                                                     │
│  CAMADA DO COMERCIANTE                                              │
│  ┌──────────────────┐   ┌──────────────────────────────────────┐    │
│  │  Banza Business│   │  QR (estático + dinâmico)            │    │
│  │  Interface movel │   │  Links · Pedidos de pagamento        │    │
│  │  Interface web   │   │  Reembolsos · Disputas · Análises    │    │
│  └──────────────────┘   └──────────────────────────────────────┘    │
│                                                                     │
│  CAMADA DE OPERAÇÕES                                                │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Painel Admin — Liquidações · Reconciliação · Disputas       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  CAMADA DE PROGRAMADORES                                            │
│  ┌────────────┐ ┌──────┐ ┌────┐ ┌──────────┐ ┌────────────────┐     │
│  │ TypeScript │ │  PHP │ │ Go │ │  Python  │ │    Flutter     │     │
│  │    SDK     │ │  SDK │ │SDK │ │   SDK    │ │     SDK        │     │
│  └────────────┘ └──────┘ └────┘ └──────────┘ └────────────────┘     │
│                                                                     │
│  CAMADA DE INFRAESTRUTURA                                           │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Core Rust · APIs Go · PostgreSQL · Redis · Grafana          │   │
│  │  OpenTelemetry · Prometheus · Cloudflare · Docker            │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 18.2 A plataforma de programadores

A plataforma de programadores é a infraestrutura através da qual os construtores de aplicações angolanas acedem a pagamentos instantâneos:

- Documentação API — referência abrangente para cada endpoint
- Documentação SDK — guias de integração para cada linguagem
- Ambiente sandbox — teste sem limites, sem risco
- Ferramentas de teste de webhooks — inspeccionar e reproduzir eventos de webhook
- Gestão de chaves API — gerar, rodar e revogar credenciais
- Exemplos de integração — implementações de referência para fluxos comuns

### 18.3 Ecossistema de plugins

| Plugin | Plataforma | O que faz |
|--------|----------|-----------|
| WooCommerce | WordPress | Gateway de pagamento para lojas angolanas com WooCommerce |
| PrestaShop (futuro) | PrestaShop | Módulo de pagamento para comerciantes PrestaShop |

Os plugins usam o SDK internamente — herdam todas as garantias do SDK: idempotência, tratamento de retry, verificação de assinatura.

### 18.4 Catálogo de eventos em tempo real

| Evento | Quando dispara |
|--------|---------------|
| `transaction.completed` | Pagamento liquidado com sucesso |
| `transaction.failed` | Tentativa de pagamento falhada |
| `payout.completed` | Levantamento bancário liquidado |
| `refund.created` | Reembolso iniciado |
| `refund.completed` | Reembolso liquidado |
| `dispute.opened` | Consumidor abre uma disputa |
| `dispute.resolved` | Disputa resolvida |
| `payment_request.paid` | Consumidor paga um pedido de pagamento |
| `payment_request.declined` | Consumidor recusa um pedido de pagamento |

---

## 19. Roadmap e Futuro

### Curto prazo

| Funcionalidade | Descrição |
|----------------|-----------|
| **SDK Python** | Async-first com Pydantic v2; integrações Django e FastAPI |
| **Gestão de perfil de comerciante** | Interface na Banza Business para criar e editar perfis públicos de comerciantes |
| **Notificações FCM de pedidos de pagamento** | Notificações push para pedidos de pagamento recebidos |
| **Expansão de eventos webhook** | Eventos para reembolsos, disputas e pedidos de pagamento |

### Médio prazo

| Funcionalidade | Descrição |
|----------------|-----------|
| **App móvel do consumidor** | App Flutter nativa: carteira, scanner QR, transferências P2P, histórico de transacções |
| **Pagamentos recorrentes** | Pedidos agendados para subscrições, propinas escolares e quotas |
| **Pagamentos divididos** | Contas de grupo divididas automaticamente entre múltiplos consumidores |
| **Descoberta de comerciantes** | Directório de comerciantes na app; encontrar e pagar comerciantes locais |
| **QR offline** | Pagamentos QR estáticos que fazem fila e liquidam quando a conectividade recomeça |

### Longo prazo

| Funcionalidade | Descrição |
|----------------|-----------|
| **Pagamentos em marketplace** | Liquidação multi-comerciante numa única compra do consumidor |
| **Carregamento de carteira por cartão** | Financiar uma Banza Wallet usando um cartão de débito (o cartão é uma via de financiamento — não o modelo de pagamento) |
| **Interoperabilidade financeira** | Integração EMIS mais profunda; compatibilidade mais ampla com infraestrutura bancária angolana |
| **Expansão geográfica** | Após Angola atingir densidade de rede: o mesmo modelo, aplicado a mercados vizinhos |
| **Contas empresariais** | Contas multi-utilizador com permissões baseadas em funções e integrações contabilísticas |

### Sobre a expansão geográfica

A expansão é um marco futuro, não um objectivo actual. Uma rede de pagamentos torna-se valiosa através da densidade. Uma rede fina em muitos países vale menos para cada participante do que uma rede densa num só. A Banza atinge densidade de rede real em Angola primeiro, depois expande com um modelo que já foi provado.

A arquitectura já está concebida para isso. O timing ainda não chegou.

---

## 20. Declaração de Visão Final

### O que o comércio de Angola merece

O comércio de Angola merece infraestrutura que corresponda à sua energia.

Não infraestrutura adaptada de um modelo estrangeiro que nunca foi concebido para o Kwanza, para comerciantes informais ou para pagamentos QR-native. Não infraestrutura dependente de redes estrangeiras, aprovação estrangeira ou preços estrangeiros.

Infraestrutura construída aqui. Para aqui.

**Isso é a Banza — construída pela Banzami.**

### A transformação

**Hoje:**
- Um comerciante não pode aceitar pagamentos digitais sem hardware caro ou um acordo bancário
- Um consumidor tem de fotografar transferências bancárias e enviá-las via WhatsApp para provar uma compra
- Um programador a construir uma app angolana não tem SDK de pagamentos construído para o seu mercado
- Uma app de táxi não consegue fechar o ciclo de pagamento na app
- Uma cantina não tem escolha senão dinheiro físico
- Uma escola reconcilia pagamentos de propinas a partir de recibos físicos, manualmente, no fim da semana

**Amanhã — com a Banza:**
- Um comerciante imprime um QR e aceita pagamentos instantâneos de qualquer smartphone, imediatamente
- Um consumidor faz o scan, confirma e paga em menos de 3 segundos — com um recibo criptográfico
- Um programador integra o Banza SDK tipado e pronto para produção e lança uma funcionalidade de pagamento em horas
- Uma app de táxi fecha cada corrida com liquidação instantânea na app
- Uma cantina tem uma Banza Wallet, a Banza Business e visibilidade total sobre cada transacção
- Uma escola sabe em tempo real exactamente quem pagou

### Por que isto importa para além do comércio

Os pagamentos não são apenas transacções. São confiança.

Quando um pagamento é instantâneo e confirmado, ambas as partes podem avançar sem dúvida. Quando um recibo é digital e permanente, não há disputa sobre o que foi acordado. Quando uma carteira é sempre acessível, a capacidade de participar na vida económica não é restringida pela geografia, pelo acesso bancário formal ou pelo dinheiro físico.

A Banza torna a economia angolana mais líquida, mais transparente e mais acessível — não substituindo o que existe, mas completando o que falta. Construída pela Banzami.

### A promessa

Cada decisão de engenharia, cada escolha de produto e cada design na Banza reflecte um compromisso da Banzami:

**Os pagamentos digitais em Angola devem ser instantâneos, acessíveis, integrados e utilizáveis por todos.**

Não para alguns comerciantes. Não para alguns consumidores. Não para algumas aplicações.

Para cada cantina. Para cada táxi. Para cada escola, vendedor de mercado, site de ecommerce, plataforma de delivery, freelancer e família.

Para Angola.

```
   SCAN   →   CONFIRMAR   →   PAGO INSTANTANEAMENTE
```

---

*Banza — A rede de pagamentos instantâneos de Angola. Wallet-native. QR-first. Construída para cada angolano.*  
*Banzami — A infraestrutura que permite Angola pagar digitalmente.*

---

**Referências do documento:**

- ADR-016 — Arquitectura de Marca Banzami/Banza
- ADR-015 — Arquitectura de Conteúdo Markdown-First
- ADR-014 — Missão Nacional Angola-First
- ADR-013 — Identidade de Rede de Pagamentos Wallet-Native
- ADR-012 — Ecossistema SDK-First
- Estratégia de Produto
- Posicionamento de Mercado
- Filosofia UX Móvel
- Onboarding de Comerciantes
- README de Arquitectura
- Banza SDK TypeScript
- Banza SDK PHP
- CLAUDE.md — Constituição de Engenharia
