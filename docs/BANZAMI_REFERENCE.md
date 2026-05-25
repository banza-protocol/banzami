# Banzami — Documento de Referência Oficial

**Version:** 1.0  
**Date:** 06/05/2026  
**Status:** Official  
**Author:** Banzami

---

> **Banza não é apenas uma carteira digital.**  
> **É uma infraestrutura programável de pagamentos instantâneos em Kwanza — com QR, wallets, APIs, SDKs e identidade financeira @banza.**  
> Banzami constrói a infraestrutura. Banza move o dinheiro.

---

Angola não precisa de uma cópia do sistema de pagamentos de outro país.  
Angola precisa do seu próprio — construído para o Kwanza, para o QR, para o smartphone em cada bolso.

**Isso é o Banza — o produto principal do Banzami.**

---

## Índice

1. [O que é o Banzami?](#1-o-que-é-o-banzami)
2. [Por que o Banzami Existe](#2-por-que-o-banzami-existe)
3. [Por que Agora?](#3-por-que-agora)
4. [A Visão](#4-a-visão)
5. [Uma Manhã em Luanda](#5-uma-manhã-em-luanda)
6. [Como o Banza Funciona](#6-como-o-banza-funciona)
7. [Funcionalidades Principais](#7-funcionalidades-principais)
8. [Casos de Uso Reais em Angola](#8-casos-de-uso-reais-em-angola)
9. [Ecossistema de Pagamentos QR](#9-ecossistema-de-pagamentos-qr)
10. [Filosofia Wallet-Native](#10-filosofia-wallet-native)
11. [Banza para Comerciantes](#11-banza-para-comerciantes)
12. [Banza para Programadores](#12-banza-para-programadores)
13. [Banza para Consumidores](#13-banza-para-consumidores)
14. [O Motor de Crescimento do Banza](#14-o-motor-de-crescimento-do-banza)
15. [Ecossistema de Negócio Banzami](#15-ecossistema-de-negócio-banzami)
16. [Segurança e Integridade Financeira](#16-segurança-e-integridade-financeira)
17. [Arquitectura Técnica](#17-arquitectura-técnica)
18. [O Ecossistema Banzami](#18-o-ecossistema-banzami)
19. [Roadmap e Futuro](#19-roadmap-e-futuro)
20. [Arquitectura Sandbox & TestFlight](#20-arquitectura-sandbox--testflight)
21. [Declaração de Visão Final](#21-declaração-de-visão-final)

---

## 1. O que é o Banzami?

**Banzami** constrói a infraestrutura que permite ao país pagar digitalmente — a plataforma, a missão institucional e o ecossistema de parceiros que tornam possível uma nova era de comércio digital em Angola.

**Banza** é o produto principal do Banzami: a **infraestrutura programável de pagamentos instantâneos de Angola** — uma plataforma completa de pagamentos em Kwanza com QR, wallets, APIs, SDKs e identidade financeira @banza, construída especificamente para o comércio angolano.

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

O Banza não é um banco. Não é um processador de cartões. Não é uma carteira digital simples. Não é uma plataforma fintech genérica adaptada de um modelo ocidental e rebaptizada para África.

O Banza é uma **infraestrutura programável de pagamentos instantâneos**: cada conta é uma carteira em Kwanza, cada pagamento é uma transferência directa de carteira-para-carteira, e qualquer aplicação angolana pode integrar pagamentos instantâneos via SDK em horas. O dinheiro move-se em tempo real — confirmado, liquidado e visível em segundos.

### As quatro camadas do Banza

| Camada | Para quem | O que oferece |
|--------|-----------|---------------|
| **Consumidor** | Cada angolano | Carteira Banza, QR payments, transferências P2P @banza, histórico instantâneo |
| **Comerciante** | Cantinas, lojas, plataformas | Banza Business, QR estático/dinâmico, pagamentos sem terminal, dashboard em tempo real |
| **Programador** | Apps de táxi, ecommerce, delivery, doações | Banza SDK, Banza API, payment links, webhooks, sandbox — integração em horas |
| **Infraestrutura** | Parceiros, bancos, integradores | Rails de liquidação, ledger de dupla entrada, reconciliação, EMIS/Multicaixa |

### Os quatro pilares do Banza

| Pilar | O que significa |
|-------|----------------|
| **Programmable** | Qualquer aplicação angolana integra pagamentos via SDK ou API. O Banza não é só uma app — é a camada de pagamentos de Angola. |
| **Wallet-native** | Cada conta é uma carteira em Kwanza. Os pagamentos são transferências directas entre carteiras. Sem IBAN. Sem código bancário. Sem cartão. |
| **QR-native** | A principal superfície de pagamento para comerciantes é um código QR. O comerciante imprime um QR. O consumidor faz o scan. O pagamento é instantâneo. Sem terminal, sem hardware, sem atrito. |
| **Instant settlement** | O dinheiro move-se no momento em que o pagamento é confirmado — confirmado, liquidado e visível em segundos. |

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

### Identidade no Banza

Cada pessoa e cada comerciante na rede Banza tem um **@banza** — uma identidade de pagamento nativa, legível por humanos, que funciona como endereço para qualquer pagamento. Pagar no Banza tem este aspecto:

```
Pagar: @cantina.luanda
Valor: 2.500 Kz
```

Sem número de conta bancária. Sem IBAN. Sem códigos de referência. Sem dados de cartão. Apenas um @banza e um valor.

### Quem o Banza serve

- **Consumidores** — cada angolano que quer pagar, transferir e receber dinheiro instantaneamente
- **Comerciantes** — desde cantinas e bancas de mercado até plataformas de ecommerce e apps de táxi
- **Programadores** — equipas a construir apps angolanas que precisam de aceitar pagamentos em Kwanza via SDK ou API
- **Integradores e parceiros** — bancos, fintechs e plataformas que querem incorporar pagamentos instantâneos na sua infraestrutura

---

### Por que os nomes Banzami e Banza?

**Banza** é uma palavra profundamente enraizada nas tradições linguísticas bantu de Angola, especialmente no universo Kikongo, onde *mbanza* designa historicamente um lugar de encontro, uma povoação, uma cidade ou um centro de vida comunitária. Uma *banza* é um lugar. Um encontro. Uma casa. Um centro de vida onde as pessoas se reúnem.

O **Banza** — o produto de pagamento — herda directamente este significado: um espaço onde o comércio acontece, onde o dinheiro circula, onde angolanos se encontram para trocar valor.

O **Banzami** — a organização — parte dessa mesma raiz e constrói a partir dela o ecossistema que torna tudo isso possível.

Um nome distintamente angolano — não uma palavra emprestada, não um conceito traduzido, não uma marca inventada noutro continente — era a única escolha honesta.

O nome é um sinal: esta plataforma foi feita aqui. Para aqui.

---

## 2. Por que o Banzami Existe

Angola tem um problema de pagamentos. Não é um problema tecnológico — Angola tem uma forte penetração móvel, infraestrutura de internet crescente e uma população pronta para o comércio digital. O problema é que a experiência de pagamento existente está quebrada de formas previsíveis e corrigíveis.

### 2.1 A dependência do dinheiro físico

Apesar da utilização generalizada de smartphones, o dinheiro físico continua a ser o método de pagamento dominante em Angola por uma razão clara: **o dinheiro físico é mais simples do que as alternativas digitais existentes**.

Pagar digitalmente hoje significa encontrar uma agência bancária ou ATM, iniciar uma transferência, copiar um código de referência, aguardar confirmação e, por vezes, provar manualmente o pagamento ao comerciante. Para compras pequenas do dia-a-dia — uma refeição numa cantina, uma corrida para casa, uma compra no mercado — o dinheiro físico é simplesmente mais rápido.

**O Banza torna os pagamentos digitais mais rápidos do que o dinheiro físico.**

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

**O Banza elimina isto por completo.** Quando um cliente faz o scan de um QR Banza e confirma o pagamento, o comerciante vê uma notificação instantânea e criptograficamente confirmada na sua app. Sem screenshots. Sem mensagens de WhatsApp. Sem verificação manual. O pagamento é liquidado e a carteira do comerciante é actualizada em tempo real.

### 2.3 A lacuna nos pagamentos in-app

As apps de táxi angolanas, plataformas de delivery e marketplaces não conseguem fechar o ciclo de pagamento dentro dos seus produtos. O passo do pagamento força os utilizadores para fora da app — para dinheiro físico, para uma transferência bancária externa, para soluções improvisadas que falham mais vezes do que funcionam.

O resultado: experiências de utilizador quebradas, altas taxas de abandono e comerciantes que não conseguem oferecer um serviço digital fluido independentemente de quão bom seja o seu produto.

O Banza fornece a infraestrutura SDK que permite a qualquer aplicação angolana incorporar um fluxo de pagamento completo — confirmação, liquidação, recibo — sem o consumidor sair alguma vez da app.

### 2.4 A lacuna do SDK

Não existe nenhum SDK de pagamentos nativo angolano. Um programador a construir uma aplicação angolana não tem uma API limpa, tipada e pronta para produção para aceitar pagamentos instantâneos em Kwanza. Improvisa — com vulnerabilidades de segurança, comportamento inconsistente, sem lógica de retry e sem suporte significativo quando algo corre mal.

O Banza é a primeira infraestrutura de pagamentos construída especificamente para programadores angolanos: SDKs tipados, idempotência automática, retry com backoff exponencial, verificação de assinaturas de webhooks e testes em sandbox — tudo de nível de produção, tudo pronto a usar.

### 2.5 O problema de exclusão dos comerciantes

Pequenos comerciantes — cantinas, farmácias, vendedores de mercado — estão excluídos do comércio digital porque as soluções existentes requerem hardware caro, acordos bancários formais com requisitos complexos, ou infraestrutura de terminais de cartão à qual a maioria dos comerciantes angolanos simplesmente não tem acesso.

O Banza não requer nada disto. Um comerciante precisa de um telefone e um código QR impresso. Esse é o único requisito de infraestrutura para começar a aceitar pagamentos digitais instantâneos.

---

## 3. Por que Agora?

As condições para uma transformação da rede de pagamentos em Angola não são possibilidades futuras. São realidades presentes.

### 3.1 O smartphone já está lá

Angola tem uma das taxas de penetração móvel de crescimento mais rápido no continente. Os smartphones já não são escassos. Estão em cantinas, em mercados, em táxis, em escolas, em casas por toda a Luanda, Benguela, Huambo e além. O dispositivo que entrega o Banza já está no bolso da pessoa que precisamos de alcançar.

A barreira de infraestrutura que antes bloqueava o comércio digital — "as pessoas não têm telemóveis" — já não existe.

### 3.2 A economia do WhatsApp é a prova

Angola já tem uma economia digital. Funciona no WhatsApp. Produtos são vendidos, serviços são negociados e até pagamentos são confirmados — via screenshots — pelo WhatsApp todos os dias.

Isto não é sinal de que os angolanos não estão prontos para o comércio digital. É prova de que já conduzem comércio digital, usando as ferramentas disponíveis. O Banza é a ferramenta melhor. Faz o que o WhatsApp-mais-screenshots faz, mas correctamente, instantaneamente e com segurança.

O hábito já existe. O Banza melhora-o.

### 3.3 O QR já provou o modelo globalmente

No Brasil, o Pix criou uma rede de pagamentos instantâneos QR-native que se tornou o método de pagamento dominante em menos de três anos. Na Índia, o UPI processa milhares de milhões de transacções mensalmente usando transferências instantâneas por identificadores virtuais de utilizador — o mesmo conceito do @banza. Na China, o WeChat Pay tornou o scan de QR tão habitual que o dinheiro físico se tornou a excepção nas grandes cidades.

Nenhum desses países tinha vantagens especiais. Tinham uma infraestrutura clara, um lançamento focado e um produto genuinamente melhor do que o dinheiro físico. Angola tem exactamente as mesmas pré-condições. O modelo está provado.

### 3.4 A economia informal precisa de infraestrutura digital

A maioria do comércio angolano acontece informalmente. Vendedores de mercado, comerciantes de rua, freelancers, pequenos negócios — estes não são casos extremos. São a espinha dorsal económica do país. As soluções de pagamento digital existentes têm sistematicamente excluído estas pessoas.

Uma rede de pagamentos QR-native, sem hardware, sem taxa mensal, é a primeira solução que se adapta ao modo como o comércio informal angolano realmente funciona.

### 3.5 A geração de programadores está pronta

Angola tem uma geração crescente de programadores a construir aplicações móveis, plataformas web e serviços digitais para o mercado local. São qualificados, motivados e a trabalhar em problemas reais. O que lhes falta é uma API de pagamentos angolana — uma forma limpa e fiável de aceitar Kwanza nos seus produtos.

O Banza é essa infraestrutura. A comunidade de programadores está pronta para construir com ela.

### 3.6 A oportunidade do salto tecnológico

Angola tem a oportunidade de saltar por completo a fase da infraestrutura de cartões. As economias ocidentais construíram redes de pagamentos em torno de cartões nos anos 80 e estão agora a migrar lentamente para longe deles. Angola nunca construiu uma rede de cartões à escala. Isso significa que Angola pode ir directamente para o modelo melhor: wallet-native, QR-first, liquidação instantânea.

Angola não precisa de repetir um desvio de 40 anos. Pode começar no destino.

---

## 4. A Visão

A economia digital de Angola não está quebrada — está inacabada. A infraestrutura existe. A população está pronta. O que falta é a camada de pagamentos que os liga.

A visão do Banzami é completar essa camada — através do Banza.

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

Estes não são futuros ambiciosos. São alcançáveis hoje, com infraestrutura que já existe, para utilizadores que já estão ligados. O Banza é a camada que falta.

### Como é o sucesso

A missão do Banzami está alcançada quando:

- Os pagamentos QR são a **expectativa normal** nas lojas, restaurantes e mercados angolanos — não uma novidade
- Cada app de táxi, plataforma de delivery e site de ecommerce angolano usa o Banza SDK como motor de pagamentos
- A prova de pagamento via WhatsApp desapareceu do comércio angolano
- Uma parte significativa das transacções angolanas do dia-a-dia acontece digitalmente, sem dinheiro físico
- Os programadores angolanos têm uma infraestrutura de pagamentos da qual se orgulham de construir
- A rede Banza tornou-se infraestrutura — parte do modo como Angola funciona

Os modelos de referência para este tipo de transformação existem. O **Pix** do Brasil tornou os pagamentos QR o padrão nacional em menos de três anos. O **UPI** da Índia tornou as transferências instantâneas por identificadores virtuais o padrão para mil milhões de pessoas. Ambos começaram com foco: um país, uma rede, uma promessa clara a cada utilizador.

**O Banza é isso para Angola.**

---

## 5. Uma Manhã em Luanda

*Isto não é uma demonstração de produto. É uma visão da vida ordinária quando o Banza se tiver tornado o padrão.*

---

**7h15.** A Amélia acorda, verifica a sua Banza Wallet no telemóvel. Recebeu 5.000 Kz durante a noite — o seu irmão mais novo pagou-lhe de volta dinheiro que ela lhe tinha emprestado na semana passada. Ele enviou de Benguela às 23h00. Chegou instantaneamente. Não houve transferência bancária. Não houve mensagem de WhatsApp. Ele escreveu `@amelia`, inseriu o valor, confirmou com o seu PIN, e estava feito.

**8h00.** Na cantina da esquina perto do seu apartamento, a Amélia pede café e pão. Aponta o telemóvel para o código QR colado na parede. A app mostra `@cantina.margarida`. Ela escreve `1.500 Kz` e prime o polegar para confirmar. O telemóvel da Margarida acende-se no balcão: *"Recebeu 1.500 Kz de @amelia."* Sem troco. Sem espera. Pequeno-almoço feito.

**8h30.** A Amélia trabalha como designer gráfica freelance. Um cliente devia-lhe pelo logótipo. Ela tinha enviado um link de pagamento na semana passada: `pay.banzami.org/fatura-logo-92`. Esta manhã abre o Banza Business no portátil e vê o estado mudar para **Pago** — o cliente pagou às 8h22. Ela tem o dinheiro. Tem o recibo digital. Não teve de enviar uma única mensagem de WhatsApp para o perseguir.

**12h30.** Almoço com três colegas. O restaurante gera um QR dinâmico para a mesa do grupo — total 18.000 Kz, dividido por quatro. Cada pessoa faz o scan do QR do seu telemóvel e paga 4.500 Kz. A app do restaurante mostra `18.000 Kz recebidos` em segundos após o último scan. Ninguém tira a carteira. Ninguém faz aritmética mental a tentar fazer o troco. A mesa liberta-se em minutos.

**17h00.** A Amélia apanha um táxi para casa. A app mostra a tarifa no fim da corrida: 3.200 Kz. Ela toca em "Pagar." Um toque, confirmação biométrica. O telemóvel do motorista notifica-o. A corrida fecha na app. Nenhum dos dois mencionou dinheiro físico.

**19h30.** A escola da filha enviou um pedido de pagamento esta manhã — propinas mensais de Março: 35.000 Kz. A Amélia abre-o na app Banza. O nome da escola está lá. O valor está lá. A descrição diz "Propinas — Março 2026." Paga com um toque. A escola marca a propina como liquidada. Sem fila. Sem banco. Sem recibo para guardar.

**22h00.** Antes de dormir, a Amélia verifica a sua carteira. Hoje gastou 1.500 Kz (cantina), 4.500 Kz (almoço), 3.200 Kz (táxi), 35.000 Kz (propinas). Recebeu 5.000 Kz (irmão) e 25.000 Kz (cliente). Cada transacção está lá, com timestamp, etiqueta, clara. Sem mistério. Sem Kwanza em falta. Visibilidade total sobre o seu dia.

---

*O dinheiro físico nunca apareceu. Imagens de prova de WhatsApp nunca foram enviadas. Ninguém ficou em fila num banco. Nenhum código de referência foi copiado. Ninguém esperou.*

*Isto é uma terça-feira normal em Luanda. Com o Banza.*

---

## 6. Como o Banza Funciona

### 6.1 A operação fundamental

Tudo no Banza é construído sobre uma operação:

```
Carteira do Consumidor  ────[transferência instantânea no ledger]────>  Carteira do Comerciante
```

Quando um consumidor paga um comerciante, o dinheiro move-se de uma carteira digital para outra. A transferência é atómica, instantânea e registada num ledger financeiro imutável. Não existe estado intermédio, sem período pendente, sem atraso na liquidação. O dinheiro está na carteira do comerciante no momento em que o consumidor confirma o pagamento.

Este é o núcleo da rede Banza. Cada funcionalidade do produto — códigos QR, links de pagamento, pedidos de pagamento, integrações SDK — é uma forma diferente de iniciar esta mesma operação fundamental.

### 6.2 Carteiras

Cada pessoa e cada comerciante no Banza tem uma **carteira digital em Kwanza** — uma Banza Wallet. Detém saldos em AOA, recebe pagamentos e envia transferências. Não é uma conta bancária — é uma conta de pagamento nativa Banza, acessível instantaneamente a partir de qualquer dispositivo.

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

O @banza substitui a necessidade de números de conta bancária, IBANs ou códigos de referência. Para enviar dinheiro a alguém, escreve o seu @banza. Para receber dinheiro, partilha o seu @banza. Os comerciantes imprimem o seu @banza em cartazes físicos ao lado do seu código QR. É simultaneamente uma marca, um endereço e uma identidade de pagamento nativa do Banza.

#### Modelo de unicidade e formato

O @banza é um identificador global único na rede Banza — sem ambiguidade, sem duplicados, sem colisões. As regras de formato garantem que cada handle seja legível por humanos e seguro como endereço financeiro:

| Regra | Detalhe |
|-------|---------|
| Comprimento | 3 a 20 caracteres |
| Carácter inicial | Letra minúscula (`a–z`) obrigatória |
| Caracteres permitidos | Letras minúsculas, dígitos, underscore (`_`) |
| Proibido | Dois underscores consecutivos (`__`), underscore final, caracteres especiais, maiúsculas |
| Unicidade | Global — um handle pertence a exactamente um titular em toda a rede |
| Normalização | `@Carlos` → `carlos`; maiúsculas e espaços são normalizados antes da validação |

Exemplos válidos:

```
@ana
@joao_silva
@cantina99
@mercearia_kilamba
```

Exemplos inválidos:

```
@1abc          ← começa com dígito
@_foo          ← começa com underscore
@foo__bar      ← underscores consecutivos
@foo_          ← underscore final
@héros         ← caractere não-ASCII
@admin         ← reservado (namespace do sistema)
```

#### Namespace reservado

Os seguintes identificadores são reservados pelo sistema e não podem ser registados:

```
admin · banza · banzami · emis · multicaixa · angola · bna
bai · bfa · bic · atlantico · millennium · standard · angolar
support · help · api · system · root · security · compliance
audit · finance · legal · payments · transactions · wallets
```

A lista de reservados é gerida em `core/identity` e aplicada tanto ao nível da aplicação como ao nível da base de dados.

#### Semântica de identidade financeira

O @banza não é apenas um nome de utilizador — é uma **identidade de pagamento**. Cada transferência, pedido de pagamento, QR dinâmico e link de pagamento é resolvido através do @banza do destinatário. O processo de resolução verifica:

1. O handle existe na rede.
2. O titular está **ACTIVO** — contas suspensas ou encerradas não podem receber transferências.
3. O sistema devolve o `consumer_id` que ancora a carteira de destino.

```
Handle fornecido pelo pagador: "@Ana"
         ↓ normalização
Handle normalizado: "ana"
         ↓ consulta ao registo de identidade
ConsumerIdentity { id, handle: "ana", status: ACTIVE }
         ↓ consulta à carteira
ConsumerWallet { available_account_id, currency: AOA }
         ↓ transferência ledger
Carteira de João   −2.000 Kz
Carteira de Ana    +2.000 Kz
```

Nenhum IBAN, nenhum número de conta bancária, nenhum código de referência envolvido.

#### Camada de routing humano

O @banza é a camada de routing humano da rede Banza. Em sistemas bancários tradicionais, o routing é feito por SWIFT, IBANs ou números de conta — sequências opacas que os humanos não conseguem memorizar nem verificar visualmente. O @banza inverte este paradigma: o endereço de pagamento é memorável, verificável e socialmente partilhável.

Este design segue os modelos de sucesso do Pix (CPF/chave aleatória), UPI (VPA como `nome@upi`) e M-Pesa (número de telefone como endereço) — adaptado à realidade angolana com um identificador nativo da rede Banza.

#### Como o routing @banza funciona

O routing de um pagamento por @banza atravessa quatro camadas antes de qualquer dinheiro se mover. Cada camada tem uma responsabilidade precisa e falha explicitamente quando não consegue garantir a sua invariante.

```
INPUT: "@joao"
         │
         ▼
┌─────────────────────────────────────────────────┐
│  CAMADA 1 — IDENTIDADE                          │
│  normalize("@joao") → "joao"                    │
│  validate_handle("joao") → OK                   │
│  Registo de identidade: handle → consumer_id    │
│  Verificação: consumer.status == ACTIVE         │
│  Falha: HANDLE_NOT_FOUND / SUSPENDED / CLOSED   │
└───────────────────────┬─────────────────────────┘
                        │ consumer_id confirmado
                        ▼
┌─────────────────────────────────────────────────┐
│  CAMADA 2 — ROUTING                             │
│  consumer_id + currency → wallet_id             │
│  Verificação: wallet.status ∈ {ACTIVE, LOCKED}  │
│  routing_status = ROUTABLE | LOCKED             │
│  Falha: WALLET_CANNOT_RECEIVE                   │
└───────────────────────┬─────────────────────────┘
                        │ WalletRoutingDestination
                        ▼
┌─────────────────────────────────────────────────┐
│  CAMADA 3 — CARTEIRA                            │
│  Reserva de fundos na carteira de origem        │
│  available_account → reserved_account (origem)  │
│  Falha: INSUFFICIENT_FUNDS                      │
└───────────────────────┬─────────────────────────┘
                        │ reserva confirmada
                        ▼
┌─────────────────────────────────────────────────┐
│  CAMADA 4 — LEDGER                              │
│  Posting atómico de dupla entrada:              │
│  DR reserved_account (origem)                   │
│  CR available_account (destino)                 │
│  Imutável, reconciliável, auditável             │
└─────────────────────────────────────────────────┘
                        │
                        ▼
              TRANSFERÊNCIA COMPLETA
```

**Estados de routing e o seu significado:**

| Estado | Descrição | Pode receber? |
|--------|-----------|:---:|
| `ROUTABLE` | Identidade e carteira activas | Sim |
| `LOCKED` | Carteira bloqueada (tentativas PIN excedidas) — pode receber, não pode enviar | Sim |
| `SUSPENDED` | Identidade ou carteira suspensa por compliance | Não |
| `CLOSED` | Carteira permanentemente encerrada | Não |
| `PENDING_KYC` | KYC incompleto — recepção pode estar restrita | Condicional |
| `UNREACHABLE` | Estado de onboarding sem footprint no ledger | Não |

**Por que o routing tem de ser determinístico num sistema financeiro:**

Um pagamento por @banza não é uma pesquisa de texto — é uma operação financeira com consequências imediatas. A ambiguidade é inaceitável:

- Ambiguidade no destinatário → dinheiro enviado para a pessoa errada
- Estado stale → pagamento aceite por uma carteira encerrada
- Resultado não-determinístico → dois pagamentos simultâneos chegam a destinos diferentes
- Bypass de estado → dinheiro entra numa conta suspensa por AML

O pipeline de resolução implementa verificações sequenciais com falha imediata em cada etapa. A mesma entrada normalizada produz sempre o mesmo resultado enquanto o estado da base de dados não mudar. Esta propriedade é necessária para que transferências P2P, pagamentos QR e links de pagamento possam reutilizar a mesma primitiva de routing com garantias idênticas.

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

O Banza integra-se com o **EMIS** (Empresa Interbancária de Serviços) — a infraestrutura de pagamentos interbancários de Angola — através da infraestrutura do Banzami, para permitir que o dinheiro flua entre carteiras Banza e o sistema bancário angolano.

O EMIS é o caminho. O Banza é o produto. O Banzami constrói a ponte.

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

O Banza não substitui o sistema bancário. Constrói a camada de comércio acima dele — com a infraestrutura do Banzami.

---

### 6.8 Como o Dinheiro Entra na Carteira Banza

O Banza é uma rede de pagamentos de circuito fechado. Dentro da rede, todas as transferências são liquidações instantâneas de carteira-para-carteira — movimentos contabilísticos entre contas no ledger do Banzami. Para que isso seja possível, é necessário que o dinheiro entre na rede através de um canal financeiro externo validado.

Este processo chama-se **carregamento de carteira** (*wallet funding*) e é a ponte entre o sistema bancário angolano e a carteira digital do utilizador.

#### A distinção fundamental

| Dentro do Banza | Fora do Banza |
|-----------------|---------------|
| Transferências ledger instantâneas | Movimentos bancários com confirmação assíncrona |
| Sem dependência de terceiros | Dependência de EMIS, bancos, Multicaixa Express |
| Liquidação em milissegundos | Liquidação sujeita a confirmação do provedor externo |
| Gratuito para o utilizador | Sujeito a taxas e regras do banco/EMIS |
| Controlado pelo Banzami | Regulado pelo BNA e sistema bancário angolano |

O Banzami não cria dinheiro nem substitui bancos. Cada Kwanza na rede Banza corresponde a um Kwanza real confirmado por um parceiro financeiro externo.

#### Como o utilizador carrega a carteira

```
[Conta Bancária do Utilizador]
           |
           | transferência / Multicaixa Express
           v
[EMIS / Banco / Multicaixa Express]
           |
           | confirmação de liquidação
           v
[Bridge de Adquirência do Banzami]
           |
           | validação de callback (HMAC)
           | verificação de idempotência
           | reconciliação
           | verificação de risco
           v
[Ledger do Banza]
           |
           | lançamento de dupla entrada:
           |   DR  conta de trânsito / liquidação externa
           |   CR  conta disponível da carteira do utilizador
           v
[Carteira Banza do Utilizador]
           |
           v
  pronto para pagar por QR ou @banza
```

O processo do ponto de vista do utilizador:

1. O utilizador abre a app Banza e escolhe **"Carregar carteira"**
2. Selecciona o banco ou Multicaixa Express
3. Confirma o valor e autoriza externamente
4. O EMIS ou o banco confirma a liquidação ao Banzami
5. O Banzami valida o callback, reconcilia e lança o crédito no ledger
6. A carteira reflecte o novo saldo instantaneamente
7. O utilizador pode pagar por QR ou transferir por @banza imediatamente

Nenhum crédito é definitivo sem confirmação verificada do provedor externo. Capturas de ecrã de comprovativo, confirmações manuais ou mensagens WhatsApp nunca são aceites como prova de pagamento.

#### Pagamento interno: utilizador para comerciante

Uma vez que o dinheiro está dentro da rede Banza, qualquer pagamento subsequente é uma transferência ledger directa — sem envolvimento de bancos ou EMIS:

```
[Carteira Banza do Consumidor]
           |
           | transferência ledger atómica:
           |   DR  conta disponível do consumidor
           |   CR  conta disponível do comerciante
           v
[Carteira Banza do Comerciante]
```

Este movimento ocorre em milissegundos. O comerciante vê a confirmação instantaneamente. Não há períodos de espera, sem aprovações manuais, sem dependência externa.

#### Levantamento do comerciante: de carteira para banco

Quando o comerciante quer transferir o saldo da sua carteira Banza para a conta bancária, o fluxo inverte-se — volta a atravessar os carris bancários externos:

```
[Carteira Banza do Comerciante]
           |
           | pedido de levantamento / payout
           v
[Motor de Liquidação do Banzami]
           |
           | lançamento de dupla entrada:
           |   DR  conta disponível do comerciante
           |   CR  conta de liquidação / payout bancário
           |
           | instrução via carris bancários / EMIS
           v
[Conta Bancária do Comerciante]
```

O crédito na conta bancária está sujeito aos prazos e regras do banco parceiro. O saldo da carteira Banza é debitado imediatamente no momento do pedido, garantindo consistência interna.

#### Cenários reais

**João carrega 5.000 Kz**
João abre a app Banza, selecciona Multicaixa Express, autoriza o débito na sua conta bancária. O Banzami recebe confirmação do EMIS, valida a assinatura do callback, lança o crédito no ledger. O saldo de João passa de 0 para 5.000 Kz. João pode imediatamente pagar o táxi por QR.

**João paga uma cantina**
João faz o scan do QR estático da cantina. Confirma 800 Kz. O Banzami debita a carteira de João e credita a carteira da cantina atomicamente no ledger. A cantina recebe notificação instantânea. Nenhum banco foi envolvido nesta transacção.

**Ana recebe dinheiro de João por @banza**
João envia 2.000 Kz para @ana. O Banzami resolve o handle, verifica ambas as carteiras, executa a transferência ledger. Ana recebe o dinheiro imediatamente. Não são necessários dados bancários.

**Uma app de táxi cobra uma viagem**
A app integra o Banza SDK. No fim da viagem, a app instrui o SDK a debitar a carteira do passageiro e creditar a carteira do operador. A liquidação ocorre dentro do Banza. O motorista não precisa de terminal.

**Um comerciante levanta o saldo do dia**
O comerciante abre o Banza Business, pede um payout de 50.000 Kz. O Banzami debita a carteira, inicia a instrução de transferência bancária via EMIS. O dinheiro chega à conta bancária do comerciante no prazo definido pelo banco parceiro.

**Uma escola recebe propinas**
Os pais digitalizam o QR da escola ou recebem um link de pagamento. Cada pagamento credita a carteira Banza da escola instantaneamente. A escola levanta para a conta bancária semanalmente.

**Uma app de doações usa o Banza SDK**
A app integra o Banza SDK para receber doações. O doador paga por QR ou link. O Banzami processa, credita a carteira da organização, emite evento webhook para a app confirmar a doação. Nenhuma integração bancária directa foi necessária.

#### Garantias de integridade em cada carregamento

Cada operação de carregamento de carteira deve satisfazer:

| Garantia | Mecanismo |
|----------|-----------|
| Confirmação de provedor | Callback assinado com HMAC do EMIS ou banco |
| Idempotência | Chave de idempotência única por transacção; replay sem efeito |
| Lançamento de dupla entrada | DR conta de trânsito / CR conta disponível — sempre equilibrado |
| Reconciliação | Cada crédito interno reconciliável contra confirmação externa |
| Verificação de risco | Limites de carregamento, padrões de fraude, KYC |
| Trilho de auditoria | Registo imutável de cada lançamento com timestamp e origem |
| Isolamento sandbox | Créditos de sandbox nunca tocam contas de liquidação reais |

Nenhum destes passos é opcional. A ausência de qualquer garantia invalida o lançamento.

#### Canais de carregamento suportados e planeados

| Canal | Estado | Notas |
|-------|--------|-------|
| Multicaixa Express | Planeado | Canal primário — penetração nacional |
| Transferência bancária (EMIS) | Planeado | Bancos parceiros via rede interbancária |
| Depósito bancário directo | Planeado | Referência de pagamento + reconciliação automática |
| Rede de agentes / cash-in | Futuro | Parceiros regulados para áreas sem cobertura bancária |
| Cartão internacional (Visa/MC) | Futuro | Apenas para carregamento de carteira; nunca como rail principal |

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
| **Reembolsos** | Emite reembolsos parciais ou totais a partir do Banza Business ou da API |
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

**Com o Banza:**  
A corrida termina. A app mostra a tarifa. O passageiro vê um ecrã de confirmação. Um toque — biométrico ou PIN. A tarifa transfere-se instantaneamente da carteira do passageiro para a do motorista. A plataforma recebe um webhook. A corrida fecha automaticamente.

```
ANTES: Corrida termina → motorista pede dinheiro → passageiro procura troco → sem registo digital
DEPOIS: Corrida termina → app mostra tarifa → passageiro toca "Pagar" → liquidação instantânea
```

### 8.2 Cantinas e pequenos comerciantes

**O problema hoje:**  
Uma dona de cantina quer aceitar pagamentos digitais. Um terminal POS bancário requer um acordo bancário formal e cobra por transacção. A maioria dos pequenos comerciantes não se qualifica. A única alternativa é aceitar transferências bancárias e aguardar screenshots de WhatsApp — alguns dos quais são fabricados.

**Com o Banza:**  
A dona regista-se no Banza, cria uma carteira e descarrega o seu código QR. Imprime-o em papel e coloca-o no balcão. Quando um cliente faz o scan e paga, o telemóvel da dona mostra "Recebeu 2.500 Kz." Sem terminal. Sem taxa mensal. Sem espera. Sem screenshots.

```
ANTES: Cliente paga → envia screenshot WhatsApp → dona verifica manualmente
DEPOIS: Cliente faz scan do QR → paga instantaneamente → telemóvel da dona confirma em tempo real
```

### 8.3 Ecommerce e lojas online

**O problema hoje:**  
Um site de ecommerce angolano não tem forma fiável de cobrar pagamentos online em Kwanza. Os processadores internacionais não suportam AOA. Os clientes são redirecionados para portais bancários externos. O abandono do checkout é elevado.

**Com o Banza:**  
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

**Com o Banza:**  
A plataforma integra Banza Pay Links ou pedidos de pagamento Banza. Um apoiante toca em "Apoiar com 1.000 Kz." A doação transfere-se instantaneamente. O criador vê-a em tempo real. Todo o fluxo acontece dentro da app.

```
ANTES: Apoiante envia transferência → manda prova por email → plataforma aguarda
DEPOIS: Apoiante toca "Apoiar" → transferência instantânea → criador vê imediatamente
```

### 8.5 Apps de delivery e marketplaces

**O problema hoje:**  
Uma app de entrega de comida não consegue fechar o ciclo de pagamento na app. O pagamento na entrega cria riscos de segurança para os motoristas, risco de fraude para os comerciantes e UX quebrada para os consumidores.

**Com o Banza:**  
A app de delivery integra o SDK Flutter. Quando o motorista marca uma encomenda como entregue, a app do consumidor solicita o pagamento. Um toque — liquidação instantânea. O restaurante e o motorista vêem ambos. O dinheiro físico desaparece do fluxo por completo.

### 8.6 Escolas e instituições

**O problema hoje:**  
Uma escola cobra propinas via transferência bancária. Os encarregados fazem fila nos bancos. Os recibos são entregues manualmente. A escola não tem visão em tempo real dos saldos em dívida.

**Com o Banza:**  
A escola emite pedidos de pagamento para cada aluno. Os encarregados recebem uma notificação, vêem o nome do aluno e o valor, e pagam com um toque. O Banza Business mostra pagos e em dívida em tempo real.

```
ANTES: Encarregado faz fila no banco → transferência manual → entrega recibo → escola processa manualmente
DEPOIS: Encarregado toca "Pagar" → liquidação instantânea → escola vê em tempo real
```

### 8.7 Freelancers e profissionais

**O problema hoje:**  
Um designer freelance factura um cliente. O cliente faz uma transferência bancária. O freelancer aguarda horas pela confirmação. Não existe registo de pagamento estruturado.

**Com o Banza:**  
O freelancer gera um link de pagamento ou pedido. O cliente clica, confirma e a carteira é creditada instantaneamente. Ambas as partes têm um recibo digital com timestamp.

### 8.8 Restaurantes e cafés

**O problema hoje:**  
Um jantar em grupo termina. A mesa tenta dividir a conta via transferências bancárias individuais para a conta do empregado. O empregado tem de reconciliar múltiplos pagamentos manualmente antes de a mesa poder sair.

**Com o Banza:**  
O restaurante gera um QR dinâmico para o total da mesa. Os clientes fazem o scan e pagam a sua parte. Cada pagamento é confirmado instantaneamente. Quando o valor total é atingido, a mesa está feita.

---

## 9. Ecossistema de Pagamentos QR

Os códigos QR não são uma funcionalidade no Banza — são a **principal superfície de pagamento**.

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

O Banza é fundamentalmente diferente.

Cada titular de conta possui uma **Banza Wallet em Kwanza**. Quando um consumidor paga um comerciante, o dinheiro move-se directamente de uma carteira para outra numa única operação de ledger atómica. Sem rede de cartões. Sem autorização estrangeira. A liquidação não é diferida — acontece na mesma transacção.

### 10.2 O caminho de pagamento principal

```
┌───────────────────┐                      ┌───────────────────┐
│   Consumidor      │                      │   Comerciante     │
│   Carteira        │ --[transferência]--> │   Carteira        │
│   @joao           │      no ledger       │   @cantina.luanda │
│   Saldo: 15 Kz    │                      │   Saldo: 0 Kz     │
└───────────────────┘                      └───────────────────┘
         ↓ Após pagamento                           ↓
    Saldo: 12,5 Kz                          Saldo: 2,5 Kz
```

Esta é a imagem completa. Sem rede de cartões. Sem processador intermediário. Uma operação de ledger. Ambos os saldos actualizam instantânea e atomicamente.

### 10.3 O Banza NÃO é card-first

| Modelo de pagamento | Como funciona | Banza? |
|---------------------|--------------|--------|
| Stripe / Terminal POS | Tokenização do cartão → rede de cartões → autorização do emissor → liquidação em dias | ✗ |
| Transferência bancária | IBAN + referência → mensagens interbancárias → liquidação em horas/dias | ✗ |
| Mobile money (sem rede local) | Conta flutuante estrangeira → liquidação adiada | ✗ |
| **Banza** | **Carteira → transferência no ledger → carteira — instantâneo, local, em Kwanza** | **✓** |

Os cartões não existem na rede principal Banza. Numa fase futura, o carregamento por cartão permitirá aos consumidores financiar a sua Banza Wallet a partir de um cartão de débito — mas esse cartão é usado para adicionar fundos, não para fazer pagamentos. Cada pagamento, independentemente de como a carteira foi financiada, é uma transferência de carteira-para-carteira.

### 10.4 Redes locais, dinheiro local

A liquidação do Banza corre em infraestrutura angolana — EMIS e o sistema bancário angolano. Isto não é uma limitação. É uma vantagem deliberada.

Uma rede de pagamentos construída em infraestrutura de cartões estrangeiros depende de aprovação estrangeira, preços estrangeiros e disponibilidade estrangeira. A liquidação do Banza é angolana, em Kwanza, em redes que Angola controla. Funciona quando as redes internacionais não funcionam. Cobra em AOA sem conversão de moeda. Opera dentro do quadro regulatório do Banco Nacional de Angola.

Infraestrutura local para uma economia local.

### 10.5 Três expressões da mesma identidade

```
Carteira ↔ Carteira   a identidade financeira — detém e transfere Kwanza
QR ↔ QR               a identidade física — como paga presencialmente
@banza ↔ @banza        a identidade digital — como endereça pagamentos em qualquer lugar
```

Estas três camadas são expressões da mesma conta subjacente. Juntas, tornam o Banza utilizável em todos os contextos: comércio físico, comércio digital, pagamentos remotos e transferências pessoa-a-pessoa.

---

## 11. Banza para Comerciantes

### 11.1 Primeiros passos

Um comerciante regista-se no Banza, fornece informações básicas do negócio e recebe uma Banza Wallet de comerciante e um @banza em minutos. Um código QR estático está pronto para download imediatamente.

Sem terminal POS necessário. Sem acordo de cartão necessário. Sem volume mensal mínimo. A verificação KYC é necessária antes da liquidação em directo, mas o processo é totalmente digital.

O tempo entre "quero aceitar pagamentos digitais" e "estou a aceitar pagamentos digitais" deve ser medido em minutos, não semanas.

### 11.2 Banza Business

O Banza Business é a plataforma operacional para comerciantes no ecossistema Banza. Não é uma aplicação — é um sistema completo com duas interfaces complementares que servem o mesmo negócio em contextos diferentes.

```
             Banza Business
         /                      \
┌──────────────────┐   ┌──────────────────┐
│  Interface móvel │   │   Interface web  │
├──────────────────┤   ├──────────────────┤
│  operação diária │   │  administração   │
│  QR              │   │  analytics       │
│  notificações    │   │  equipa / SDK    │
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

A interface web é a superfície administrativa avançada do Banza Business — não é um produto separado. É o centro de controlo do mesmo negócio, acessível via navegador.

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
│  Interface móvel    │  <- operação diária, QR, saldo
│  Interface web      │  <- analytics, gestão avançada
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

Os saldos da carteira são transferidos para uma conta bancária angolana a pedido — a partir da interface móvel, da interface web ou via API. O Banza inicia a transferência imediatamente via EMIS e acompanha-a com total transparência. Sem pedidos manuais. Sem prazos opacos.

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

O Banza é construído para programadores. O caminho de integração recomendado é sempre através de um Banza SDK oficial — nunca chamadas HTTP directas, nunca clientes artesanais, nunca soluções improvisadas.

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

Cada evento significativo no Banza aciona uma entrega de webhook assinado. As aplicações subscrevem tipos de eventos e recebem-nos em segundos após a acção desencadeadora.

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

O Banza é para cada angolano com um smartphone. Não é necessária uma conta bancária tradicional para começar. Não é necessário conhecimento técnico. Um telemóvel. Uma Banza Wallet. Tudo o resto segue-se.

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

Abre o Banza. Toca em "Pagar."
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

Abre o Banza. Toca em "Enviar."
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

### 13.7 Como funciona o histórico da carteira

O histórico de actividade da carteira não é uma lista de notificações. É a **projecção legível de eventos financeiros imutáveis** — o registo permanente e cronológico de tudo o que aconteceu à sua carteira.

#### O princípio fundamental

Cada item visível no seu histórico corresponde a exatamente um evento real registado no ledger financeiro. Não há entradas sem fundamento. Não há pagamentos que desaparecem. Não há duplicados. O que o ledger registou, o histórico mostra — na mesma ordem, com os mesmos valores, permanentemente.

```
Evento no ledger
     ↓
Projecção de actividade
     ↓
Feed do consumidor
```

#### Por que o histórico tem de ser determinístico

Um extracto bancário em papel tem uma propriedade que as pessoas assumem como garantida: a mesma transacção aparece sempre no mesmo lugar, com o mesmo valor, na mesma ordem. Se o extracto for diferente a cada vez que o abrir, o banco quebrou a confiança fundamental.

O Banza mantém a mesma garantia:

- **Imutável** — uma vez registado, um evento não se altera. Não é possível editar o valor de uma transferência passada.
- **Ordenação determinística** — os eventos aparecem sempre pela mesma ordem: mais recente primeiro, com ordenação estável por identificador único em caso de timestamps idênticos.
- **Sem duplicados entre páginas** — a paginação usa cursores baseados na posição exacta no tempo, não em offsets. Uma transacção nunca aparece duas vezes.
- **Sem omissões** — cada transferência completada e cada carregamento liquidado é visível. Não existe transferência "invisível".

#### Tipos de actividade

| Tipo | Direcção | Quando aparece |
|------|----------|----------------|
| `P2P_SENT` | SAÍDA | Enviou dinheiro a outro @banza |
| `P2P_RECEIVED` | ENTRADA | Recebeu dinheiro de outro @banza |
| `WALLET_FUNDED` | ENTRADA | Carregou a carteira via Multicaixa Express |
| `WALLET_REVERSED` | SAÍDA | Um carregamento anterior foi revertido |

A direcção (`ENTRADA` / `SAÍDA`) é sempre calculada pelo sistema a partir da sua perspectiva. A app nunca precisa de inferir quem pagou a quem.

#### Exemplos reais

**"Enviaste 2.000 Kz para @ana"**
```
Tipo:         P2P_SENT
Direcção:     SAÍDA
Montante:     2.000 Kz
Contraparte:  @ana
Nota:         almoço
Estado:       COMPLETO
Data:         21 Maio 2026, 14h00
```

O que aconteceu no ledger:
```
DR  carteira_@joao:disponível   2.000 Kz  (deve menos ao João)
CR  carteira_@ana:disponível    2.000 Kz  (deve mais à Ana)
```

**"Recebeste 5.000 Kz de @joao"**
```
Tipo:         P2P_RECEIVED
Direcção:     ENTRADA
Montante:     5.000 Kz
Contraparte:  @joao
Nota:         —
Estado:       COMPLETO
Data:         21 Maio 2026, 10h00
```

**"Carteira carregada com 10.000 Kz"**
```
Tipo:         WALLET_FUNDED
Direcção:     ENTRADA
Montante:     10.000 Kz
Contraparte:  —
Estado:       COMPLETO
Data:         20 Maio 2026, 09h05
```

#### A API de actividade

```
GET /v1/me/activity
Authorization: Bearer {token}

Parâmetros opcionais:
  ?limit=20          (1–100, predefinição: 20)
  ?cursor=...        (token opaco da resposta anterior)
  ?type=P2P_SENT     (filtro por tipo)
  ?direction=OUTGOING (filtro por direcção)
```

Resposta:
```json
{
  "items": [
    {
      "activity_id": "a1b2c3d4-...",
      "item_type": "P2P_SENT",
      "direction": "OUTGOING",
      "amount_minor": 200000,
      "currency": "AOA",
      "status": "COMPLETED",
      "created_at": "2026-05-21T14:00:00Z",
      "completed_at": "2026-05-21T14:00:00Z",
      "counterparty_handle": "@ana",
      "counterparty_display_name": "Ana Silva",
      "note": "almoço",
      "transfer_id": "a1b2c3d4-..."
    }
  ],
  "next_cursor": "MjAyNi0w...",
  "has_more": true
}
```

#### Garantias do histórico

Cada item de actividade visível:

1. Tem um `activity_id` único e estável
2. Mapeia para um registo real na base de dados financeira
3. Tem direcção calculada pelo servidor — nunca pelo cliente
4. Preserva a nota/memo original
5. Nunca expõe identificadores internos do ledger

---

### 13.8 Por que os consumidores vão adoptar o Banza

A questão não é se os pagamentos digitais são melhores. São objectivamente. A questão é se o Banza é melhor do que as alternativas específicas que os angolanos usam hoje.

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

### 13.9 Sistema Visual da App Banza

O Banza é uma aplicação financeira. A confiança começa na aparência.

A interface do consumidor segue um sistema visual dedicado — construído para transmitir segurança, familiaridade e poder de pagamento instantâneo. Este sistema é a referência canónica para qualquer trabalho de UI no Banza.

![Banza App Design System — mockup oficial das 16 ecrãs do consumidor](/images/banza/banza-app-design-system-mockup.png)

#### O mockup oficial é a referência canónica

O mockup acima documenta as 16 ecrãs aprovadas da app Banza. Qualquer trabalho de UI na app do consumidor — novas funcionalidades, iterações, revisões de design — deve alinhar com este sistema visual. Não pode divergir sem revisão explícita.

#### Ecrãs oficiais

| # | Ecrã |
|---|------|
| 1 | Splash |
| 2 | Onboarding / Welcome |
| 3 | Criar PIN |
| 4 | Home |
| 5 | Enviar dinheiro |
| 6 | Confirmar transferência |
| 7 | Estado de envio (animação) |
| 8 | Recibo |
| 9 | Receber com QR |
| 10 | Receber com link |
| 11 | Histórico |
| 12 | Filtrar histórico |
| 13 | Perfil |
| 14 | Segurança |
| 15 | Notificações |
| 16 | Ajuda & Suporte |

#### Regra da ecrã Home — ordem de acção obrigatória

Na ecrã Home, a ordem das acções é:

1. **QR Code** — primeira, sempre
2. **Enviar**
3. **Receber**

O QR Code é a acção primária porque o Banza é QR-native. O QR é o modelo de interacção principal do ecossistema. Esta ordem não é negociável e reflecte a identidade do produto.

Não usar: Enviar / Receber / QR Code.

#### Tokens visuais oficiais

**Paleta de cores:**

| Nome | Hex |
|------|-----|
| Primary Space Cherry | `#990011` |
| Cherry Highlight | `#C21A2C` |
| Mid Wine | `#7A000D` |
| Deep Shadow | `#5E000A` |
| Soft White | `#FCF6F5` |
| Soft Neutral Shadow | `#D8D0CF` |
| Near Black | `#1A1A1A` |

**Gradiente primário (cartão de identidade, superfícies cherry):**

```
linear-gradient(145deg, #C21A2C 0%, #990011 38%, #7A000D 72%, #5E000A 100%)
```

**Gradiente de superfície clara (fundo de ecrã):**

```
linear-gradient(to bottom, #FFFFFF 0%, #FCF6F5 55%, #D8D0CF 100%)
```

#### Princípios visuais

- **Geometria arredondada** — raios de 16/20/24/28 px; sem superfícies rectangulares afiadas
- **Profundidade física suave** — sombras flutuantes, não planas
- **Cards flutuantes** — o conteúdo financeiro vive em cartões elevados
- **Espaçamento generoso** — hierarquia clara, sem compressão
- **Alta legibilidade** — contraste financeiro, não decorativo
- **Hierarquia financeira calma** — o dinheiro é o protagonista, não a interface
- **Premium mas contido** — refinamento sem ostentação
- **Identidade QR-native** — QR é sempre a acção primária visível
- **Sem aspecto Flutter genérico** — sem Material Design padrão; visual proprietário
- **Sem vermelho inconsistente** — toda a superfície vermelha usa os tokens oficiais acima
- **Sem branding antigo** — a marca Banzami não aparece na interface do consumidor

---

## 14. O Motor de Crescimento do Banza

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
│         Mais consumidores descobrem o Banza dentro de apps       │
│                    │                                             │
│                    v                                             │
│         Mais circulação de carteiras                             │
│                    │                                             │
│                    v                                             │
│         Menos dependência de dinheiro físico                     │
│                    │                                             │
│                    v                                             │
│         O Banza torna-se o padrão                                │
│                    │                                             │
│                    └──────────────────> (ciclo acelera)          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Os três motores de crescimento

**Motor 1 — Densidade QR dos comerciantes**

Cada comerciante que se junta ao Banza é uma nova razão para um consumidor obter uma Banza Wallet. Uma cantina, uma farmácia, um vendedor de mercado, um restaurante — cada um é um nó na rede. À medida que a densidade de comerciantes aumenta num bairro ou cidade, o atrito para um consumidor ficar sem Banza Wallet aumenta. Eventualmente a questão não é "devo obter o Banza?" mas "por que é que ainda não tenho o Banza?"

**Motor 2 — Integrações SDK**

Cada app angolana que integra o Banza SDK traz toda a sua base de utilizadores para contacto com o Banza Wallet. Uma app de táxi com 50.000 utilizadores activos cria mais activações de carteiras do que qualquer campanha de marketing. Uma plataforma de delivery, um serviço de streaming, uma app de jogos — cada integração é um multiplicador na adopção pelo consumidor, sem custo de aquisição adicional.

**Motor 3 — Circulação de carteiras**

À medida que mais consumidores têm carteiras e mais comerciantes aceitam pagamentos, o dinheiro começa a circular dentro da rede Banza. Um consumidor paga uma cantina. A cantina paga um fornecedor. O fornecedor paga pessoal. O pessoal paga comerciantes. Cada Kwanza que fica na rede em vez de sair como levantamento em dinheiro aumenta a liquidez para todos e reduz o atrito de sair.

### Por que densidade antes de expansão

O motor não gira pela geografia. Gira dentro de um mercado.

Uma rede Banza com 10.000 comerciantes angolanos e 500.000 carteiras angolanas é dramaticamente mais valiosa para cada participante do que uma presença Banza em 10 países com 100 comerciantes cada. O efeito de rede requer concentração. É por isso que Angola vem primeiro — não porque outros mercados são sem importância, mas porque o motor deve estar a girar fortemente antes que a expansão faça sentido.

---

## 15. Ecossistema de Negócio Banzami

O Banzami não é uma empresa de produto único — é um ecossistema de participantes interligados, todos conectados pelo produto Banza, cada um beneficiando do crescimento da rede.

### 15.1 Participantes da rede

```
┌─────────────────────────────────────────────────────────────┐
│                       REDE BANZA                            │
│                                                             │
│  ┌──────────────┐    paga    ┌──────────────────────────┐   │
│  │  Consumidores│───────────>│  Comerciantes            │   │
│  │  (carteiras) │<───────────│  (Banza Business)        │   │
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

Os bancos angolanos não são concorrentes do Banza. São parceiros essenciais do Banzami.

- **Os bancos fornecem:** contas licenciadas, infraestrutura de liquidação, conformidade regulatória e os saldos em Kwanza que financiam as Banza Wallets.
- **O Banza fornece:** UX de pagamento instantâneo, camada de comércio QR, Banza SDKs para programadores, ferramentas para comerciantes e o efeito de rede que torna os pagamentos digitais habituais.

Os bancos ganham um produto de comércio moderno sobre a sua infraestrutura existente sem o construírem eles próprios. O Banzami ganha acesso à infraestrutura regulada que não pode possuir directamente. Esta é uma parceria com incentivos alinhados — não um conflito.

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

O Banza lida com dinheiro real. A segurança e a integridade financeira não são funcionalidades — são a fundação sobre a qual tudo o resto é construído.

### 16.1 Ledger de dupla entrada

Cada movimento monetário no Banza é registado como uma **entrada de ledger de dupla entrada** imutável — o mesmo princípio contabilístico usado por bancos e instituições financeiras há séculos.

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

O Banza atribui uma chave de idempotência única a cada operação. Se a mesma chave for submetida novamente, o resultado original é devolvido imediatamente, sem criar uma nova transacção.

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

O Banza é construído como **infraestrutura financeira à escala nacional**, pelo Banzami. Não um MVP de startup. Não uma prova de conceito. Infraestrutura concebida para operar durante décadas.

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

O Banza é um **monólito modular** — uma unidade implementável com módulos internos fortemente isolados, fronteiras de domínio claras e interfaces internas explícitas.

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

### 17.8 Arquitectura de Carregamento de Carteira

O carregamento de carteira é a fronteira mais crítica do ecossistema Banza: o ponto onde o dinheiro real do sistema bancário angolano entra na rede de ledger imutável do Banzami. Esta secção documenta a arquitectura interna que torna essa transição segura, auditável e idempotente.

#### O problema fundamental

O sistema bancário angolano — EMIS, Multicaixa Express, transferências interbancárias — é **assíncrono e eventualmente consistente**. Um pagamento iniciado pode ser confirmado segundos, minutos ou horas depois. Os callbacks podem chegar em duplicado. Uma transacção confirmada pode ser revertida pelo banco dias mais tarde.

O ledger interno do Banzami é **síncrono e fortemente consistente**. Cada lançamento é atómico, imutável e reconciliável. Nenhum crédito pode existir sem um lançamento de dupla entrada balanceado e auditável.

A arquitectura de carregamento é a ponte entre estes dois mundos.

#### Princípios de design

1. **Callbacks externos nunca creditam directamente.** Nenhum webhook ou resposta da API de um banco cria um lançamento no ledger. Todos os eventos externos passam por reconciliação.
2. **Idempotência em todas as camadas.** Callbacks duplicados, retentativas e replays nunca produzem créditos duplicados.
3. **Estados de transição explícitos.** Cada sessão de carregamento percorre uma máquina de estados auditável. Transições inválidas são rejeitadas.
4. **Ligação obrigatória ao ledger.** Uma sessão só é considerada liquidada quando um `ledger_posting_id` está registado. Sem lançamento → sem crédito.
5. **Imutabilidade total.** Reversões não apagam o histórico — criam um segundo lançamento que anula o primeiro. Ambos ficam para sempre.

#### Máquina de estados

```
           ┌─────────────────────────────────────────────┐
           │            FUNDING SESSION                  │
           └─────────────────────────────────────────────┘

  [criação]
      │
      ▼
PENDING_PAYMENT ──────────────────────────────► EXPIRED
      │                                         (TTL expirado sem pagamento)
      │ consumidor paga no banco / ATM
      ▼
PENDING_PROVIDER_CONFIRMATION ───────────────► EXPIRED
      │                                         (TTL expirado após pagamento)
      │ callback do EMIS / banco recebido
      ▼
RECONCILING ─────────────────────────────────► FAILED
      │        │                               (falha irrecuperável)
      │        └──────────────────────────────► PENDING_PROVIDER_CONFIRMATION
      │                                         (falha transitória — retry)
      │ lançamento ledger criado
      ▼
  SETTLED ─────────────────────────────────────► REVERSED
      (ledger_posting_id registado)               (reversão bancária —
                                                   segundo lançamento criado)
```

**Transições válidas:**

| De | Para | Condição |
|----|------|----------|
| PENDING_PAYMENT | PENDING_PROVIDER_CONFIRMATION | Consumidor iniciou pagamento |
| PENDING_PAYMENT | EXPIRED | TTL expirado |
| PENDING_PAYMENT | FAILED | Falha no provedor |
| PENDING_PROVIDER_CONFIRMATION | RECONCILING | Callback recebido |
| PENDING_PROVIDER_CONFIRMATION | EXPIRED | TTL expirado |
| RECONCILING | SETTLED | Lançamento ledger criado com sucesso |
| RECONCILING | FAILED | Falha irrecuperável na validação |
| RECONCILING | PENDING_PROVIDER_CONFIRMATION | Falha transitória, retentativa |
| SETTLED | REVERSED | Reversão bancária recebida |

Todas as outras transições são rejeitadas com erro `InvalidTransition`.

#### Componentes da arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                    EMIS / BANCO ANGOLANO                        │
│             (confirmação assíncrona — eventualmente)            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ callback HTTPS + HMAC
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                 ADAPTADOR DE PROVEDOR (Go)                      │
│  • verifica assinatura HMAC                                     │
│  • extrai provider_event_id único                               │
│  • encaminha para FundingEngine                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│               provider_callbacks (PostgreSQL)                   │
│  • UNIQUE(provider, provider_event_id) — idempotência ao nível  │
│    dos dados: INSERT duplicado falha com constraint violation    │
│  • registo imutável de cada callback recebido                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                 FUNDING ENGINE (Rust)                           │
│  • valida transição de estado                                   │
│  • avança sessão para RECONCILING                               │
│  • despoleta job de reconciliação                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              MOTOR DE RECONCILIAÇÃO (Rust)                      │
│  • valida montante e moeda contra dados da sessão               │
│  • cria lançamento de dupla entrada via LedgerEngine:           │
│      DR conta de trânsito (ASSET)                               │
│      CR conta disponível do consumidor (LIABILITY)              │
│  • regista em reconciliation_attempts (imutável)                │
│  • avança sessão para SETTLED + ledger_posting_id               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LEDGER DO BANZA                              │
│  • lançamento atómico e imutável                                │
│  • saldo do consumidor actualizado instantaneamente             │
│  • trilho de auditoria completo e reconciliável                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Schema de base de dados

**`consumer_deposits`** — máquina de estados da sessão de carregamento

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | Identificador único da sessão |
| `consumer_id` | UUID | Consumidor que inicia o carregamento |
| `wallet_id` | UUID | Carteira que recebe os fundos |
| `provider` | VARCHAR | `EMIS` \| `SIMULATED` |
| `external_ref` | VARCHAR | Referência de pagamento apresentada ao consumidor |
| `status` | VARCHAR | Estado actual da máquina de estados |
| `amount_minor` | BIGINT | Montante em unidades menores (100 = 1 Kz) |
| `ledger_posting_id` | UUID? | Lançamento ledger criado na liquidação |
| `reversal_posting_id` | UUID? | Lançamento de reversão (se revertido) |
| `reconciliation_attempts` | INT | Número de tentativas de reconciliação |
| `expires_at` | TIMESTAMPTZ | TTL da sessão |
| `confirmed_at` | TIMESTAMPTZ? | Timestamp de liquidação |
| `reversed_at` | TIMESTAMPTZ? | Timestamp de reversão |

**`provider_callbacks`** — registo imutável de callbacks externos

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `provider_event_id` | VARCHAR | ID único do evento do provedor |
| `provider` | VARCHAR | Identificador do provedor |
| `funding_session_id` | UUID? | Sessão associada |
| `hmac_valid` | BOOLEAN | Assinatura HMAC verificada |
| `status` | VARCHAR | `RECEIVED` \| `PROCESSING` \| `PROCESSED` \| `REJECTED` |
| `payload` | JSONB | Payload bruto do callback |

Chave única: `UNIQUE(provider, provider_event_id)` — a fronteira de idempotência ao nível dos dados.

**`reconciliation_attempts`** — log de auditoria de reconciliação (append-only)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `funding_session_id` | UUID | Sessão reconciliada |
| `attempt_number` | INT | Número da tentativa |
| `outcome` | VARCHAR | `SUCCESS` \| `FAILURE` \| `RETRY` |
| `ledger_posting_id` | UUID? | Lançamento criado (se sucesso) |
| `detail` | TEXT | Descrição do resultado |

#### O lançamento de dupla entrada na liquidação

Quando uma sessão passa para SETTLED, o motor cria exatamente um lançamento balanceado:

```
DR  conta de trânsito (ASSET)
    ← dinheiro externo chegou ao Banzami

CR  conta disponível do consumidor (LIABILITY)
    ← o Banzami deve esse valor ao consumidor
```

Este lançamento é:
- atómico — ou ambas as entradas existem ou nenhuma
- idempotente — a chave `funding-settle-{session_id}` previne duplicação
- imutável — triggers de base de dados bloqueiam UPDATE/DELETE
- reconciliável — o `ledger_posting_id` da sessão aponta para o lançamento exacto

#### Reversão

Quando um banco reverte uma transacção confirmada, o Banzami não apaga nada. Cria um segundo lançamento que anula o primeiro:

```
Lançamento original:
  DR  conta de trânsito    +10.000 Kz
  CR  conta disponível     +10.000 Kz

Lançamento de reversão:
  CR  conta de trânsito    +10.000 Kz  ← inverte o débito
  DR  conta disponível     +10.000 Kz  ← retira o crédito do consumidor
```

Ambos os lançamentos ficam imutavelmente registados. O trilho de auditoria é completo. O saldo do consumidor reflecte a realidade.

#### Cenários operacionais

**Cenário A — Carregamento normal**

```
t=0s   Consumidor abre a app → selecciona BAI → recebe referência de pagamento
t=0s   FundingSession criada: PENDING_PAYMENT
t=30s  Consumidor paga via Multicaixa Express no ATM
t=30s  FundingSession avança para: PENDING_PROVIDER_CONFIRMATION
t=32s  EMIS envia callback HTTPS com HMAC assinado
t=32s  provider_callbacks: INSERT com UNIQUE(EMIS, evt-abc123)
t=32s  FundingSession avança para: RECONCILING
t=32s  Motor de reconciliação valida → cria lançamento ledger
t=32s  FundingSession avança para: SETTLED (ledger_posting_id = xyz)
t=32s  Saldo da carteira actualizado instantaneamente
t=32s  Consumidor vê +10.000 Kz disponíveis na app
```

**Cenário B — Callback com 17 minutos de atraso**

```
t=0s    Sessão criada: PENDING_PAYMENT
t=5s    Consumidor paga: PENDING_PROVIDER_CONFIRMATION
t=22m   Callback EMIS finalmente chega (17 minutos de atraso)
t=22m   Sessão avança para RECONCILING
t=22m   Reconciliação cria lançamento → SETTLED
        Durante todo este tempo a carteira reflectia saldo 0 — correcto.
        Nenhum crédito foi concedido antes da confirmação.
```

**Cenário C — Callback duplicado do banco**

```
t=0s   Sessão criada e confirmada normalmente → SETTLED
t=5m   Banco reenvia o mesmo callback (retry automático)
t=5m   INSERT em provider_callbacks falha:
           ERROR: duplicate key value violates unique constraint
           "provider_callbacks_event_unique"
t=5m   FundingEngine retorna DuplicateCallback — sem alteração de estado
       O saldo do consumidor não é alterado.
       Zero créditos duplicados.
```

**Cenário D — Reversão bancária após liquidação**

```
t=0s   Sessão SETTLED → ledger_posting_id = posting-A
t=3d   Banco reverte a transacção (chargeback)
t=3d   reverse_session() chamado com razão "bank reversal: chargeback"
t=3d   LedgerEngine.reverse(posting-A) cria posting-B (inverso exacto)
t=3d   Sessão avança para REVERSED (reversal_posting_id = posting-B)
       posting-A permanece imutável no ledger.
       posting-B é o registo contabilístico da reversão.
       O saldo do consumidor é reduzido ao valor original.
       Trilho de auditoria completo: dois lançamentos balanceados.
```

**Cenário E — Timeout EMIS / falha transitória**

```
t=0s   Sessão criada: PENDING_PAYMENT → PENDING_PROVIDER_CONFIRMATION
t=5m   Timeout de ligação ao EMIS — callback não chega
t=5m   Worker de reconciliação detecta sessão em RECONCILING há > N minutos
t=5m   Regista ReconciliationAttempt(RETRY)
t=5m   Sessão volta para: PENDING_PROVIDER_CONFIRMATION
t=8m   Callback chega com atraso → sessão avança normalmente
       Ou sessão expira por TTL → EXPIRED
```

#### Modelo de segurança

| Controlo | Mecanismo |
|----------|-----------|
| Autenticação de callbacks | HMAC-SHA256 com chave partilhada por provedor; callbacks sem HMAC válido são registados como `hmac_valid=false` e rejeitados pelo motor |
| Protecção contra replay | `UNIQUE(provider, provider_event_id)` — constraint de base de dados; não depende de lógica de aplicação |
| Idempotência de lançamento | Chave `funding-settle-{session_id}` em `ledger_postings` com UNIQUE constraint |
| Imutabilidade | Triggers de PostgreSQL bloqueiam UPDATE/DELETE em `ledger_entries` e `ledger_postings` |
| Isolamento sandbox | Sessões sandbox nunca tocam contas de liquidação reais |
| Limites KYC | Verificação de limite por transacção e diário antes da criação da sessão |
| Detecção de fraude | Contadores de velocidade; contas suspeitas bloqueadas antes da reconciliação |
| Auditoria | `provider_callbacks` e `reconciliation_attempts` são append-only e imutáveis |

#### Garantias de reconciliação

O motor garante:

1. **Uma sessão liquidada tem exactamente um lançamento ledger.** A chave de idempotência `funding-settle-{id}` previne duplicação mesmo em caso de retentativa.
2. **Zero créditos sem lançamento.** O campo `ledger_posting_id` é sempre verificado — sem ID registado, o saldo não mudou.
3. **Reversões preservam o histórico.** `reversal_posting_id` e `reversed_at` documentam a reversão sem apagar o lançamento original.
4. **Sessões expiradas são impenháveis.** O estado EXPIRED é terminal — qualquer tentativa de avançar é rejeitada com `InvalidTransition`.

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
│  │  Interface móvel │   │  Links · Pedidos de pagamento        │    │
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
| **Gestão de perfil de comerciante** | Interface no Banza Business para criar e editar perfis públicos de comerciantes |
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

A expansão é um marco futuro, não um objectivo actual. Uma rede de pagamentos torna-se valiosa através da densidade. Uma rede fina em muitos países vale menos para cada participante do que uma rede densa num só. O Banza atinge densidade de rede real em Angola primeiro, depois expande com um modelo que já foi provado.

A arquitectura já está concebida para isso. O momento ainda não chegou.

---

## 20. Arquitectura Sandbox & TestFlight

> **Princípio central: o dinheiro LIVE é sagrado.**  
> O sandbox existe para testar o ecossistema em segurança — sem nenhuma possibilidade de contaminar dinheiro de produção ou fluxos de liquidação.

Esta secção documenta a arquitectura completa de isolamento de ambiente do Banza: por que existe, como funciona, as garantias que fornece e como os operadores a mantêm e validam.

---

### 20.1 Por que o Sandbox Existe

O Banza lida com dinheiro angolano real. Antes de qualquer versão chegar a utilizadores reais, é necessário um ambiente onde o produto possa ser testado exaustivamente — com fluxos de pagamento completos, saldos de carteira realistas e comportamento de rede real — sem que nenhum Kwanza real se mova.

O sandbox serve:

| Caso de uso | Descrição |
|-------------|-----------|
| **Beta testing TestFlight** | Os testadores instalam uma build do TestFlight e executam fluxos de pagamento completos com dinheiro fictício |
| **Validação de UX** | Equipas de produto testam novas funcionalidades sem tocar em contas de produção |
| **Demonstrações a parceiros** | Demonstrações a comerciantes, parceiros e investidores que mostram o produto real, não um mockup |
| **QA e regressão** | As suites de testes automáticos correm contra o ambiente staging |
| **Integração de programadores** | Os integradores de SDK testam as suas implementações antes de ir a produção |
| **Simulação de comerciante** | Os comerciantes testam o seu setup de QR, Pay Links e webhooks antes de activar |

O sandbox garante que **nenhum destes casos de uso toca**:
- saldos de produção reais
- liquidação real
- dinheiro real
- carris EMIS/banco reais

---

### 20.2 O Incidente que Motivou o Endurecimento (SANDBOX-SAFETY-001)

Em Maio de 2026, foi detectado um incidente de contaminação de ambiente.

**O que aconteceu:** Um crédito de teste de 500.000 AOA foi acidentalmente creditado na carteira de produção de @fm65 através do endpoint `test_credit`. A chamada chegou ao ambiente LIVE porque o core-api não impunha verificações de ambiente em tempo de execução — confiava que os chamadores garantiam que os endpoints de teste nunca seriam invocados em produção.

**Por que era perigoso:** Embora nenhum dinheiro real tivesse entrado, a operação criou uma entrada de ledger inválida no ambiente de produção — uma violação directa da separação ledger LIVE/SANDBOX. Se passasse despercebido, teria criado um desequilíbrio de reconciliação. Em escala, este padrão tornaria a auditoria impossível.

**Como foi resolvido:**
1. O crédito fictício foi revertido através de um lançamento contábil de dupla entrada adequado — DÉBITO carteira do consumidor, CRÉDITO conta de trânsito
2. Nenhuma liquidação real ocorreu; nenhuma via bancária foi envolvida
3. A arquitectura foi imediatamente endurecida (SANDBOX-SAFETY-001)

**O que foi aprendido:** Os guardas de ambiente devem ser aplicados no runtime, não confiados à disciplina operacional. O comportamento seguro para um sistema financeiro é **falhar por defeito para o estado mais restritivo** (LIVE), nunca presumir sandbox.

A correcção permanente: o core-api agora aplica um guarda de runtime em cada endpoint de teste. Se o ambiente for LIVE, o endpoint devolve 403 — incondicionalmente, independentemente de quem chamou ou porquê.

---

### 20.3 Modelo de Ambiente

O Banza define dois ambientes mutuamente exclusivos:

| Ambiente | Descrição |
|----------|-----------|
| **LIVE** | Operações financeiras reais. Carris EMIS activos. Dinheiro angolano real. Liquidação real. |
| **SANDBOX** | Ambiente de teste. Sem carris reais. Sem dinheiro real. Sem liquidação real. |

#### Enum CoreEnvironment (Rust — core-api)

O core-api implementa um enum `CoreEnvironment` que lê a variável de ambiente `ENVIRONMENT` no arranque:

```rust
pub enum CoreEnvironment {
    Live,
    Sandbox,
}

impl CoreEnvironment {
    pub fn from_env() -> Self {
        match std::env::var("ENVIRONMENT").as_deref() {
            Ok("SANDBOX") => Self::Sandbox,
            _ => Self::Live,   // LIVE é o padrão seguro
        }
    }

    pub fn is_live(&self) -> bool {
        matches!(self, Self::Live)
    }
}
```

**O comportamento de defeito é LIVE.** Se a variável `ENVIRONMENT` estiver ausente, mal configurada ou vazia, o serviço arranca em modo LIVE. Isto garante que uma configuração incorrecta em produção nunca activa acidentalmente funcionalidades de sandbox.

#### Variáveis de ambiente de serviço

```yaml
# Produção — explicitamente declarado em docker-compose.yml
core-api:
  environment:
    ENVIRONMENT: LIVE

public-api:
  environment:
    ENVIRONMENT: LIVE

# Staging — explicitamente declarado
core-api-staging:
  environment:
    ENVIRONMENT: SANDBOX

public-api-staging:
  environment:
    ENVIRONMENT: SANDBOX
```

#### Log de arranque

Cada serviço regista o seu ambiente no arranque:

```
# public-api (Go)
INFO  boot: environment  environment=LIVE  sandbox_routes=false  core_api_url=http://core-api:8081
INFO  LIVE mode — sandbox routes disabled, real rails active

# public-api em staging
INFO  boot: environment  environment=SANDBOX  sandbox_routes=true  core_api_url=http://core-api-staging:8081
WARN  SANDBOX mode — fake funding enabled, no real rails, no real settlement

# core-api (Rust)
INFO  boot: runtime environment  environment=Sandbox
WARN  SANDBOX mode — test funding endpoints are active
```

Este registo é deliberado: qualquer operador que leia os logs de um serviço sabe imediatamente em que ambiente está a correr.

---

### 20.4 Isolamento Físico de Ambiente

O SANDBOX e o LIVE nunca partilham infra-estrutura. São stacks Docker completamente separados no mesmo servidor.

```
┌─────────────────────────────────┐   ┌─────────────────────────────────┐
│      STACK PRODUÇÃO (LIVE)      │   │     STACK STAGING (SANDBOX)     │
├─────────────────────────────────┤   ├─────────────────────────────────┤
│                                 │   │                                 │
│  core-api            :8081      │   │  core-api-staging      :8091    │
│  public-api          :8083      │   │  public-api-staging    :8093    │
│                                 │   │                                 │
│  ── PostgreSQL ───────────────  │   │  ── PostgreSQL ───────────────  │
│  banzami                        │   │  banzami_staging                │
│  ledger real · carteiras        │   │  ledger fictício · carteiras    │
│  liquidação real · EMIS activo  │   │  sem liquidação · EMIS inactivo │
│                                 │   │                                 │
│  JWT_SECRET  = <produção>       │   │  JWT_SECRET  = <staging>        │
│  DATABASE_URL = banzami         │   │  DATABASE_URL = banzami_staging │
│                                 │   │                                 │
│  api.banzami.org                │   │  staging.banzami.org            │
└─────────────────────────────────┘   └─────────────────────────────────┘
```

**Cada isolamento é físico, não apenas lógico:**

| Componente | LIVE | SANDBOX |
|-----------|------|---------|
| Base de dados | `banzami` | `banzami_staging` |
| Ledger | Entradas reais | Entradas fictícias |
| Carteiras | Saldos reais | Saldos de teste |
| Contas de trânsito | Trânsito de produção | Trânsito de staging |
| JWT secret | Segredo de produção | Segredo de staging diferente |
| Endpoints de API | `api.banzami.org` | `staging.banzami.org` |
| Telemetria OTel | `environment=LIVE` | `environment=SANDBOX` |
| EMIS/carris bancários | Activos | Desactivados |

**Consequência:** um token emitido pelo ambiente LIVE é inválido no ambiente SANDBOX e vice-versa. Um QR gerado no sandbox não pode ser pago por uma app LIVE. Uma conta de consumidor de staging não existe em produção.

---

### 20.5 Modelo de Financiamento Sandbox

Os consumidores de sandbox precisam de saldos de teste para executar fluxos de pagamento. O Banza fornece três mecanismos de financiamento fictício:

#### Crédito automático no registo

Quando um consumidor se regista no ambiente SANDBOX, recebe automaticamente um crédito de boas-vindas de 10.000 Kz fictícios para começar a testar imediatamente.

#### Endpoint de financiamento sandbox

Disponível apenas em SANDBOX. Retorna 403 em todos os outros ambientes.

```http
POST /v1/sandbox/fund
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount_minor": 1000000,
  "currency": "AOA"
}
```

```json
{
  "funded": true,
  "currency": "AOA",
  "credited_minor": 1000000,
  "new_balance": 2000000,
  "note": "Sandbox wallet credited. Virtual balance — no real funds moved."
}
```

**Limites:**
- Máximo de 100.000.000 AOA (10.000.000.000 minor units) por pedido
- Máximo de 20 top-ups por consumidor por período de 24 horas

**Isolamento LIVE garantido:**

```rust
// core-api — guard em cada endpoint de teste
if state.environment.is_live() {
    tracing::error!("test_credit called in LIVE environment — rejected");
    return Err(ApiError::forbidden(
        "test credit is not available in LIVE environment"
    ));
}
```

```go
// public-api — guard no handler sandbox
func (h *SandboxHandler) requireSandbox(w http.ResponseWriter, r *http.Request) bool {
    if h.environment != "SANDBOX" {
        apierror.Respond(w, r, http.StatusForbidden, "SANDBOX_ONLY",
            "this endpoint is only available in sandbox mode")
        return false
    }
    return true
}
```

#### Todo o financiamento sandbox é contabilisticamente correcto

Mesmo em sandbox, os créditos fictícios são registados como entradas de ledger de dupla entrada adequadas. Não há mutação directa de saldo. O sandbox funciona como produção — apenas o endpoint de crédito inicial é diferente. Isto garante que a cobertura de testes seja fiel ao comportamento de produção.

#### Ferramentas CLI de staging

```bash
# Financiar um testador existente com 10.000 Kz
./tools/staging-seed.sh --fund @fm65

# Inspeccionar as últimas 20 transferências de um consumidor
./tools/staging-seed.sh --inspect @merchant01

# Apagar um consumidor de staging
./tools/staging-seed.sh --delete @testuser1

# Listar todos os consumidores de staging
./tools/staging-seed.sh --list
```

---

### 20.6 Garantias de Protecção LIVE

Os seguintes endpoints são **explicitamente bloqueados** em ambiente LIVE com resposta 403:

| Endpoint | Serviço | Motivo do bloqueio |
|----------|---------|---------------------|
| `test_credit` | core-api | Crédito fictício de carteira |
| `sandbox_credit` | core-api | Crédito sandbox de carteira |
| `admin_credit` | core-api | Crédito de administrador (para testes) |
| `test_confirm` (deposits) | core-api | Confirmação fictícia de depósito |
| `test_confirm` (acquiring) | core-api | Confirmação fictícia de acquiring |
| `POST /v1/sandbox/fund` | public-api | Endpoint de financiamento sandbox |

**Comportamento em LIVE:**

```
POST /v1/sandbox/fund  (ambiente LIVE)

HTTP 403 Forbidden
{
  "code": "SANDBOX_ONLY",
  "message": "this endpoint is only available in sandbox mode"
}
```

Esta protecção é aplicada a nível de runtime, não de configuração. Mesmo que a configuração de rede ou proxy redireccionasse incorrectamente tráfego sandbox para um serviço LIVE, o serviço recusaria a operação.

---

### 20.7 UX Sandbox Móvel

As builds TestFlight identificam-se visualmente para eliminar qualquer ambiguidade — para testadores, equipas de produto e parceiros — de que estão a interagir com dinheiro fictício.

#### Faixa de sandbox persistente

Uma faixa âmbar ("Ambiente de Teste — Sem valor financeiro real") aparece no topo de cada ecrã da app, em todos os tabs, de forma persistente. Implementada como `SandboxRibbon` no `MainScreen` — um único ponto de inserção que cobre toda a navegação.

#### Badge de sandbox

`SandboxBadge` — um pill âmbar compacto "SANDBOX" — é renderizado contextualmente onde o conteúdo financeiro aparece: no ecrã de recepção de QR, no ecrã de saldo, nos detalhes de transferência.

#### Ícone de app diferenciado

As builds sandbox usam um ícone de app permanente e pré-construído (`sbanza_icon.png`), armazenado em `apps/mobile/assets/branding/sandbox/`. O flavor Xcode `consumer_sandbox` selecciona automaticamente o asset catalog `AppIconSandbox.appiconset` via `ASSETCATALOG_COMPILER_APPICON_NAME = AppIconSandbox` — sem geração dinâmica, sem mutação de ficheiros em tempo de build, sem restauração necessária. Os testadores distinguem visualmente as builds sandbox das builds de produção no ecrã inicial do dispositivo.

#### Bloqueio por configuração inválida

No arranque, a app verifica que o flag de build (`--dart-define=ENVIRONMENT=sandbox`) corresponde ao URL da API configurado. Se uma build sandbox estiver apontada para `api.banzami.org` (produção), ou uma build LIVE para `staging.banzami.org`, a app mostra um AlertDialog bloqueante e recusa navegar:

```
Configuração de ambiente inválida.

Esta build de sandbox está ligada à API de produção.
Isto é um erro de configuração e foi bloqueado por segurança.
```

Isto impede que erros de configuração de build passem despercebidos.

---

### 20.8 Diferenciação de QR e Recibos Sandbox

#### QR sandbox

Os QR gerados em ambiente sandbox usam o esquema `banza-sandbox:` em vez de `banza:`:

```
LIVE:    banza://pay/u/fm65?amount=250000&currency=AOA
SANDBOX: banza-sandbox://pay/u/fm65?amount=250000&currency=AOA
```

**Consequências de design:**
- Um QR sandbox **não pode ser lido** por uma app de produção — o esquema é desconhecido
- Uma app sandbox **não pode ler** um QR de produção — o esquema não corresponde
- Elimina completamente o risco de um testador fazer o scan de um QR de produção com uma build sandbox, ou vice-versa

O URL de partilha de QR sandbox aponta para `staging.banzami.org/pay/u/<handle>`, não para `api.banzami.org`. Os links de sandbox não encaminham pagamentos reais.

#### Recibos sandbox

Os recibos de pagamento em builds sandbox são explicitamente marcados:

- Badge "COMPROVATIVO DE TESTE" em âmbar no topo do recibo
- Ícone de aviso em vez do ícone de sucesso
- Rodapé: "Sem valor financeiro real — Ambiente de Teste"
- Cor do recibo alterada para esquema âmbar em vez de verde

Isto impede que um recibo sandbox seja usado como prova de pagamento real — uma forma de protecção contra engenharia social de pagamento falso.

#### Prefixo de notificação

As notificações locais de transferências recebidas em builds sandbox são prefixadas com `[SANDBOX]`:

```
LIVE:    "Recebeu 2.500 Kz"
SANDBOX: "[SANDBOX] Recebeu 2.500 Kz"
```

---

### 20.9 Arquitectura TestFlight

O TestFlight é o canal de distribuição de beta para testers iOS. A configuração de build do Banza garante que as builds TestFlight conectam exclusivamente a `staging.banzami.org` e nunca a `api.banzami.org`.

#### Fluxo do testador

```
Instalar build TestFlight
          ↓
App abre → arranque verifica ambiente (sandbox build ↔ staging URL)
          ↓
Ecrã de registo → handle + PIN
          ↓
Crédito automático de boas-vindas: 10.000 Kz fictícios aplicados
          ↓
Explorar funcionalidades:
  • Enviar transferência para outro testador
  • Receber pagamento
  • Fazer scan de QR sandbox
  • Criar Pay Link de teste
  • Ver histórico de actividade
          ↓
Todos os fluxos executam end-to-end — sem dinheiro real, sem EMIS, sem liquidação
```

#### Testadores pré-configurados (staging-seed.sh)

Os seguintes consumidores são criados na base de dados de staging para testes imediatos:

| Handle | Nome | PIN | Função |
|--------|------|-----|--------|
| `@fm65` | Fidel Monteiro | 123456 | Testador principal |
| `@testuser1` | Tester Um | 123456 | Testador genérico |
| `@ana` | Ana | 123456 | Testador consumidor |
| `@joao` | João | 123456 | Testador consumidor |
| `@merchant01` | Merchant Teste | 123456 | Testador de comerciante |

Todos recebem 10.000 Kz fictícios no registo. Podem ser adicionalmente financiados com `./tools/staging-seed.sh --fund @handle`.

---

### 20.10 Processo de Build TestFlight

#### Pré-condições

1. `tools/testflight-readiness.sh` deve passar com 0 falhas (ver §20.11)
2. A base de dados de staging deve estar saudável e com seed
3. O `core-api-staging` deve estar a correr com `ENVIRONMENT=SANDBOX`

#### Comandos de build

**Passo 1 — Verificar prontidão do ambiente**

```bash
./tools/testflight-readiness.sh
```

**Passo 2 — Build do IPA** (flavor `consumer_sandbox` selecciona `AppIconSandbox` automaticamente)

```bash
cd apps/mobile
flutter build ipa \
  --flavor consumer_sandbox \
  -t lib/main_consumer.dart \
  --dart-define=PUBLIC_API_URL=https://staging.banzami.org \
  --dart-define=ENVIRONMENT=sandbox \
  --export-options-plist=ios/ExportOptions.plist
```

Os dois `--dart-define` são obrigatórios:
- `ENVIRONMENT=sandbox` activa o modo sandbox em toda a app (banner, QR scheme, recibos, branding)
- `PUBLIC_API_URL=https://staging.banzami.org` aponta a app para a infra de staging

O ícone sandbox é um asset permanente — nenhuma geração dinâmica ou restauração é necessária antes ou depois do build.

**Passo 3 — Upload TestFlight**

```bash
xcrun altool --upload-app \
  --type ios \
  --file build/ios/ipa/*.ipa \
  --apiKey <APP_STORE_CONNECT_API_KEY> \
  --apiIssuer <APP_STORE_CONNECT_ISSUER_ID>
```

---

### 20.11 Checklist de Prontidão TestFlight

O script `tools/testflight-readiness.sh` executa 11 verificações de saúde antes de autorizar um build TestFlight. Deve ser executado contra o ambiente de staging imediatamente antes de cada build.

```bash
./tools/testflight-readiness.sh
# ou com URL personalizado:
STAGING_URL=https://staging.banzami.org ./tools/testflight-readiness.sh
```

**As 11 verificações:**

| # | Verificação | O que valida |
|---|-------------|--------------|
| 1 | **Rede / TLS** | Host staging.banzami.org acessível; certificado TLS válido e não expirado |
| 2 | **Health endpoint** | `/health` ou `/healthz` devolve 200 |
| 3 | **Registo de consumidor** | `POST /v1/auth/register` para dois consumidores de teste devolve 201 |
| 4 | **Login** | `POST /v1/auth/token` devolve 200 e token JWT válido |
| 5 | **Sandbox fund** | `POST /v1/sandbox/fund` devolve 200 com `new_balance` |
| 6 | **Saldo de carteira** | `GET /v1/me/wallet/balance` devolve 200 e saldo > 0 após crédito |
| 7 | **Transferência P2P** | `POST /v1/transfers` entre consumidores de teste devolve 200/201; saldo do destinatário actualizado |
| 8 | **Feed de actividade** | `GET /v1/me/activity` devolve 200 com items |
| 9 | **Lookup de consumidor** | `GET /v1/consumers/{handle}` devolve 200 |
| 10 | **Isolamento LIVE** | `POST /v1/sandbox/fund` contra `api.banzami.org` devolve 403 |
| 11 | **Sanidade de rate limit** | Chamadas repetidas a sandbox/fund devolvem 200 ou 429 (nunca outro código inesperado) |

**Comportamento de saída:**
- Exit 0: todas as verificações passaram → "READY for TestFlight"
- Exit 1: uma ou mais verificações falharam → "NOT READY for TestFlight"

O script imprime os comandos de build completos quando tem sucesso, incluindo os `--dart-define` exactos necessários.

---

### 20.12 Telemetria e Separação de Observabilidade

Todos os serviços Banza carimbam o atributo `deployment.environment` em cada trace e métrica OpenTelemetry:

| Serviço | Ambiente LIVE | Ambiente SANDBOX |
|---------|--------------|-----------------|
| `public-api` | `deployment.environment=LIVE` | `deployment.environment=SANDBOX` |
| `api-gateway` | `deployment.environment=production` | `deployment.environment=development` |
| `admin-api` | `deployment.environment=LIVE` | — (sempre LIVE) |

Este atributo é aplicado no recurso OTel no arranque do serviço:

```go
res, err := resource.New(ctx,
    resource.WithAttributes(
        semconv.ServiceName(serviceName),
        semconv.ServiceVersion(version),
        semconv.DeploymentEnvironmentKey.String(environment), // "LIVE" ou "SANDBOX"
    ),
    resource.WithHost(),
    resource.WithProcess(),
)
```

**Filtros Grafana:** os dashboards de produção podem excluir completamente o tráfego de sandbox com um único filtro de label:

```
deployment_environment="LIVE"
```

Sem esta separação, os testes TestFlight contaminariam as métricas de produção: latências, contagens de transacção, taxas de erro — tornando os alertas de oncall infiáveis. A separação de telemetria garante que o que os dashboards de produção mostram reflecte apenas operações LIVE reais.

---

### 20.13 Ferramentas de Operação de Staging

#### staging-seed.sh — referência completa

```bash
./tools/staging-seed.sh              # seed dos testadores padrão
./tools/staging-seed.sh --fund @handle    # adicionar 10.000 Kz a uma conta existente
./tools/staging-seed.sh --inspect @handle # ver últimas 20 transferências
./tools/staging-seed.sh --delete @handle  # apagar consumidor de staging
./tools/staging-seed.sh --list            # listar todos os consumidores de staging
./tools/staging-seed.sh --reset           # apagar todos os consumidores de staging (ATENÇÃO)
```

**Segurança:** O script está hardcoded para conectar apenas à base de dados `banzami_staging` via `docker exec`. Não existe parâmetro para especificar uma base de dados diferente. Não pode apagar dados de produção.

#### gen-icons-sandbox.sh (depreciado)

Este script está depreciado. Os ícones sandbox são agora assets permanentes em `apps/mobile/assets/branding/sandbox/` e `ios/Runner/Assets.xcassets/AppIconSandbox.appiconset/`. O flavor `consumer_sandbox` selecciona o asset catalog correcto automaticamente — sem mutação de ficheiros antes ou depois do build.

O script emite um aviso e termina imediatamente sem fazer nada.

---

### 20.14 Princípios de Segurança do Sandbox

Estes princípios são regras de arquitectura vinculativas, não orientações:

1. **O dinheiro LIVE é sagrado.** Nenhum crédito fictício pode criar entradas de ledger em produção.

2. **O dinheiro fictício deve nunca tocar produção.** Mesmo que uma chamada chegue a um serviço LIVE, esse serviço recusa-a incondicionalmente.

3. **O sandbox deve ser visivelmente diferenciado.** Nenhum testador deve alguma vez duvidar de que está em sandbox. Cada ecrã, cada recibo, cada QR, cada notificação, cada ícone comunica o estado do ambiente.

4. **Todo o financiamento deve ser ledger-backed.** Mesmo em sandbox, os créditos fictícios passam pelo ledger de dupla entrada. Não há mutação directa de saldo.

5. **Sem mutação oculta de saldo.** Os saldos de carteira são sempre o resultado de entradas de ledger — em LIVE e em SANDBOX.

6. **Sem carris de liquidação partilhados.** O ambiente SANDBOX nunca tem acesso a credenciais EMIS, carris bancários ou qualquer forma de liquidação real.

7. **Sem ambiguidade de ambiente.** Cada serviço regista o seu ambiente no arranque. Cada build móvel verifica a sua configuração no arranque. Cada trace e métrica carrega o label de ambiente.

8. **LIVE é o padrão seguro.** Se o ambiente não puder ser determinado, presume-se LIVE. Nunca sandbox.

---

### 20.15 Roadmap Futuro do Sandbox

| Melhoria | Descrição |
|----------|-----------|
| **Infra de staging dedicada** | Servidor separado exclusivamente para staging — elimina a partilha de host com produção |
| **Simulador EMIS sandbox** | Endpoint simulado que imita respostas EMIS para testar fluxos de acquiring e liquidação completos |
| **Acquiring sintético** | Simular fluxos de pagamento com cartão fictícios para testes de integração de acquiring |
| **Reset nocturno automático** | Job automático que limpa e faz seed da base de dados de staging diariamente à meia-noite |
| **Dashboards de QA** | Painel de observabilidade dedicado ao staging — latências, taxas de erro, cobertura de testes |
| **Sandboxes multi-tenant de parceiros** | Ambientes sandbox isolados por parceiro — cada integrador tem o seu próprio namespace de teste |
| **Simulation mode SDK** | Mode offline no Banza SDK que simula respostas da API sem conectividade — para testes unitários de integradores |
| **Injecção de falhas** | Modo de staging que pode injectar falhas sintéticas (timeout, 500, ledger conflict) para testar resiliência |

---

**Referências de implementação:**

- `SANDBOX-SAFETY-001` — Incidente e endurecimento de isolamento de ambiente (Maio 2026)
- `SANDBOX-002` — Endurecimento UX sandbox TestFlight (Maio 2026)
- `core/api/src/state.rs` — Enum `CoreEnvironment` e guards de runtime
- `services/public-api/internal/handler/sandbox.go` — Handler sandbox com rate limiter
- `services/public-api/internal/handler/sandbox_test.go` — 7 testes de invariante
- `services/public-api/internal/observability/otel.go` — Atributo `deployment.environment`
- `tools/staging-seed.sh` — Ferramentas de seed e gestão de staging
- `tools/testflight-readiness.sh` — Checklist de prontidão TestFlight (11 verificações)
- `apps/mobile/assets/branding/sandbox/` — Assets de branding sandbox permanentes (ícone, logo, splash)
- `apps/mobile/ios/Runner/Assets.xcassets/AppIconSandbox.appiconset/` — 25 resoluções do ícone sandbox para iOS
- `tools/gen-icons-sandbox.sh` — **Depreciado** — emite aviso e termina
- `tools/make-sandbox-icon.py` — **Depreciado** — substituído por assets pré-construídos

---

## 21. Declaração de Visão Final

### O que o comércio de Angola merece

O comércio de Angola merece infraestrutura que corresponda à sua energia.

Não infraestrutura adaptada de um modelo estrangeiro que nunca foi concebido para o Kwanza, para comerciantes informais ou para pagamentos QR-native. Não infraestrutura dependente de redes estrangeiras, aprovação estrangeira ou preços estrangeiros.

Infraestrutura construída aqui. Para aqui.

**Isso é o Banza — construído pelo Banzami.**

### A transformação

**Hoje:**
- Um comerciante não pode aceitar pagamentos digitais sem hardware caro ou um acordo bancário
- Um consumidor tem de fotografar transferências bancárias e enviá-las via WhatsApp para provar uma compra
- Um programador a construir uma app angolana não tem SDK de pagamentos construído para o seu mercado
- Uma app de táxi não consegue fechar o ciclo de pagamento na app
- Uma cantina não tem escolha senão dinheiro físico
- Uma escola reconcilia pagamentos de propinas a partir de recibos físicos, manualmente, no fim da semana

**Amanhã — com o Banza:**
- Um comerciante imprime um QR e aceita pagamentos instantâneos de qualquer smartphone, imediatamente
- Um consumidor faz o scan, confirma e paga em menos de 3 segundos — com um recibo criptográfico
- Um programador integra o Banza SDK tipado e pronto para produção e lança uma funcionalidade de pagamento em horas
- Uma app de táxi fecha cada corrida com liquidação instantânea na app
- Uma cantina tem uma Banza Wallet, o Banza Business e visibilidade total sobre cada transacção
- Uma escola sabe em tempo real exactamente quem pagou

### Por que isto importa para além do comércio

Os pagamentos não são apenas transacções. São confiança.

Quando um pagamento é instantâneo e confirmado, ambas as partes podem avançar sem dúvida. Quando um recibo é digital e permanente, não há disputa sobre o que foi acordado. Quando uma carteira é sempre acessível, a capacidade de participar na vida económica não é restringida pela geografia, pelo acesso bancário formal ou pelo dinheiro físico.

O Banza torna a economia angolana mais líquida, mais transparente e mais acessível — não substituindo o que existe, mas completando o que falta. Construído pelo Banzami.

### A promessa

Cada decisão de engenharia, cada escolha de produto e cada design no Banza reflecte um compromisso do Banzami:

**Os pagamentos digitais em Angola devem ser instantâneos, acessíveis, integrados e utilizáveis por todos.**

Não para alguns comerciantes. Não para alguns consumidores. Não para algumas aplicações.

Para cada cantina. Para cada táxi. Para cada escola, vendedor de mercado, site de ecommerce, plataforma de delivery, freelancer e família.

Para Angola.

```
   SCAN   →   CONFIRMAR   →   PAGO INSTANTANEAMENTE
```

---

*Banza — O sistema de pagamentos instantâneos de Angola. Wallet-native. QR-first. Construído para cada angolano.*  
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
