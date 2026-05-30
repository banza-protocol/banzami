# Banzami — Documento de Referência do Operador

**Version:** 1.0  
**Date:** 2026-05-30  
**Status:** Official  
**Authority:** ADR-025

---

## Ecosystem Hierarchy

```
BANZA    = open financial infrastructure protocol
BanzAI   = Protocol Operating System
Banzami  = reference operator implementation            ← THIS DOCUMENT
```

## Scope

This document defines only: **Banzami — the reference operator implementation of the BANZA financial infrastructure protocol.**

Banzami is one implementation of BANZA. The protocol is not owned by Banzami. The protocol exists independently of Banzami.

Anything outside this scope is defined in:
- [BANZA_REFERENCE.md](../banza/BANZA_REFERENCE.md) — The BANZA open protocol (rules, invariants, certification, governance)
- [BANZAI_REFERENCE.md](../banzai/BANZAI_REFERENCE.md) — The BanzAI Protocol OS

---

## Índice

1. O que é o Banzami
2. Banzami Wallet — Para Consumidores
3. Banzami Business — Para Comerciantes
4. Banzami para Programadores
5. Arquitectura Técnica de Referência
6. Sandbox e Ambiente de Testes
7. Missão e Posicionamento
8. Roadmap do Produto
9. Declaração de Visão

---

## 1. O que é o Banzami

O Banzami é a implementação de referência do protocolo BANZA. É o primeiro operador certificado BANZA e o maior — mas não o proprietário do protocolo.

A relação é exactamente a que existe entre o Pix e o Nubank. O Nubank é o maior utilizador do Pix no Brasil — um produto extraordinário construído sobre o protocolo. Mas o Pix não pertence ao Nubank. Se o Nubank desaparecesse, o Pix continuaria.

O Banzami é isso para o BANZA.

### Papel no Ecossistema

```
BANZA (protocolo aberto)
├── BanzAI (Protocol OS)
└── Banzami (operador de referência)
    ├── Banzami Wallet
    ├── Banzami Business
    ├── Banzami QR
    ├── Banzami Checkout
    └── Banzami Pay Links
```

O Banzami:
- Implementa os invariantes do protocolo como produtos
- Prova que o protocolo funciona em produção, em Angola, com utilizadores reais
- Demonstra como qualquer aplicação angolana pode integrar pagamentos BANZA via SDK
- É um operador entre futuros muitos — não o dono do protocolo

