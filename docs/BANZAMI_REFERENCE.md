# Banzami — Documento de Referência Oficial

**Version:** 1.0  
**Date:** 2026-05-28  
**Status:** Official  
**Author:** Banzami

---

> **O Banzami constrói infraestrutura financeira programável.**  
> **O Banza é como Angola paga.**  
> Ferramentas determinam a verdade. A IA explica a verdade.

---

## Índice

1. [O que é o Banzami?](#1-o-que-é-o-banzami)
2. [Princípios Fundamentais](#2-princípios-fundamentais)
3. [Visão Geral do Ecossistema](#3-visão-geral-do-ecossistema)
4. [Arquitectura Técnica](#4-arquitectura-técnica)
5. [Governança](#5-governança)
6. [Modelo de Certificação](#6-modelo-de-certificação)
7. [Federação](#7-federação)
8. [BanzamIA](#8-banzamia)
9. [Para Programadores](#9-para-programadores)
10. [Para Comerciantes](#10-para-comerciantes)
11. [Para Consumidores](#11-para-consumidores)
12. [Segurança e Integridade Financeira](#12-segurança-e-integridade-financeira)
13. [Sandbox e Ambiente de Testes](#13-sandbox-e-ambiente-de-testes)
14. [Por que Angola. Por que Agora.](#14-por-que-angola-por-que-agora)
15. [Roadmap](#15-roadmap)
16. [Declaração de Visão](#16-declaração-de-visão)

---

## 1. O que é o Banzami?

**Banzami** é infraestrutura financeira programável de código aberto para Angola.

Não é um banco. Não é uma carteira digital simples. Não é uma plataforma fintech genérica adaptada de um modelo ocidental. É o protocolo que define como o dinheiro se move digitalmente em Angola — com regras imutáveis, invariantes financeiros verificáveis e uma camada de inteligência artificial que explica cada decisão do protocolo.

**Banza** é o produto principal do Banzami: a rede angolana de pagamentos instantâneos por QR Code. Wallet-native. QR-first. Construída para cada angolano.

> *Banzami constrói a infraestrutura. Banza move o dinheiro.*

### Arquitectura de dois níveis

```
Banzami (organização / protocolo / ecossistema)
├── Banza (produto principal de pagamento)
│   ├── Banza Wallet
│   ├── Banza Business
│   ├── Banza QR
│   ├── Banza Checkout
│   ├── Banza Pay Links
│   ├── Banza API
│   ├── Banza SDK
│   └── @banza (identidade de pagamento)
└── BanzamIA (inteligência de protocolo)
```

Esta arquitectura de marca está definida no ADR-016.

### Os quatro pilares do Banza

| Pilar | O que significa |
|-------|----------------|
| **Programmable** | Qualquer aplicação angolana integra pagamentos via SDK em horas. O Banza não é só uma app — é a camada de pagamentos de Angola. |
| **Wallet-native** | Cada conta é uma carteira em Kwanza. Pagamentos são transferências directas entre carteiras. Sem IBAN. Sem código bancário. |
| **QR-native** | A superfície principal de pagamento é um código QR. O comerciante imprime. O consumidor faz o scan. Instantâneo. Sem terminal. |
| **Instant settlement** | O dinheiro move-se no momento da confirmação — confirmado, liquidado e visível em segundos. |

### A experiência canónica

```
SCAN QR  →  CONFIRMAR  →  PAGO INSTANTANEAMENTE
```

**Tempo total: menos de 3 segundos.**

### O nome

**Banza** é uma palavra profundamente enraizada nas tradições linguísticas bantu de Angola, especialmente no universo Kikongo, onde *mbanza* designa historicamente um lugar de encontro — uma *banza* é um lugar, um centro de vida onde as pessoas se reúnem. O produto herda este significado: um espaço onde o comércio acontece, onde o valor circula.

**Banzami** parte dessa mesma raiz e constrói a infraestrutura que torna tudo isso possível. Um nome distintamente angolano — não uma palavra emprestada, não uma marca inventada noutro continente.

---

## 2. Princípios Fundamentais

### Ferramentas determinam a verdade. A IA explica a verdade.

Os invariantes financeiros são verificados por ferramentas determinísticas, não inferidos por inteligência artificial. A BanzamIA apresenta os resultados da execução de ferramentas — não substitui as ferramentas.

### A correcção financeira não é negociável

Cada decisão de engenharia é avaliada contra: "Isto preserva a correcção financeira?" A simplicidade operacional e a auditabilidade superam funcionalidades.

### O protocolo é o produto

O Banza (o produto de consumo) é a implementação de referência do protocolo Banzami. O protocolo é o que escala. O Banza é o que prova que funciona.

### Os operadores implementam política. O Kernel implementa o protocolo.

O Kernel Banzami impõe os invariantes financeiros. Os operadores aplicam as suas políticas de negócio dentro das restrições que o kernel impõe. Estas camadas nunca se colapsam.

### Rastreabilidade por defeito

Cada evento financeiro carrega um `trace_id`. Cada cadeia causal é reconstituível. Nenhum dinheiro se move sem uma entrada de ledger. Nenhuma entrada de ledger é alguma vez modificada.

### Angola primeiro

O Banzami serve um mercado de forma excecional antes de considerar expansão. O protocolo foi desenhado em torno do Kwanza, da lei comercial angolana, dos carris EMIS e do sector informal que representa a maioria do comércio angolano.

---

## 3. Visão Geral do Ecossistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                           BANZAMI                                    │
├──────────────────────────────┬──────────────────────────────────────┤
│      KERNEL BANZAMI           │            OPERADORES                │
│   (Núcleo Financeiro Rust)    │                                      │
│                               │  Operador de Referência (Banza)      │
│  ledger · wallets             │  Operador Sandbox                    │
│  transactions · transfers     │  Futuros operadores de terceiros      │
│  settlement · reconciliation  │                                      │
│  payouts · qr                 ├──────────────────────────────────────┤
│  payment-links · identity     │         CERTIFICAÇÃO                 │
│  consumer-wallets · acquiring │                                      │
│  risk · compliance · routing  │  Nível 0 — Sandbox                   │
│  merchants · jobs · types     │  Nível 1 — Pagamentos Base           │
│  (18 crates Rust)             │  Nível 2 — Pagamentos Avançados      │
│                               │  Nível 3 — Protocolo Completo        │
│                               │  Nível 4 — Operador de Infraestrutura│
├──────────────────────────────┴──────────────────────────────────────┤
│                          BANZAMIA                                    │
│              (Inteligência de Protocolo nativa de IA)                │
│                                                                      │
│  Chat · Construtor de Operadores · Conformidade · Validador          │
│  Trace Explainer · SDK Assistant · RFC/ADR Explorer · Knowledge      │
├─────────────────────────────────────────────────────────────────────┤
│                           SDKs                                       │
│          TypeScript · Flutter/Dart · PHP · Go (interno)              │
├─────────────────────────────────────────────────────────────────────┤
│                        APLICAÇÕES                                    │
│  Banza (mobile) · Banza Business · Checkout · Docs · Admin           │
└─────────────────────────────────────────────────────────────────────┘
```

### Kernel Banzami

O Kernel Banzami é o núcleo financeiro escrito em Rust. É composto por 18 crates com responsabilidades rigorosamente separadas:

| Crate | Responsabilidade |
|-------|-----------------|
| `ledger` | Motor de ledger de dupla entrada — append-only, balanceado, atómico |
| `wallets` | Ciclo de vida de carteiras de comerciantes |
| `consumer-wallets` | Ciclo de vida de carteiras de consumidores |
| `transactions` | Estado de máquina de transacções |
| `transfers` | Transferências wallet-to-wallet |
| `settlement` | Liquidação T+0 e ciclos de payout |
| `reconciliation` | Reconciliação automatizada |
| `payouts` | Saídas para contas bancárias |
| `qr` | Sistema QR estático e dinâmico |
| `payment-links` | Pagamentos pull via URL |
| `identity` | Handle @banza, registo e unicidade |
| `acquiring` | Integração EMIS/Multicaixa |
| `risk` | Motor de avaliação de risco |
| `compliance` | Regras de conformidade regulatória |
| `routing` | Encaminhamento de pagamentos |
| `merchants` | Gestão de comerciantes |
| `jobs` | Processamento de jobs em background |
| `types` | Tipos financeiros partilhados |

### Operadores

Um Operador é qualquer entidade que implementa o protocolo Banzami para processar pagamentos.

Os operadores:
- Declaram capacidades num Manifesto de Operador
- Implementam os requisitos de conformidade para o seu nível de certificação
- Operam dentro do framework de invariantes
- Estão sujeitos a verificação de certificação periódica

**Operador de Referência:** O Banza é a implementação de referência do protocolo completo. Todos os comportamentos do protocolo estão validados contra o Operador de Referência.

**Operador Sandbox:** Ambiente de desenvolvimento e testes totalmente isolado. Mesmo kernel, dados fictícios, sem carris de liquidação reais.

---

## 4. Arquitectura Técnica

### Stack tecnológico

| Camada | Tecnologia | Justificação |
|--------|-----------|-------------|
| Núcleo financeiro | Rust | Segurança de memória, performance determinística, sistema de tipos para dinheiro |
| Orquestração | Go | Simplicidade operacional, concorrência, padrões HTTP gateway |
| Frontend | Next.js (TypeScript) | SSR, performance, ecossistema developer |
| Mobile | Flutter/Dart | Codebase única para Android/iOS, performance nativa |
| Base de dados | PostgreSQL | Garantias ACID, correcção financeira |
| Cache / filas | Redis | Rate limiting, chaves de idempotência, sessões |
| Observabilidade | OpenTelemetry | Traces, métricas e logs vendor-neutral |

### Topologia de serviços

```
Internet
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│              Camada de Serviços Go                          │
│                                                             │
│  api-gateway (:8080)  public-api (:8083)  admin-api (:8082) │
│  • Auth JWT           • Ops consumidor   • Ops admin        │
│  • Rate limiting      • Sandbox API      • Gestão merchant  │
│  • Idempotência       • Push notifs      • Relatórios       │
│  • Webhooks                                                 │
└─────────────────────────────────────────────────────────────┘
                │ HTTP (loopback)
                ▼
┌─────────────────────────────────────────────────────────────┐
│              Rust Core API (interno — nunca exposto)        │
│              18 crates — único escritor das tabelas         │
│              financeiras                                    │
└─────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│         PostgreSQL (única fonte de verdade financeira)      │
└─────────────────────────────────────────────────────────────┘
```

O Go gateway é o dono da superfície pública (auth, rate limits, idempotência). Para cada operação financeira, delega no Rust core-api via HTTP. O Rust é o único escritor das tabelas financeiras. O Go nunca escreve directamente em tabelas financeiras.

### O ledger de dupla entrada

Cada operação financeira produz entradas de ledger. O ledger é:

- **Append-only** — as entradas nunca são modificadas ou eliminadas (INV-LEDGER-002)
- **Balanceado** — cada posting tem débitos e créditos iguais (INV-LEDGER-001)
- **Integer-only** — os montantes são armazenados como i64 minor units, nunca vírgula flutuante (INV-LEDGER-003)
- **Atómico** — postings parciais nunca persistem (INV-LEDGER-004)

O fluxo canónico de um pagamento QR:

```
Carteira consumidor (DÉBITO)
    ├── Carteira comerciante (CRÉDITO) — montante líquido
    └── Carteira de taxas (CRÉDITO)   — taxa

gross_minor = net_minor + fee_minor  [INV-STL-001]
```

### Invariantes financeiros

Os invariantes financeiros são afirmações não negociáveis que nunca podem ser violadas. São impostos em múltiplas camadas:

| Camada | Mecanismo |
|--------|-----------|
| Compilação | Sistema de tipos Rust (MoneyAmount, não f64) |
| Esquema | Constraints de base de dados |
| Runtime | Lógica de aplicação |
| CI | Testes de integração automáticos |
| Observabilidade | BanzamIA + Validation Studio |

Famílias de invariantes principais:

| Família | Exemplos |
|---------|---------|
| `INV-LEDGER-*` | Dupla entrada, imutabilidade, sem vírgula flutuante |
| `INV-WALLET-*` | Saldo consistente, sem negativos |
| `INV-STL-*` | gross = net + fee, sem criação de dinheiro |
| `INV-TRACE-*` | Completude da rastreabilidade |
| `INV-QR-*` | Ciclo de vida do QR |
| `INV-IDENT-*` | Unicidade de handle |

Ver `docs/validation/INVARIANT_TAXONOMY.md` para o registo completo.

### Sistema de rastreabilidade

Cada fluxo de pagamento produz um `trace_id`. O trace captura:

```
qr.created
    ↓
transfer.initiated
    ↓
ledger.debit
    ↓
ledger.credit (merchant)
ledger.credit (fees)
    ↓
transfer.completed
    ↓
qr.paid
    ↓
settlement.assigned
```

Os traces são a ferramenta de auditoria primária. O módulo Trace Explainer da BanzamIA reconstrói e verifica qualquer trace interactivamente.

---

## 5. Governança

### RFCs (Request for Comments)

Os RFCs governam decisões ao nível do protocolo: invariantes financeiros, fluxos de pagamento, contratos de API, requisitos de operadores, protocolos de federação.

Um RFC é obrigatório para:
- Qualquer alteração ao conjunto de invariantes financeiros
- Qualquer alteração ao protocolo de fluxo de pagamento
- Qualquer novo nível de certificação
- Qualquer adição de capacidade de operador
- Design do protocolo de federação

Os RFCs são numerados sequencialmente e imutáveis após aceitação.

### ADRs (Architecture Decision Records)

Os ADRs governam decisões de implementação: escolhas tecnológicas, fronteiras de serviços, arquitectura de SDK, arquitectura de marca, modelo de identidade.

ADRs actuais: ADR-001 a ADR-017. Ver `docs/adr/` para a lista completa.

### Validation Matrix

O `docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json` é a fonte de verdade para o progresso de implementação. Rastreia:
- Critérios de aceitação por funcionalidade
- Estado de invariantes financeiros por funcionalidade
- Atribuição de domínio de validação
- Referências de evidência
- Pontuações de confiança
- Histórico de auditoria imutável

Alterações à matrix requerem frases de governança com verificação de fingerprint. A IA nunca modifica a matrix sem aprovação explícita.

### Domínios de validação

| Domínio | Âmbito |
|---------|--------|
| `DOM-FIN` | Integridade financeira (ledger, wallets, liquidação) |
| `DOM-IDENTITY` | Carteira e identidade de consumidor |
| `DOM-CONSUMER` | Experiência do consumidor (QR, payment links) |
| `DOM-MERCHANT` | Experiência do comerciante |
| `DOM-DEVELOPER` | Experiência do programador (SDK, API) |
| `DOM-INFRA` | Infraestrutura operacional |
| `DOM-SECURITY` | Segurança e autenticação |
| `DOM-COMPLIANCE` | Conformidade regulatória |

---

## 6. Modelo de Certificação

### Níveis de certificação

A certificação é obtida passando no conformance suite para o nível correspondente.

| Nível | Nome | Capacidades necessárias | Descrição |
|-------|------|------------------------|-----------|
| **0** | Sandbox Certificado | Operações básicas sandbox | Pode operar em sandbox; sem certificação live |
| **1** | Pagamentos Base | wallet.consumer, wallet.merchant, qr.static, p2p.transfer | QR básico e operações de carteira |
| **2** | Pagamentos Avançados | Nível 1 + qr.dynamic, payment_links, settlement.t0 | QR dinâmico, payment links, liquidação instantânea |
| **3** | Protocolo Completo | Nível 2 + payout.batch, reconciliation | Ciclo de vida completo de pagamento |
| **4** | Operador de Infraestrutura | Nível 3 + acquiring.emis, federation_ready | Operador de grau de infraestrutura |

### Processo de certificação

```
1. Operador submete Manifesto → declara nível alvo
        ↓
2. BanzamIA Manifest Validator → valida estrutura do manifesto
        ↓
3. Operador executa conformance suite para o seu nível
        ↓
4. BanzamIA Conformance → verifica resultados dos testes
        ↓
5. Invariantes financeiros verificados para todas as capacidades declaradas
        ↓
6. Certificação emitida como artefacto assinado
        ↓
7. Certificação registada no registo público de operadores
```

### Manifesto de Operador

```json
{
  "operator_id": "op_example_001",
  "version": "1.0.0",
  "certification_level": 2,
  "capabilities": [
    "wallet.consumer",
    "wallet.merchant",
    "qr.static",
    "qr.dynamic",
    "p2p.transfer",
    "payment_links",
    "settlement.t0"
  ],
  "invariants_asserted": [
    "INV-LEDGER-001",
    "INV-LEDGER-002",
    "INV-STL-001",
    "INV-STL-002"
  ],
  "environment": "LIVE",
  "sandbox_available": true
}
```

### Manutenção de certificação

As certificações são vinculadas a versões:
- Actualizações major do protocolo requerem re-certificação
- Verificação automática de invariantes mensal
- Spot-checks de conformidade trimestrais
- As certificações expiram após 12 meses sem re-verificação

---

## 7. Federação

### Estado actual

O Banzami não suporta actualmente federação (encaminhamento entre operadores). Todos os pagamentos são processados pelo operador de referência Banza.

As capacidades de fundação foram desenhadas para permitir federação:
- Propagação de `trace_id` através de fronteiras de serviço
- Declaração de manifesto de operador
- Arquitectura de encaminhamento baseada em capacidades
- Isolamento de liquidação entre operadores

### Arquitectura de federação (planeada)

A federação permite o encaminhamento de pagamentos entre operadores certificados:

```
Consumidor A (Operador X) → pagamento → Consumidor B (Operador Y)
                                ↓
                    Camada de Federação Banzami
                    (encaminhamento, liquidação, invariantes)
```

Requisitos para federação:
- Ambos os operadores com Certificação Nível 3+
- Conta de liquidação partilhada com Banzami
- Manifesto de federação com capacidades de encaminhamento
- Propagação cross-operador de trace_id
- Liquidação atómica cross-operador no ledger

### Roadmap de federação

| Marco | Descrição | Alvo |
|-------|-----------|------|
| RFC de federação | Definir protocolo inter-operadores | H1 2027 |
| Operadores piloto | Dois operadores em federação controlada | H2 2027 |
| Federação aberta | Qualquer operador Nível 4 pode federar | 2028 |

---

## 8. BanzamIA

### O que é a BanzamIA

A BanzamIA é a interface nativa de IA para construir, validar e certificar operadores Banzami. Está disponível em `banzami.org/banzamia`.

> Ferramentas determinam a verdade. A IA explica a verdade.

A BanzamIA não substitui ferramentas determinísticas. Ela:
- Explica a documentação do protocolo fundamentada em citações
- Apresenta resultados de execução de ferramentas em linguagem natural
- Guia operadores no processo de integração
- Valida manifestos e resultados de conformidade

### Módulos

| Módulo | Descrição |
|--------|-----------|
| **Chat** | Q&A sobre o protocolo, fundamentado em citações de RFC e ADR |
| **Construtor de Operadores** | Criação guiada de manifesto de operador |
| **Conformidade** | Runner de testes de conformidade e análise de resultados |
| **Validador de Manifesto** | Validação estrutural e semântica de manifestos |
| **Trace Explainer** | Reconstrução de linha temporal causal e verificação de invariantes |
| **SDK Assistant** | Geração de código e orientação de integração SDK |
| **RFC/ADR Explorer** | Pesquisa e explicação de documentos de governança |
| **Knowledge Search** | Pesquisa semântica sobre documentação do protocolo |

### Postura de segurança

A BanzamIA é read-only. Não pode:
- Iniciar operações financeiras
- Modificar a validation matrix sem frases de governança
- Aprovar certificações de forma autónoma

Cita fontes para todas as afirmações sobre o protocolo. Delega decisões de certificação às ferramentas.

---

## 9. Banza para Programadores

### Integração em horas

O Banza SDK é a forma recomendada de integrar pagamentos Banzami. SDKs oficiais:

| SDK | Pacote | Casos de uso |
|-----|--------|-------------|
| TypeScript | `@banza/sdk` | Web, Node.js, backends |
| Flutter/Dart | `banzami_sdk` | Apps mobile Android/iOS |
| PHP | `banza/sdk` | Backends PHP/Laravel |

### Exemplo: TypeScript

```typescript
import { BanzaClient } from '@banza/sdk';

const client = new BanzaClient({
  apiKey:      'bz_test_…',
  environment: 'sandbox',
});

// Criar QR dinâmico para receber pagamento
const qr = await client.qr.createDynamic({
  amountMinor: 250000, // 2.500 Kz
  currency:    'AOA',
  description: 'Refeição #42',
  expiresAt:   new Date(Date.now() + 15 * 60 * 1000),
});

console.log(qr.payload); // payload para renderizar como QR
```

### Exemplo: Flutter

```dart
final client = BanzaClient(
  apiKey:      'bz_test_…',
  environment: BanzamiEnvironment.sandbox,
);

final qr = await client.qr.createDynamic(
  amountMinor: 250000,
  currency:    'AOA',
  description: 'Refeição #42',
);
```

### Webhooks

Todos os eventos de pagamento são entregues via webhooks com assinatura HMAC-SHA256:

```typescript
// Verificar assinatura
const isValid = client.webhooks.verify(
  rawBody,
  request.headers['banza-signature'],
  webhookSecret,
);
```

Eventos principais: `transaction.captured`, `transfer.completed`, `payout.completed`, `qr.paid`.

### Idempotência

Todos os endpoints mutantes aceitam `Idempotency-Key`. Submeter a mesma chave duas vezes devolve a resposta original sem criar duplicado:

```typescript
const payment = await client.transactions.create({
  amountMinor:    5000,
  currency:       'AOA',
  idempotencyKey: 'order-12345-attempt-1',
});
```

### Sandbox

O ambiente sandbox permite testar todos os fluxos sem dinheiro real:

```typescript
// Financiar carteira sandbox
await client.sandbox.fund({ amountMinor: 1000000, currency: 'AOA' });

// Simular pagamento
await client.sandbox.simulatePayment({ scenario: 'success', amountMinor: 50000 });
```

Ver `docs/sandbox/README.md` para referência completa.

---

## 10. Banza para Comerciantes

### Sem hardware. Sem burocracia.

Um comerciante precisa de:
1. Uma conta Banza Business
2. Um código QR impresso

Não precisa de: TPA, contrato bancário especial, hardware adicional.

### QR estático vs dinâmico

| Tipo | Uso | Montante |
|------|-----|---------|
| **QR estático** | Balcão, cantina, serviço com preço fixo | O consumidor introduz o montante |
| **QR dinâmico** | Cada transacção com montante específico | Codificado no QR |

### Liquidação T+0

O montante líquido é creditado na carteira do comerciante imediatamente após a confirmação do pagamento. Não há espera de dias bancários.

### Banza Business

O dashboard do Banza Business oferece:
- Saldo em tempo real
- Histórico completo de transacções
- QR generator (estático e dinâmico)
- Relatórios de reconciliação
- Gestão de pagamentos pendentes
- Payout para conta bancária

### Payment Links

Para vendas online, WhatsApp ou redes sociais:

```
https://pay.banza.ao/l/abc123
```

O cliente clica, confirma e paga. Sem integração técnica necessária.

---

## 11. Para Consumidores

### Banza Wallet

Cada consumidor tem uma carteira em Kwanza identificada pelo seu @banza.

- **Carregar saldo** via integração bancária ou rede de agentes
- **Pagar por QR** — scan, confirmar, pago
- **Transferir** para qualquer @banza
- **Histórico** completo e instantâneo

### Identidade @banza

Cada pessoa tem um @banza — um endereço de pagamento legível por humanos:

```
Pagar: @maria.luanda
Valor: 1.500 Kz
```

Sem IBAN. Sem número de conta. Sem código de referência.

### Segurança do consumidor

- Autenticação por PIN (nunca password) + JWT
- Cada dispositivo tem um registo de device único
- Todas as transacções são criptograficamente assinadas
- Notificações push em tempo real para cada movimento

---

## 12. Segurança e Integridade Financeira

### Camadas de segurança

```
Consumidor/Comerciante
        ↓
API Gateway (JWT, rate limiting, CORS)
        ↓
Rust Core (invariantes financeiros, validação de estado)
        ↓
PostgreSQL (constraints de esquema, transacções ACID)
```

### Invariantes críticos

Todos os invariantes de severidade `CRITICAL` são impostos em múltiplas camadas simultaneamente:

| Invariante | Descrição | Gravidade |
|------------|-----------|-----------|
| INV-LEDGER-001 | Débitos = Créditos em cada posting | CRITICAL |
| INV-LEDGER-002 | Entradas de ledger são imutáveis | CRITICAL |
| INV-LEDGER-003 | Montantes são i64, nunca float | CRITICAL |
| INV-STL-001 | gross = net + fee (sem criação de dinheiro) | CRITICAL |
| INV-STL-002 | Saldos nunca negativos | CRITICAL |
| INV-IDENT-001 | @banza handles são únicos globalmente | CRITICAL |

### Observabilidade

Todos os serviços emitem traces OpenTelemetry com o atributo `deployment.environment` em cada evento. Todos os movimentos de dinheiro são rastreáveis da origem ao destino.

### Separação de ambiente

O ambiente SANDBOX nunca tem acesso a:
- Carris EMIS ou outros carris bancários reais
- Credenciais de produção
- Dados de consumidores reais

A separação é imposta ao nível da infraestrutura e não pode ser contornada em runtime.

---

## 13. Sandbox e Ambiente de Testes

### Dois ambientes completamente isolados

| | **Sandbox** | **Live** |
|---|---|---|
| Prefixo de API key | `bz_test_…` | `bz_live_…` |
| Base URL | `https://sandbox-api.banzami.org` | `https://api.banzami.org` |
| Dinheiro | Virtual — sem fundos reais | Kwanza angolano real |
| Base de dados | Completamente separada | Completamente separada |

### Ferramentas sandbox

- **Financiar carteira** — creditar saldo virtual via API ou in-app
- **Simular pagamento** — injectar transacção sintética para testar webhooks
- **Testar QR** — criar e pagar QRs no ambiente controlado
- **Testar payouts** — ciclo PENDING → PROCESSING → COMPLETED em segundos

Ver `docs/sandbox/README.md` para referência completa.

---

## 14. Por que Angola. Por que Agora.

Angola não precisa de copiar o modelo de pagamentos de outro país. Angola precisa do seu — construído para o Kwanza, para o QR, para o smartphone em cada bolso.

### O problema que o Banza resolve

- **Dependência de dinheiro físico** — o digital é mais complicado que as notas. O Banza torna o digital mais rápido.
- **Comprovativos por WhatsApp** — screenshots de transferências como prova de pagamento. O Banza elimina isto.
- **Ausência de SDK angolano** — programadores angolanos não tinham API de pagamentos nativa. O Banza resolve.
- **Exclusão de pequenos negócios** — TPA é caro e burocrático. Um QR impresso chega.

### A oportunidade

Angola tem penetração móvel crescente, uma geração de programadores prontos, e um sector informal que representa a maioria do comércio — que nunca foi bem servido pelas soluções de pagamento existentes.

O modelo está provado: o Pix no Brasil, o UPI na Índia, o M-Pesa em Moçambique. Angola tem as mesmas pré-condições. O Banza é a infraestrutura.

### O salto tecnológico

Angola tem a oportunidade de saltar a fase da infraestrutura de cartões. Pode ir directamente para wallet-native, QR-first, liquidação instantânea. Não repete um desvio de 40 anos — começa no destino.

---

## 15. Roadmap

### Curto prazo (H2 2026)

| Item | Descrição |
|------|-----------|
| Conformance Suite v1 | Suite de testes executável para Níveis 1–3 |
| Certificação Nível 1–2 | Primeiros operadores externos certificados |
| BanzamIA Live API | API BanzamIA em produção com Qdrant vector store |
| PHP SDK v1 | SDK PHP estável para integrações server-side |
| Payout automatizado | Ciclos de payout T+1 automáticos |
| Integração acquiring | Integração EMIS para pagamentos por cartão |

### Médio prazo (H1 2027)

| Item | Descrição |
|------|-----------|
| Certificação Nível 3–4 | Protocolo completo e certificação de infraestrutura |
| Operadores de terceiros | Primeiros operadores externos no protocolo |
| RFC de federação | Especificação de encaminhamento inter-operadores |
| BanzamIA Knowledge API | Pesquisa semântica sobre toda a documentação do protocolo |
| Portal de certificação | Certificação self-service |

### Longo prazo (H2 2027+)

| Item | Descrição |
|------|-----------|
| Piloto de federação | Dois operadores em federação controlada |
| Federação aberta | Qualquer operador Nível 4 pode federar |
| Ecossistema de acquiring | Múltiplos fornecedores de acquiring |
| Carris cross-border | AOA ↔ outras moedas africanas |

---

## 16. Declaração de Visão

### O que o comércio de Angola merece

O comércio de Angola merece infraestrutura que corresponda à sua energia.

Não infraestrutura adaptada de um modelo estrangeiro que nunca foi concebido para o Kwanza, para comerciantes informais ou para pagamentos QR-native. Não infraestrutura dependente de redes estrangeiras, aprovação estrangeira ou preços estrangeiros.

Infraestrutura construída aqui. Para aqui.

**Isso é o Banza — construído pelo Banzami.**

### A transformação

**Hoje:**
- Um comerciante não pode aceitar pagamentos digitais sem hardware caro
- Um consumidor fotografa transferências bancárias e envia via WhatsApp para provar compras
- Um programador angolano não tem SDK de pagamentos construído para o seu mercado
- Uma cantina não tem escolha senão dinheiro físico

**Amanhã — com o Banza:**
- Um comerciante imprime um QR e aceita pagamentos instantâneos de qualquer smartphone
- Um consumidor faz o scan, confirma e paga em menos de 3 segundos — com recibo criptográfico
- Um programador integra o Banza SDK e lança funcionalidade de pagamento em horas
- Uma cantina tem Banza Wallet, Banza Business e visibilidade total sobre cada transacção

### Por que isto importa para além do comércio

Os pagamentos não são apenas transacções. São confiança.

Quando um pagamento é instantâneo e confirmado, ambas as partes podem avançar sem dúvida. Quando um recibo é digital e permanente, não há disputa sobre o que foi acordado. Quando uma carteira é sempre acessível, a capacidade de participar na vida económica não é restringida pela geografia ou pelo acesso bancário formal.

O Banza torna a economia angolana mais líquida, mais transparente e mais acessível — não substituindo o que existe, mas completando o que falta.

### A promessa

Cada decisão de engenharia, cada escolha de produto e cada design no Banza reflecte um compromisso do Banzami:

**Os pagamentos digitais em Angola devem ser instantâneos, acessíveis, integrados e utilizáveis por todos.**

Não para alguns comerciantes. Não para algumas aplicações.

Para cada cantina. Para cada táxi. Para cada escola, vendedor de mercado, site de ecommerce, plataforma de delivery e família.

Para Angola.

```
   SCAN   →   CONFIRMAR   →   PAGO INSTANTANEAMENTE
```

---

*Banza — O sistema de pagamentos instantâneos de Angola. Wallet-native. QR-first. Construído para cada angolano.*  
*Banzami — A infraestrutura que permite Angola pagar digitalmente.*

---

**Referências:**

- ADR-001 — Fronteira de serviços Go/Rust
- ADR-002 — Ledger de dupla entrada
- ADR-006 — Sistema de pagamento QR
- ADR-012 — Ecossistema SDK-first
- ADR-013 — Identidade wallet-native
- ADR-014 — Missão nacional Angola-first
- ADR-016 — Arquitectura de marca Banzami/Banza
- `docs/architecture/BANZAMI_ECOSYSTEM_REFERENCE.md` — Referência técnica completa
- `docs/validation/INVARIANT_TAXONOMY.md` — Registo completo de invariantes
- `docs/sandbox/README.md` — Referência do ambiente sandbox
- `docs/glossary.md` — Glossário de termos
