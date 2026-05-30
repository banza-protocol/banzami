# Banzami — Product Catalogue

> This document describes: **Banzami** — the reference operator implementation.
> For other layers: [BANZA](../banza/BANZA_REFERENCE.md) · [BanzAI](../banzai/BANZAI_REFERENCE.md)

**Version:** 1.0  
**Date:** 2026-05-30  
**Status:** Official  
**Authority:** ADR-025

---

## Posicionamento

O Banzami é a implementação de referência do protocolo BANZA — o primeiro operador certificado e o maior. Não é o dono do protocolo.

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

Para a arquitectura do protocolo que estes produtos implementam, ver [BANZA_REFERENCE.md](../banza/BANZA_REFERENCE.md).

---

## Catálogo de Produtos

| Produto | Para quem | O que oferece |
|---|---|---|
| **Banzami Wallet** | Consumidores | Carteira em Kwanza, QR payments, transferências P2P @banza |
| **Banzami Business** | Comerciantes | Dashboard operacional, QR, payment links, analytics, levantamentos |
| **Banzami Checkout** | Programadores | Experiência de checkout hosted para integração rápida |
| **Banzami Pay Links** | Comerciantes | Links de pagamento partilháveis por WhatsApp, email, e redes sociais |
| **Banzami SDK** | Programadores | TypeScript, Flutter, PHP SDKs para integração em horas |
| **Banzami API** | Programadores | API REST versionada e idempotente para todas as operações |

---

## Banzami Wallet — Para Consumidores

### O que é

A Banzami Wallet é a carteira digital do consumidor angolano — a forma como qualquer angolano acede à rede de pagamentos BANZA.

### Funcionalidades

**@banza handle identity**

Cada conta Banzami tem um @handle único. Os pagamentos são dirigidos a um handle — não a um número de conta, IBAN, ou número de telefone.

```
Enviar para: @maria_cantina
```

**QR Payments**

O consumidor escaneia o QR de qualquer comerciante Banzami e paga instantaneamente. O QR pode ser estático (valor variável) ou dinâmico (valor fixo).

```
SCAN QR → CONFIRM → PAGO EM < 3 SEGUNDOS
```

**Transferências P2P**

Transferências instantâneas para qualquer @handle na rede Banzami. Sem comprovativos por WhatsApp. Sem confirmação manual.

**Funding da Carteira**

Via integração com o banco do consumidor (Multicaixa Express, EMIS) ou via topo-up em pontos de carregamento.

### O que a Banzami Wallet NÃO é

- Não é um banco
- Não usa cartões de débito ou crédito
- Não pede IBAN ou dados bancários para pagamentos

---

## Banzami Business — Para Comerciantes

### O que é

O Banzami Business é a solução completa para comerciantes — desde uma cantina de bairro que imprime um QR, até uma plataforma de ecommerce que integra a API.

### QR para Comerciantes

**QR Estático**

Impresso e fixo. Qualquer valor. O consumidor define o montante no momento do pagamento.

```
Uso: cantinas, mercados, restaurantes, pequenos negócios
```

**QR Dinâmico**

Gerado por transacção. Valor e referência pré-definidos. Use único — expira após pagamento.

```
Uso: POS, caixas de restaurante, checkout em loja
```

**QR de Payment Link**

URL partilhável como QR. O consumidor abre a URL no telemóvel e paga.

### Dashboard Operacional (Web)

- Visão em tempo real de todas as transacções
- Analytics de volume, conversão, e receita
- Gestão de levantamentos para conta bancária
- Gestão de disputas e reembolsos
- Configuração de endpoints de webhook
- Gestão de API keys (sandbox e live)

### Interface Mobile (Flutter)

- Geração de QR para receber pagamento
- Notificação de pagamento recebido em tempo real
- Histórico de transacções
- Gestão básica de conta

### Payment Links

Links de pagamento partilháveis por qualquer canal — WhatsApp, email, Instagram, SMS:

```
https://pay.banzami.com/a3f7c2d19b40

Descrição: "Mesa 5 — Almoço"
Montante: 4.500 Kz
```

O consumidor abre o link, confirma, e paga. O comerciante recebe notificação imediata.

---

## Banzami SDK — Para Programadores

### TypeScript SDK

```typescript
import { BanzaClient } from '@banza/sdk';

const client = new BanzaClient({
  apiKey:      'bz_test_…',
  environment: 'sandbox',
});

// Criar QR dinâmico
const qr = await client.qr.createDynamic({
  amountMinor: 250000, // 2.500 Kz (sempre inteiros — MON-001)
  currency:    'AOA',
  description: 'Refeição #42',
  expiresAt:   new Date(Date.now() + 15 * 60 * 1000),
});

console.log(qr.payload); // payload para renderizar como QR
```

### Flutter SDK

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

### SDKs Disponíveis

| SDK | Ambiente | Estado |
|-----|---------|-------|
| `@banza/sdk` (TypeScript/Node.js) | Server-side | Disponível |
| `banza_flutter` | Mobile (iOS + Android) | Disponível |
| `banza/sdk-php` | Server-side | Em desenvolvimento |
| `banza-go` | Server-side | Planeado |
| `banza-python` | Server-side | Planeado |

**Regra de segurança:** Secret API keys (`bz_live_…`) NUNCA devem ser usadas em frontend, browser, ou código mobile. Use sempre um servidor intermediário.

---

## Banzami API — Referência

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

## Sandbox e Ambiente de Testes

### Dois Ambientes Completamente Isolados

| | **Sandbox** | **Live** |
|---|---|---|
| Prefixo de API key | `bz_test_…` | `bz_live_…` |
| Base URL | `https://sandbox-api.banzami.com` | `https://api.banzami.com` |
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

## Posicionamento Correcto vs. Incorrecto

**Posicionamento correcto do Banzami:**

- Angola's instant payment network (reference operator)
- QR-native payment experience built on BANZA
- Banzami é o operador de referência — BANZA é o protocolo
- "Powered by the BANZA protocol"

**Posicionamento incorrecto:**

- "Banzami é o protocolo" — Não. BANZA é o protocolo.
- "Banzami infraestrutura" — Não. A infraestrutura é BANZA.
- "Banzami ecosystem" — Não. O ecossistema é BANZA.

---

**Referências:**

- [BANZAMI_REFERENCE.md §2–4](BANZAMI_REFERENCE.md) — Fonte canónica deste catálogo
- [BANZA_CERTIFICATION.md](../banza/BANZA_CERTIFICATION.md) — Certification requirements (Banzami operates at Level 2)
- [BANZAMI_ARCHITECTURE.md](BANZAMI_ARCHITECTURE.md) — Technical implementation
- [BANZAMI_ROADMAP.md](BANZAMI_ROADMAP.md) — Upcoming product features