O Banzami NÃO é:
- O protocolo BANZA
- A infraestrutura BANZA
- O ecossistema BANZA (o ecossistema é BANZA's)
- Um banco
- Um processador de cartões

### O que o Banzami oferece

| Produto | Para quem | O que oferece |
|---|---|---|
| **Banzami Wallet** | Consumidores | Carteira em Kwanza, QR payments, transferências P2P @banza |
| **Banzami Business** | Comerciantes | Dashboard operacional, QR, payment links, analytics, levantamentos |
| **Banzami SDK** | Programadores | TypeScript, Flutter, PHP SDKs para integração de pagamentos em horas |
| **Banzami API** | Programadores | API REST versionada e idempotente para todas as operações |

### As Quatro Implementações dos Princípios do Protocolo

O protocolo BANZA define quatro princípios que qualquer operador certificado deve implementar. O Banzami implementa-os assim:

| Princípio do Protocolo | Implementação Banzami |
|---|---|
| **Wallet-native** | Banzami Wallet — carteira em Kwanza para cada conta |
| **QR-native** | Banzami QR — QR estático para comerciantes, dinâmico para transacções |
| **Programmable** | Banzami SDK — TypeScript, Flutter, PHP disponíveis |
| **Instant settlement** | T+0 — ledger actualizado no momento da confirmação (invariante do protocolo — ver [BANZA_REFERENCE.md §7](../banza/BANZA_REFERENCE.md)) |

### A Experiência Canónica

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

**Tempo total: menos de 3 segundos.**

---

## 2. Banzami Wallet — Para Consumidores

### Obter uma Carteira

```
1. Inserir o número de telemóvel
2. Verificar com um código de uso único
3. Escolher o @banza
4. Definir um PIN (biométrico opcional)

→ Carteira pronta. Pode receber dinheiro imediatamente.
```

Menos de dois minutos do início ao fim.

### @banza — Identidade de Pagamento

Cada pessoa na rede Banzami tem um **@banza** — um identificador único e legível por humanos que funciona como identidade de pagamento nativa.

```
@joao          ← consumidor
@cantina.luanda      ← comerciante
@escola.benguela     ← instituição
```

O @banza substitui números de conta bancária, IBANs e códigos de referência. O protocolo BANZA define as regras do handle @banza (unicidade, formato, namespaces reservados) — ver [BANZA_REFERENCE.md §3](../banza/BANZA_REFERENCE.md). O Banzami implementa estas regras na Banzami Wallet.

### Saldo da Carteira

```
┌──────────────────────────────────────────────────┐
│  @joao                                           │
│  Disponível:   12.750 Kz  ← gastável agora       │
│  Reservado:     2.500 Kz  ← operação pendente    │
│  Total:        15.250 Kz                         │
└──────────────────────────────────────────────────┘
```

O saldo **disponível** pode ser gasto ou transferido imediatamente. O saldo **reservado** cobre operações pendentes. Ambos são sempre exactos — sem "por favor verifique daqui a alguns minutos."

### Como o Dinheiro Entra na Carteira

O Banzami é uma rede de pagamentos de circuito fechado. Para que o dinheiro entre, atravessa um canal financeiro externo validado:

```
[Conta Bancária do Utilizador]
           | transferência / Multicaixa Express
           v
[EMIS / Banco / Multicaixa Express]
           | confirmação de liquidação
           v
[Bridge de Adquirência do Banzami]
           | validação HMAC, idempotência, reconciliação
           v
[Ledger BANZA]
           | lançamento de dupla entrada
           v
[Banzami Wallet do Utilizador]
```

Nenhum crédito é definitivo sem confirmação verificada do provedor externo. Capturas de ecrã nunca são aceites como prova de pagamento.

### Pagar por QR

```
Chega a uma cantina. Um código QR está no balcão.
Abre o Banzami. Toca em "Pagar."
Faz o scan.

A app mostra: "Pagar a @cantina.luanda"
Insere 1.500 Kz. Confirma com a impressão digital.

Ecrã: ✅ Pago. 1.500 Kz.
O telemóvel da dona acende-se. Feito.
```

### Segurança do Consumidor

- Autenticação por PIN (nunca password) + JWT
- Cada dispositivo tem um registo de device único
- Todas as transacções são criptograficamente assinadas
- Notificações push em tempo real para cada movimento

### Canais de Carregamento

| Canal | Estado |
|---|---|
| Multicaixa Express | Planeado — canal primário |
| Transferência bancária (EMIS) | Planeado |
| Depósito bancário directo | Planeado |
| Rede de agentes / cash-in | Futuro |

---

## 3. Banzami Business — Para Comerciantes

### Onboarding

Um comerciante regista-se no Banzami, fornece informações básicas do negócio e recebe uma carteira de comerciante e um @banza em minutos. Um código QR estático está pronto para download imediatamente.

Sem terminal POS. Sem acordo de cartão. Sem volume mínimo. O tempo entre "quero aceitar pagamentos digitais" e "estou a aceitar pagamentos digitais" é medido em minutos, não semanas.

### Interface Móvel

Optimizada para operação diária no terreno. Para cantinas, táxis, bancas de mercado, vendedores ambulantes.

**O que permite:**
- Receber notificações de pagamento instantâneas
- Gerar QR estático e dinâmico
- Acompanhar transacções e saldo em tempo real
- Emitir links de pagamento via WhatsApp, SMS
- Iniciar levantamentos para conta bancária

| Tipo de negócio | Fluxo |
|---|---|
| Cantina | QR impresso na parede → cliente faz scan → notificação imediata |
| Táxi | Gera QR → cliente paga → confirmação automática |
| Banca de mercado | @banza exibido → cliente transfere → saldo actualizado em segundos |

### Interface Web

| Secção | O que permite |
|---|---|
| Saldo | Saldo disponível e reservado, em tempo real |
| Transacções | Cada pagamento recebido — timestamp, valor, @banza |
| Análises | Volume diário/mensal, contagens, horas de pico |
| Reembolsos | Emitir reembolsos totais ou parciais |
| Disputas | Ver e responder a disputas |
| Levantamentos | Transferir saldo para conta bancária angolana |
| Chaves API | Gerar e gerir credenciais para integrações SDK |

### QR Estático vs. QR Dinâmico

| Tipo | Uso | Montante |
|---|---|---|
| **QR Estático** | Balcão, cantina, serviço com preço fixo | O consumidor introduz o montante |
| **QR Dinâmico** | Cada transacção com montante específico | Codificado no QR — o consumidor só confirma |

A liquidação T+0 é um invariante do protocolo BANZA — qualquer operador certificado deve implementá-la. O Banzami implementa-a: o montante líquido é creditado na carteira do comerciante imediatamente após a confirmação do pagamento. Ver [BANZA_REFERENCE.md §7](../banza/BANZA_REFERENCE.md) para a definição normativa.

### Payment Links

```
https://pay.banzami.org/abc123
```

Um link de pagamento é um URL partilhável com um pedido de pagamento pré-configurado. O consumidor abre-o num browser e paga com a Banzami Wallet. Substitui directamente o fluxo "envia-me o screenshot do WhatsApp".

### Levantamentos

O saldo da carteira é transferido para uma conta bancária angolana a pedido — via interface móvel, web ou API. O Banzami inicia a transferência imediatamente via EMIS.

### A Loja QR

Cada comerciante tem um perfil público permanente em `pay.banzami.org/profiles/@banza`. Partilhável como link, imprimível como QR, descobrível via pesquisa. Qualquer consumidor que chegue pode pagar instantaneamente.

---

## 4. Banzami para Programadores

### Arquitectura SDK-First

O Banzami é construído para programadores. O caminho de integração recomendado é sempre através de um SDK oficial — nunca chamadas HTTP directas, nunca clientes artesanais.

Os SDKs oficiais fornecem:
- **Superfícies de API tipadas** — sem adivinhação sobre formas de pedido ou resposta
- **Idempotência automática** — cada POST é seguro para retry
- **Retry com backoff exponencial** — falhas transitórias tratadas sem código
- **Verificação de assinatura de webhooks** — segurança por defeito
- **Isolamento de ambiente** — sandbox e live completamente separados

### SDKs Disponíveis

| SDK | Pacote | Uso principal |
|---|---|---|
| TypeScript / Node.js | `@banza/sdk` | Web, Node.js, backends |
| Flutter/Dart | `banza_flutter` | Apps móveis Android/iOS |
| PHP | `banza/sdk-php` | Backends PHP/Laravel |

### Exemplo TypeScript

```typescript
import { BanzaClient } from '@banza/sdk';

const client = new BanzaClient({
  apiKey:      'bz_test_…',
  environment: 'sandbox',
});

// Criar QR dinâmico para receber pagamento
const qr = await client.qr.createDynamic({
  amountMinor: 250000, // 2.500 Kz — sempre inteiros (MON-001)
  currency:    'AOA',
  description: 'Refeição #42',
  expiresAt:   new Date(Date.now() + 15 * 60 * 1000),
});

console.log(qr.payload); // payload para renderizar como QR
```

### Exemplo Flutter

```dart
final client = BanzaClient(
  apiKey:      'bz_test_…',
  environment: BanzaEnvironment.sandbox,
);

final result = await BanzaPay.confirm(
  context:     context,
  merchantId:  'mch_...',
  amountMinor: 8500,   // 8.500 Kz
  reference:   'Pedido #77',
  currency:    'AOA',
);

if (result.status == PaymentStatus.completed) {
  Navigator.pushNamed(context, '/order-complete');
}
```

### Webhooks

Cada evento significativo aciona uma entrega de webhook assinado:

```typescript
app.post('/webhooks/banza', express.raw({ type: 'application/json' }), (req, res) => {
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
  }

  res.json({ received: true });
});
```

Eventos principais: `transaction.captured`, `transfer.completed`, `payout.completed`, `qr.paid`, `refund.completed`.

### Idempotência

Todos os endpoints mutantes aceitam `Idempotency-Key`. Submeter a mesma chave duas vezes devolve a resposta original sem criar duplicado:

```typescript
const payment = await client.transactions.create({
  amountMinor:    5000,
  currency:       'AOA',
  idempotencyKey: 'order-12345-attempt-1',
});
```

### Referência de API Principal

| Categoria | Operações |
|---|---|
| Transacções | Criar, capturar, anular, listar, obter |
| Carteiras | Obter saldo, listar transacções |
| Transferências | Criar, listar |
| Códigos QR | Criar estático, criar dinâmico, descodificar, marcar como usado |
| Links de pagamento | Criar, obter, listar, cancelar |
| Pedidos de pagamento | Criar, obter, listar, pagar, recusar |
| Reembolsos | Criar, obter, listar |
| Disputas | Abrir, obter, listar |
| Levantamentos | Criar, obter, listar |
| Webhooks | Registar endpoint, listar eventos, listar entregas |

---

## 5. Arquitectura Técnica de Referência

Esta secção descreve a arquitectura técnica do Banzami — a implementação de referência. Não é o único modo válido de implementar o protocolo BANZA. É o modo que o Banzami escolheu. Outros operadores podem usar stacks diferentes, desde que passem o conformance suite.

As regras do protocolo que esta arquitectura implementa estão definidas em [BANZA_REFERENCE.md](../banza/BANZA_REFERENCE.md).

### Stack Tecnológico

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| Núcleo financeiro | **Rust** | Ledger, wallet, transaction, settlement, QR, risk, compliance |
| API layer | **Go** | Public APIs, admin APIs, webhook delivery, authentication, gateway |
| Frontend | **TypeScript + Next.js** | Merchant dashboard, admin, analytics, developer console |
| Mobile | **Flutter** | Banzami Wallet app, mobile SDK |
| Database | **PostgreSQL** | Single source of financial truth |
| Cache | **Redis** | Caching, rate limiting, idempotency, distributed locking |
| Observabilidade | **OpenTelemetry + Prometheus + Grafana** | Traces, metrics, structured logs |
| Infra | **Docker + Hetzner/OVH + Cloudflare** | Deployment model |

### Topologia de Serviços

```
Internet
     |
[Cloudflare]
     |
[Go API Gateway]  ← auth, rate limits, idempotency
     |
┌─────────────┬──────────────┐
│ public-api  │  admin-api   │
│ (Go)        │  (Go)        │
└──────┬──────┴──────┬───────┘
       |             |
    [Rust Core API]
       |
  [PostgreSQL]
```

O Go gateway é o dono da superfície pública. Para cada operação financeira, delega no Rust core-api via HTTP. O Rust é o único escritor das tabelas financeiras.

### Segurança

- TLS em todos os serviços
- Autenticação e autorização em cada endpoint
- Audit logging em todas as operações financeiras
- Chaves API secretas nunca no frontend ou mobile
- Separação de ambiente imposta ao nível da infraestrutura

As invariantes financeiras aplicadas pela arquitectura: ver [BANZA_REFERENCE.md §7](../banza/BANZA_REFERENCE.md).

### Observabilidade

Todos os serviços emitem traces OpenTelemetry com o atributo `deployment.environment`. Todos os movimentos de dinheiro são rastreáveis da origem ao destino.

---

## 6. Sandbox e Ambiente de Testes

### Dois Ambientes Completamente Isolados

| | **Sandbox** | **Live** |
|---|---|---|
| Prefixo de API key | `bz_test_…` | `bz_live_…` |
| Base URL | `https://sandbox-api.banzami.org` | `https://api.banzami.org` |
| Dinheiro | Virtual — sem fundos reais | Kwanza angolano real |
| Base de dados | Completamente separada | Completamente separada |

### Ferramentas Sandbox

```typescript
// Financiar carteira sandbox
await client.sandbox.fund({ amountMinor: 1000000, currency: 'AOA' });

// Simular pagamento
await client.sandbox.simulatePayment({ scenario: 'success', amountMinor: 50000 });
```

O ambiente sandbox nunca tem acesso a carris EMIS reais, credenciais de produção, ou dados de consumidores reais.

---

## 7. Missão e Posicionamento

### O que o Banzami é

**Posicionamento correcto do Banzami:**

- Angola's instant payment network (reference operator)
- QR-native payment experience built on BANZA
- Banzami é o operador de referência — BANZA é o protocolo
- "Powered by the BANZA protocol"

**Posicionamento incorrecto:**

- "Banzami é o protocolo" — Não. BANZA é o protocolo.
- "Banzami infraestrutura" — Não. A infraestrutura é BANZA.
- "Banzami ecosystem" — Não. O ecossistema é BANZA.

### O que o Banzami resolve

**Dependência de dinheiro físico** — o digital era mais complicado que as notas. O Banzami torna o digital mais rápido.

**Comprovativos por WhatsApp** — screenshots de transferências como prova. O Banzami elimina isto: quando um cliente faz o scan e paga, o comerciante recebe uma notificação criptograficamente confirmada. Sem screenshots.

**Ausência de SDK angolano** — programadores não tinham API de pagamentos nativa. O Banzami é a primeira infraestrutura construída especificamente para programadores angolanos.

**Exclusão de pequenos negócios** — TPA é caro e burocrático. Um QR impresso chega.

### Angola Primeiro

O Banzami foca-se PRIMEIRO em Angola:
- Angolanos consumidores
- Angolanos comerciantes
- O comércio angolano
- O Kwanza
- As realidades de pagamento angolanas

O modelo está provado: o Pix no Brasil, o UPI na Índia. Angola tem as mesmas pré-condições. O Banza é a infraestrutura. O Banzami é como Angola a acede.

---

## 8. Roadmap do Produto

### Curto prazo (H2 2026)

| Item | Descrição |
|---|---|
| PHP SDK v1 | SDK PHP estável para integrações server-side |
| Payout automatizado | Ciclos de payout T+1 automáticos |
| Integração acquiring | Integração EMIS para carregamento de carteiras |
| Grafana | Dashboards de observabilidade em produção |

### Médio prazo (H1 2027)

| Item | Descrição |
|---|---|
| Banzami Wallet mobile | App Flutter em produção |
| Banzami Business v2 | Analytics avançados, gestão de equipa, disputas |
| Go SDK | Cliente Go nativo |
| Plugin ecommerce | Plugin genérico para plataformas locais |

### Longo prazo (H2 2027+)

| Item | Descrição |
|---|---|
| Ecossistema de acquiring | Múltiplos fornecedores |
| Banzami no EMIS | Integração directa para transferências bancárias |

---

## 9. Declaração de Visão

### O que o comércio de Angola merece

O comércio de Angola merece infraestrutura que corresponda à sua energia. Não infraestrutura adaptada de um modelo estrangeiro. Infraestrutura construída aqui, para aqui.

### A Transformação

**Hoje:**
- Um comerciante não pode aceitar pagamentos digitais sem hardware caro
- Um consumidor fotografa transferências e envia via WhatsApp para provar compras
- Um programador angolano não tem SDK de pagamentos construído para o seu mercado

**Com o Banzami:**
- Um comerciante imprime um QR e aceita pagamentos instantâneos de qualquer smartphone
- Um consumidor faz o scan, confirma e paga em menos de 3 segundos — com recibo criptográfico
- Um programador integra o SDK e lança funcionalidade de pagamento em horas

### A Promessa

**Os pagamentos digitais em Angola devem ser instantâneos, acessíveis, integrados e utilizáveis por todos.**

Não para alguns comerciantes. Não para algumas aplicações.

Para cada cantina. Para cada táxi. Para cada escola, vendedor de mercado, site de ecommerce, plataforma de delivery e família.

Para Angola.

> **SCAN** → **CONFIRMAR** → **PAGO INSTANTANEAMENTE**

---

*Banzami é construído sobre o protocolo BANZA.*  
*BANZA é o protocolo. Banzami é como Angola paga.*  
*Banzami é o operador de referência da rede BANZA.*

---

**Referências:**

- ADR-025 — Hierarquia canónica de três níveis (supersede ADR-016)
- ADR-001 — Fronteira de serviços Go/Rust
- ADR-002 — Ledger de dupla entrada
- ADR-006 — Sistema de pagamento QR
- ADR-012 — Ecossistema SDK-first
- ADR-013 — Identidade wallet-native
- ADR-014 — Missão nacional Angola-first

Ver também:
- [BANZA_REFERENCE.md](../banza/BANZA_REFERENCE.md) — O protocolo BANZA
- [BANZAI_REFERENCE.md](../banzai/BANZAI_REFERENCE.md) — O BanzAI Protocol OS
- `docs/BANZA_REFERENCE.md` — Fonte de conteúdo do website banzami.org
