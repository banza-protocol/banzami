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
5. [Representação Monetária](#5-representação-monetária)
6. [Governança](#6-governança)
7. [Modelo de Certificação](#7-modelo-de-certificação)
8. [Federação](#8-federação)
9. [BanzamIA](#9-banzamia)
10. [Banza para Programadores](#10-banza-para-programadores)
11. [Banza para Comerciantes](#11-banza-para-comerciantes)
12. [Para Consumidores](#12-para-consumidores)
13. [Segurança e Integridade Financeira](#13-segurança-e-integridade-financeira)
14. [Sandbox e Ambiente de Testes](#14-sandbox-e-ambiente-de-testes)
15. [Por que Angola. Por que Agora.](#15-por-que-angola-por-que-agora)
16. [Roadmap](#16-roadmap)
17. [Declaração de Visão](#17-declaração-de-visão)

---

## 1. O que é o Banzami?

**Banzami** é infraestrutura financeira programável de código aberto para Angola.

Não é um banco. Não é uma carteira digital simples. Não é uma plataforma fintech genérica adaptada de um modelo ocidental. É o protocolo que define como o dinheiro se move digitalmente em Angola — com regras imutáveis, invariantes financeiros verificáveis e uma camada de inteligência artificial que explica cada decisão do protocolo.

**Banza** é o produto principal do Banzami: a rede angolana de pagamentos instantâneos por QR Code. Wallet-native. QR-first. Construída para cada angolano.

> *Banzami constrói a infraestrutura. Banza move o dinheiro.*

### Arquitectura de dois níveis

![Arquitectura de dois níveis — Banzami (protocolo) ramifica em Banza (produto) e BanzamIA (inteligência)](/images/architecture/brand-architecture.svg)

Esta arquitectura de marca está definida no ADR-016.

### Os quatro pilares do Banza

| Pilar | O que significa |
|-------|----------------|
| **Programmable** | Qualquer aplicação angolana integra pagamentos via SDK em horas. O Banza não é só uma app — é a camada de pagamentos de Angola. |
| **Wallet-native** | Cada conta é uma carteira em Kwanza. Pagamentos são transferências directas entre carteiras. Sem IBAN. Sem código bancário. |
| **QR-native** | A superfície principal de pagamento é um código QR. O comerciante imprime. O consumidor faz o scan. Instantâneo. Sem terminal. |
| **Instant settlement** | O dinheiro move-se no momento da confirmação — confirmado, liquidado e visível em segundos. |

### A experiência canónica

**SCAN QR** → **CONFIRMAR** → **PAGO INSTANTANEAMENTE**

**Tempo total: menos de 3 segundos.**

### O nome

**Banza** é uma palavra profundamente enraizada nas tradições linguísticas bantu de Angola, especialmente no universo Kikongo, onde *mbanza* designa historicamente um lugar de encontro — uma *banza* é um lugar, um centro de vida onde as pessoas se reúnem. O produto herda este significado: um espaço onde o comércio acontece, onde o valor circula.

**Banzami** parte dessa mesma raiz e constrói a infraestrutura que torna tudo isso possível. Um nome distintamente angolano — não uma palavra emprestada, não uma marca inventada noutro continente.

---

## 2. Princípios Fundamentais

### Ferramentas determinam a verdade. A IA explica a verdade.

Os invariantes financeiros são verificados por ferramentas determinísticas, não inferidos por inteligência artificial. O BanzamIA apresenta os resultados da execução de ferramentas — não substitui as ferramentas.

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

![Diagrama do Ecossistema Banzami — Kernel, Operadores, BanzamIA, SDKs e Aplicações](/images/architecture/banzami-ecosystem.svg)

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

**Operadores Certificados:** Qualquer entidade que obtenha certificação Banzami pode implementar o protocolo. Operadores certificados são o resultado intencional do protocolo — não um conceito futuro.

---

## 4. Arquitectura Técnica

### Stack tecnológico

| Camada | Tecnologia | Justificação |
|--------|-----------|-------------|
| Núcleo financeiro | Rust | Segurança de memória, performance determinística, sistema de tipos para dinheiro |
| Orquestração | Go | Simplicidade operacional, concorrência, padrões HTTP gateway |
| Frontend | Next.js (TypeScript) | SSR, performance, ecossistema developer |
| Mobile | Flutter/Dart | Codebase única para Android/iOS, performance nativa |
| Persistência (referência) | PostgreSQL | Garantias ACID, correcção financeira — implementação de referência; o protocolo é agnóstico ao storage |
| Cache / filas | Redis | Rate limiting, chaves de idempotência, sessões |
| Observabilidade | OpenTelemetry | Traces, métricas e logs vendor-neutral |

### Topologia de serviços

![Topologia de serviços — Internet → Camada Go (api-gateway, public-api, admin-api) → Rust Core API → PostgreSQL](/images/architecture/service-topology.svg)

O Go gateway é o dono da superfície pública (auth, rate limits, idempotência). Para cada operação financeira, delega no Rust core-api via HTTP. O Rust é o único escritor das tabelas financeiras. O Go nunca escreve directamente em tabelas financeiras.

### O ledger de dupla entrada

Cada operação financeira produz entradas de ledger. O ledger é:

- **Append-only** — as entradas nunca são modificadas ou eliminadas (INV-LEDGER-002)
- **Balanceado** — cada posting tem débitos e créditos iguais (INV-LEDGER-001)
- **Integer-only** — os montantes são armazenados como i64 minor units, nunca vírgula flutuante (INV-LEDGER-003)
- **Atómico** — postings parciais nunca persistem (INV-LEDGER-004)

O fluxo canónico de um pagamento QR:

```text
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

![Sistema de rastreabilidade — fluxo de eventos desde qr.created até settlement.assigned, todos partilhando o mesmo trace_id](/images/architecture/trace-flow.svg)

Os traces são a ferramenta de auditoria primária. O módulo Trace Explainer do BanzamIA reconstrói e verifica qualquer trace interactivamente.

---

## 5. Representação Monetária

> **Esta secção é normativa.** Todos os operadores, SDKs e implementações do protocolo Banzami DEVEM conformar com estas regras.

### Regra de Inteiros

**Todos os valores monetários no protocolo Banzami DEVEM ser representados como inteiros.**

Valores monetários em vírgula flutuante são proibidos em toda a superfície do protocolo, incluindo:

- APIs (request e response bodies)
- Traces e logs estruturados
- Manifestos de operador
- Saldos de carteiras
- Entradas de ledger
- Batches de liquidação
- Contratos de SDK
- Mensagens de federação
- Implementações internas de operadores

**Exemplos proibidos:**

```json
{ "amount": 10.50 }
{ "fee": 20.75 }
```

**Exemplos válidos:**

```json
{ "amount_minor": 1050 }
{ "fee_minor": 2075 }
```

Esta regra está imposta ao nível de compilação pelo sistema de tipos Rust (`MoneyAmount`, não `f64`) e ao nível de esquema por constraints da base de dados (invariante `INV-LEDGER-003`).

### Convenção `*_minor`

O protocolo Banzami adopta a convenção de nomenclatura `*_minor` para todos os campos monetários. Campos que terminam em `_minor` representam valores monetários expressos na menor unidade suportada de uma moeda.

**Campos monetários oficiais do protocolo:**

| Campo | Significado |
|-------|-------------|
| `amount_minor` | Valor genérico de pagamento |
| `gross_minor` | Montante bruto pago pelo consumidor |
| `fee_minor` | Taxa retida pelo operador |
| `net_minor` | Montante líquido entregue ao receptor |
| `available_minor` | Saldo disponível imediatamente |
| `reserved_minor` | Saldo temporariamente bloqueado |
| `balance_minor` | Saldo total da carteira |
| `settlement_minor` | Montante de liquidação num ciclo |

### Porquê Inteiros

A infraestrutura financeira DEVE evitar erros de arredondamento em vírgula flutuante. A representação em inteiros garante:

- **Cálculos determinísticos** — o mesmo cálculo produz sempre o mesmo resultado, independentemente da plataforma ou linguagem de implementação
- **Reconciliação exacta** — cada montante que entra deve sair; sem diferenças de sub-cêntimo acumuladas entre operações
- **Liquidação exacta** — batches de liquidação fecham com precisão absoluta, sem arredondamentos residuais
- **Auditabilidade exacta** — as entradas de ledger somam exactamente; auditores podem verificar qualquer posting
- **Consistência do protocolo** — operadores em diferentes linguagens (Rust, Go, TypeScript, Dart, PHP) produzem resultados idênticos
- **Portabilidade de implementação** — qualquer linguagem pode implementar aritmética de inteiros correctamente; vírgula flutuante tem comportamentos subtilmente diferentes entre plataformas

> `0.1 + 0.2` em vírgula flutuante IEEE 754 não é `0.3`. Em aritmética de inteiros, `10 + 20 = 30`. Sempre.

### Semântica de Montantes de Liquidação

Todo o fluxo de pagamento Banza produz três montantes monetários com semântica exacta:

**`gross_minor`** — Montante pago pelo consumidor antes de quaisquer deduções. É o valor total que sai da carteira do consumidor.

**`fee_minor`** — Montante retido como taxa pelo operador. Creditado na carteira de taxas como entrada de ledger separada dentro do mesmo posting atómico.

**`net_minor`** — Montante entregue ao receptor (comerciante). Creditado na carteira do comerciante.

**Invariante normativo (INV-STL-001):**

```
gross_minor = net_minor + fee_minor
```

**Exemplo:**

```json
{
  "gross_minor":  100000,
  "fee_minor":      2000,
  "net_minor":     98000
}
```

| Campo | Minor units | AOA (1 AOA = 100 minor units) |
|-------|------------|-------------------------------|
| `gross_minor` | 100 000 | 1 000,00 Kz |
| `fee_minor` | 2 000 | 20,00 Kz |
| `net_minor` | 98 000 | 980,00 Kz |

Verificação: 100 000 = 98 000 + 2 000 ✓

A violação desta invariante é uma falha de certificação imediata.

### Semântica de Saldo de Carteira

Os saldos de carteira seguem semântica de dois componentes:

**`available_minor`** — Saldo imediatamente disponível para pagamentos ou levantamentos. Reflecte fundos confirmados e não bloqueados.

**`reserved_minor`** — Saldo temporariamente bloqueado — por exemplo, durante uma transacção pendente ou processo de payout em curso. Não pode ser utilizado até ser libertado ou confirmado.

**`balance_minor`** — Saldo total da carteira.

**Invariante normativo (INV-WALLET-001):**

```
balance_minor = available_minor + reserved_minor
```

Os saldos de carteiras são sempre derivados de entradas de ledger — nunca directamente mutados. Um saldo de carteira nunca pode ser negativo (INV-STL-002).

### Registo de Moedas

O Banzami mantém um registo formal de moedas suportadas com precisão oficial para cada uma. A adição de uma nova moeda requer um RFC aprovado.

#### AOA — Kwanza Angolano

| Campo | Valor |
|-------|-------|
| Código ISO 4217 | `AOA` |
| Nome | Kwanza Angolano |
| Símbolo | Kz |
| Minor units | **100** (1 AOA = 100 minor units) |
| Status | **Moeda oficial Banzami** |
| Referência | ADR-014, ADR-002 |

**Política de precisão AOA:** O Banzami representa o AOA com 2 casas decimais. 1 Kwanza = 100 minor units, permitindo representar valores até 0,01 Kz com precisão exacta.

| Valor | `amount_minor` |
|-------|---------------|
| 10,50 Kz | 1 050 |
| 1 000,00 Kz | 100 000 |
| 2 500,00 Kz | 250 000 |
| 100 000,00 Kz | 10 000 000 |

Qualquer alteração à política de precisão do AOA requer um RFC aprovado. Esta é uma decisão de protocolo — não uma decisão unilateral de implementação.

#### USD — Dólar Americano

| Campo | Valor |
|-------|-------|
| Código ISO 4217 | `USD` |
| Minor units | 100 (1 USD = 100 cents) |
| Status | Suportado (traces de demonstração e referência) |

Exemplo: 10,50 USD → `amount_minor = 1050`

#### EUR — Euro

| Campo | Valor |
|-------|-------|
| Código ISO 4217 | `EUR` |
| Minor units | 100 (1 EUR = 100 cents) |
| Status | Suportado (traces de demonstração e referência) |

Exemplo: 25,99 EUR → `amount_minor = 2599`

#### Adição de novas moedas

A adição de uma nova moeda ao registo oficial requer um RFC aprovado que especifique:
- Código ISO 4217
- Número de minor units e política de precisão
- Política de arredondamento (se aplicável)
- Carris de liquidação disponíveis

### Requisitos de Conformidade Monetária para Operadores

Todos os operadores certificados DEVEM:

- Armazenar todos os valores monetários como inteiros (i64 ou equivalente)
- Expor todos os valores monetários como inteiros em todas as APIs
- Preservar a precisão em toda a cadeia de processamento (entrada → ledger → saída)
- Evitar aritmética em vírgula flutuante em cálculos de protocolo
- Preservar a invariante de liquidação: `gross_minor = net_minor + fee_minor`
- Preservar a invariante de carteira: `balance_minor = available_minor + reserved_minor`
- Utilizar a convenção de nomenclatura `*_minor` para todos os campos monetários expostos

Operadores que violem qualquer um destes requisitos falham na certificação.

### Requisitos para SDKs

Todos os SDKs Banzami oficiais DEVEM:

- Expor campos monetários exclusivamente como inteiros (`number` em TypeScript, `int64` em Dart, `int` em PHP)
- Preservar a precisão em toda a cadeia de serialização/deserialização
- Rejeitar payloads de protocolo com valores monetários em vírgula flutuante
- Documentar a precisão da moeda em todos os exemplos de código

Aplica-se a: TypeScript (`@banza/sdk`), Flutter/Dart (`banzami_sdk`), PHP (`banza/sdk`), Go (interno) e quaisquer SDKs futuros.

```typescript
// CORRECTO — integer minor units
const qr = await client.qr.createDynamic({
  amountMinor: 1050,   // 10,50 AOA
  currency: 'AOA',
});

// PROIBIDO — viola MON-001
const qr = await client.qr.createDynamic({
  amount: 10.50,       // ❌ vírgula flutuante
  currency: 'AOA',
});
```

### Regra de Certificação MON-001

**MON-001 — Representação Monetária em Inteiros**

| Campo | Valor |
|-------|-------|
| ID | `MON-001` |
| Nome | Representação Monetária em Inteiros |
| Nível mínimo | 0 (aplica-se a todos os operadores em todos os níveis) |
| Gravidade | CRITICAL |

**Definição:** Operadores certificados DEVEM representar todos os valores monetários como minor units inteiras. A representação em vírgula flutuante é proibida em toda a superfície do protocolo.

| Violação | Resultado |
|----------|-----------|
| Valores float em APIs | FAIL de certificação |
| Valores float em traces | FAIL de certificação |
| Valores float em manifestos | FAIL de certificação |
| Valores float em mensagens de liquidação | FAIL de certificação |
| Valores float em saldos de carteiras | FAIL de certificação |
| `gross_minor ≠ net_minor + fee_minor` | FAIL de certificação |
| `balance_minor ≠ available_minor + reserved_minor` | FAIL de certificação |

A violação de MON-001 é um bloqueador de certificação imediato para qualquer nível.

### Regra de Conformidade CONFORMANCE-MON-001

**CONFORMANCE-MON-001 — Verificação de Representação Monetária**

O conformance suite verifica os seguintes requisitos para cada operador:

| Verificação | Método | Resultado esperado |
|-------------|--------|-------------------|
| Campos monetários usam convenção `*_minor` | Inspecção de schema de API | PASS |
| Valores são inteiros | Inspecção de payload JSON | PASS |
| Payloads com vírgula flutuante são rejeitados | Submissão de payload inválido | HTTP 422 |
| Invariante de liquidação verificada | `gross_minor = net_minor + fee_minor` | PASS |
| Invariante de carteira verificada | `balance_minor = available_minor + reserved_minor` | PASS |

```json
{
  "test_id": "CONFORMANCE-MON-001-float-rejection",
  "description": "Operator must reject floating-point monetary values",
  "operation": "POST /v1/qr/dynamic",
  "payload": { "amount": 10.50, "currency": "AOA" },
  "expected": { "status": "4xx" }
}
```

**Referências cruzadas:** §13 (Segurança e Integridade Financeira), §7 (Modelo de Certificação), `docs/conformance.md`, `docs/certification.md`, `docs/glossary.md`.

---

## 6. Governança

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

## 7. Modelo de Certificação

### Níveis de certificação

A certificação é obtida passando no conformance suite para o nível correspondente.

| Nível | Nome | Capacidades necessárias | Responsabilidade |
|-------|------|------------------------|-----------------|
| **0** | Sandbox Operator | Operações básicas sandbox | Experimentação e desenvolvimento; sem operações live; sem federação |
| **1** | Payment Operator | wallet.consumer, wallet.merchant, qr.static, p2p.transfer | Operar produtos de pagamento — carteiras, QR, transferências, checkout |
| **2** | Settlement Operator | Nível 1 + qr.dynamic, payment_links, settlement.t0 | Participar na infraestrutura de liquidação, reconciliação e traceabilidade financeira |
| **3** | Federation Operator | Nível 2 + payout.batch, reconciliation | Participar na federação do protocolo — interoperabilidade entre operadores |
| **4** | Infrastructure Operator | Nível 3 + acquiring.emis, federation_ready | Operar infraestrutura crítica do ecossistema — routing, serviços partilhados |

### Processo de certificação

![Processo de certificação — 7 etapas do Manifesto ao registo público, verificadas pelo BanzamIA](/images/architecture/certification-flow.svg)

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

## 8. Federação

A federação é uma camada de primeira classe na arquitectura Banzami. Define como operadores certificados comunicam, encaminham pagamentos e liquidam entre si.

### Estado actual

A federação encontra-se na fase de desenho. Todos os pagamentos são actualmente processados pelo operador de referência Banza. O kernel, no entanto, foi desenhado desde o início com os primitivos necessários:
- Propagação de `trace_id` através de fronteiras de serviço
- Declaração de manifesto de operador com capacidades de encaminhamento
- Arquitectura de encaminhamento baseada em capacidades
- Isolamento de liquidação entre operadores

### Arquitectura de federação (planeada)

A federação permite o encaminhamento de pagamentos entre operadores certificados:

![Arquitectura de federação — Operador X encaminha pagamento para Operador Y através da camada de federação Banzami](/images/architecture/federation.svg)

Requisitos para federação:
- Ambos os operadores com Certificação Nível 3+ (Federation Operator)
- Conta de liquidação partilhada com Banzami
- Manifesto de federação com capacidades de encaminhamento
- Propagação cross-operador de trace_id
- Liquidação atómica cross-operador no ledger

### Roadmap de federação

| Marco | Descrição | Alvo |
|-------|-----------|------|
| RFC de federação | Definir protocolo inter-operadores | H1 2027 |
| Operadores piloto | Dois operadores em federação controlada | H2 2027 |
| Federação aberta | Qualquer operador Nível 4 (Infrastructure Operator) pode federar | 2028 |

---

## 9. BanzamIA

O BanzamIA é um produto de primeira classe do ecossistema Banzami — não um componente interno, não um chatbot, não um wrapper genérico de LLM. É a interface cognitiva do protocolo.

Se o Kernel é o motor financeiro do Banzami, o BanzamIA é a interface cognitiva do Banzami. Um move valor. O outro torna o valor compreensível.

> **Ferramentas determinam a verdade. A IA explica a verdade.**

![BanzamIA como Camada Cognitiva — arquitectura em quatro camadas do protocolo Banzami](/images/architecture/banzamia-cognitive-layer.svg)

---

### Porquê existe o BanzamIA

Os protocolos financeiros modernos tornam-se progressivamente mais difíceis de compreender.

À medida que um protocolo cresce, acumula:

- RFCs e ADRs
- Invariantes financeiros
- Regras de implementação
- Requisitos de certificação
- SDKs e APIs
- Regras de governança
- Documentação de conformidade

O protocolo torna-se mais poderoso. Mas também se torna mais difícil de aprender.

Sem assistência:

- O onboarding torna-se mais lento
- A certificação torna-se mais difícil
- As integrações tornam-se mais caras
- Os erros tornam-se mais comuns
- A adopção do protocolo desacelera

O BanzamIA existe para resolver este problema.

---

### O Fosso de Conhecimento do Protocolo

Sem o BanzamIA, um programador que quer integrar o protocolo Banzami tem de navegar centenas de páginas de documentação, pesquisar RFCs manualmente, interpretar ADRs e tentar implementar sem orientação contextual. O resultado são semanas de aprendizagem, erros de implementação e ciclos de validação falhados.

Com o BanzamIA, o mesmo programador faz uma pergunta e recebe uma resposta contextual fundamentada em fontes do protocolo. Recebe referências exactas. Recebe orientação de implementação. Constrói correctamente.

**O BanzamIA comprime semanas de aprendizagem do protocolo em minutos.**

![O Fosso de Conhecimento do Protocolo — comparação sem e com BanzamIA](/images/architecture/banzamia-knowledge-gap.svg)

---

### Por que é diferente de IA genérica

O BanzamIA **não é**:

- ChatGPT para pagamentos
- Um assistente genérico
- Um wrapper de LLM público

O BanzamIA **é**:

- Protocol-native — construída sobre o corpus do protocolo Banzami
- RFC-aware — conhece todos os RFCs e ADRs publicados
- Invariant-aware — conhece e explica os invariantes financeiros
- Certification-aware — guia operadores no processo de certificação
- Citation-first — fundamenta todas as respostas em fontes verificáveis

O propósito do BanzamIA não é criatividade. É compreensão do protocolo.

A verdade nunca vem da imaginação do modelo. A verdade vem de:

- Documentos do protocolo
- Manifestos de operador
- Motores de validação
- RFCs e ADRs

O modelo explica. As ferramentas verificam. Esta separação é absoluta e intencional.

---

### BanzamIA como Camada Cognitiva

O protocolo Banzami tem quatro camadas:

**Camada Física** — Banks, EMIS, settlement rails, infraestrutura de liquidação.

**Camada Financeira** — O Kernel Banzami em Rust. Ledger, wallets, transactions, settlement, QR, payouts. Executa regras com precisão determinística.

**Camada de Governança** — Certificação, conformidade, federação. RFCs, ADRs, validation matrix, manifestos de operador.

**Camada Cognitiva — BanzamIA** — A interface humana de todo o protocolo. Explica o que as outras camadas fazem, guia quem trabalha com elas, e torna o protocolo acessível.

O Kernel move valor. O BanzamIA move compreensão.
O Kernel executa regras. O BanzamIA explica regras.
O Kernel garante verdade. O BanzamIA torna a verdade acessível.

---

### Por que quase nenhum protocolo tem isto

A maioria dos sistemas de pagamento fornece:

- APIs
- Documentação
- SDKs

Muito poucos fornecem:

- Inteligência nativa ao protocolo
- Exploração interactiva de RFC
- Geração de manifesto guiada
- Orientação de conformidade contextual
- Explicação de invariantes em linguagem natural

O BanzamIA transforma o conhecimento do protocolo numa capacidade interactiva.

Isto representa uma inovação arquitectónica significativa: um protocolo que não apenas define regras, mas as explica activamente a todos os que trabalham com ele.

---

### O que acontece sem BanzamIA

| Dimensão | Sem BanzamIA | Com BanzamIA |
|----------|-------------|--------------|
| Onboarding | Semanas | Dias |
| Certificação | Processo longo e difícil | Guiado passo a passo |
| Erros de implementação | Frequentes | Reduzidos |
| Custo de suporte | Elevado | Reduzido |
| Compreensão do protocolo | Restrita a especialistas | Acessível a todos |
| Adopção do protocolo | Lenta | Acelerada |

---

### BanzamIA multiplica o ecossistema

O BanzamIA não é apenas mais um módulo. É um multiplicador de força de todo o ecossistema.

![BanzamIA como Multiplicador de Força — cada componente amplificado](/images/architecture/banzamia-force-multiplier.svg)

Cada componente do ecossistema torna-se mais acessível e mais eficaz quando combinado com o BanzamIA:

- **Kernel × BanzamIA** = integrações mais fáceis para programadores
- **Certificação × BanzamIA** = progressão mais rápida de operadores através dos níveis
- **RFCs × BanzamIA** = conhecimento de protocolo acessível a qualquer contribuidor
- **Integration Surface × BanzamIA** = desenvolvimento de SDK mais rápido e correcto
- **Governança × BanzamIA** = melhor conformidade e menos desvios de protocolo

---

### Arquitectura do Produto

O BanzamIA disponível publicamente em `banzami.org/banzamia` é composto por dezasseis módulos especializados, organizados em três camadas:

![Protocol Operating System — 8 capacidades em órbita em torno do núcleo BanzamIA](/images/architecture/protocol-operating-system.svg)

**Camada de Protocolo — Conhecimento e Raciocínio**

| Módulo | Função |
|--------|--------|
| **Chat** | Q&A sobre o protocolo, fundamentado em citações de RFC e ADR |
| **Protocol Research** | Pesquisa multi-passo agentic — planeia, recupera, percorre o grafo, sintetiza |
| **Protocol Graph** | Explorador visual do grafo de protocolo (17 tipos de nó, 11 tipos de relação) |
| **Knowledge Search** | Pesquisa semântica sobre documentação do protocolo via Qdrant |
| **RFC/ADR Explorer** | Pesquisa e explicação de documentos de governança |

**Camada de Operador — Construção e Certificação**

| Módulo | Função |
|--------|--------|
| **Operator Builder** | Criação guiada de manifesto de operador |
| **Certification Copilot** | Análise de readiness L0–L4, score 0–100%, roadmap de certificação |
| **Conformance** | Runner de testes de conformidade e análise de resultados |
| **Manifest Validator** | Validação estrutural e semântica de manifestos |
| **Protocol Simulator** | Análise what-if determinística — impacto de alterações de capacidades |

**Camada de Inteligência — Análise e Federação**

| Módulo | Função |
|--------|--------|
| **Trace Explainer** | Reconstrução de linha temporal causal e verificação de invariantes |
| **SDK Assistant** | Geração de código e orientação de integração SDK |
| **Federation Intelligence** | Análise de compatibilidade de federação — score 0–100, conflitos, bloqueadores |
| **Protocol Memory** | Registo contínuo da jornada do operador — assessments, milestones, trajectória |
| **Digital Twin** | Representação virtual completa do operador no protocolo |
| **Quality Dashboard** | Métricas do sistema BanzamIA — RAG, Protocol Graph, Qdrant, ferramentas |

---

### Como o BanzamIA Funciona

O BanzamIA não é um único modelo de IA. É um sistema orquestrado que combina múltiplos modelos de linguagem, recuperação de conhecimento do protocolo, ferramentas de validação determinísticas e lógica de certificação numa única interface.

![Arquitectura Interna do BanzamIA — fluxo completo de pergunta a resposta fundamentada](/images/architecture/banzamia-internal-architecture.svg)

#### Não é um único modelo

O BanzamIA não é:

- Um chatbot treinado no Banzami
- Um wrapper de LLM único
- Um assistente genérico com branding Banzami

O BanzamIA é um sistema AI-native que encaminha cada pedido para a combinação correcta de modelo de linguagem, fonte de conhecimento, ferramenta determinística e validador de protocolo.

#### Estratégia de Modelos de IA

O BanzamIA usa uma arquitectura de encaminhamento de modelos (model routing). Cada tipo de tarefa é classificado e enviado para o modelo mais adequado.

![Encaminhamento de Modelos BanzamIA — routing de tarefas por modelo e ferramentas](/images/architecture/banzamia-model-routing.svg)

**Qwen — Compreensão Geral do Protocolo**

Modelo principal para compreensão e explicação do protocolo. Responsável por: documentação e Q&A geral, clarificação de conceitos, sumário de RFCs e ADRs, orientação de onboarding, navegação geral do ecossistema.

*Exemplos: "O que é um trace_id?", "Como funciona a federação?", "Qual a diferença entre Banzami e Banza?"*

**Qwen Coder — Assistência de Implementação**

Usado para tarefas orientadas a implementação e geração de código. Responsável por: exemplos de integração SDK, snippets TypeScript · Dart · PHP · Go, scaffolding de manifestos de operador, assistência em workflows de desenvolvimento.

*Exemplos: "Gera uma integração TypeScript para payment requests", "Mostra como chamar a API de traces"*

**DeepSeek — Raciocínio e Validação**

Usado para tarefas de raciocínio profundo. Responsável por: debugging de invariantes, raciocínio de certificação, análise de prontidão de operadores, explicação de falhas de conformidade, análise de arquitectura.

*Exemplos: "Por que falhou este operador no nível 2?", "Qual invariante é violado por este batch de liquidação?"*

#### Recuperação de Conhecimento do Protocolo (RAG)

O BanzamIA não depende da memória do modelo. Recupera conhecimento da base de conhecimento viva do Banzami — em tempo real, com citações verificáveis.

Fontes incluem: `BANZAMI_REFERENCE.md`, RFCs e ADRs, contratos OpenAPI, invariantes financeiros, schemas de manifesto, vectores de conformidade, documentação de SDK e glossário oficial.

Fluxo de recuperação:

```
Pergunta do utilizador
↓ Classificação do pedido
↓ Pesquisa vectorial / keyword (Qdrant)
↓ Fontes do protocolo relevantes
↓ Raciocínio do modelo
↓ Resposta fundamentada com citações
```

**Por que não fine-tuning**

O fine-tuning torna-se obsoleto quando o protocolo evolui. O BanzamIA usa em vez disso recuperação em tempo real de documentos versionados, validadores determinísticos e saídas verificadas por ferramentas.

> *Os modelos são substituíveis. O conhecimento do protocolo não é.*

#### Modelo de Verdade do Protocolo

![Modelo de Verdade do Protocolo — ferramentas determinam a verdade, IA explica a verdade](/images/architecture/banzamia-truth-model.svg)

> **Ferramentas determinam a verdade. A IA explica a verdade.**

A verdade vem de schemas de protocolo, motores de conformidade, validadores, manifestos, traces, RFCs, ADRs e especificações. A IA não inventa verdade do protocolo — traduz verdade verificada em orientação humana.

#### Ferramentas Determinísticas

Muitas funções do BanzamIA não são inferências do modelo. São ferramentas determinísticas:

| Ferramenta | Função |
|-----------|--------|
| **Manifest Validator** | Estrutura JSON, campos obrigatórios, capacidades, requisitos de federação |
| **Conformance Runner** | Suites de teste, compatibilidade de protocolo, nível de certificação |
| **Trace Explainer** | Estrutura de trace, cadeia causal, entradas ledger e batches de liquidação |
| **SDK Generator** | Contratos OpenAPI + templates determinísticos → código correcto |
| **Knowledge Search** | Documentos fonte com citações, fundamenta respostas do modelo |

#### Modos de Deployment

| Modo | Estado | Descrição |
|------|--------|-----------|
| **Demo Mode** | Disponível | Frontend-only · demonstração pública · sem backend · exemplos estáticos |
| **Live API** | Activo | Backend real · ferramentas determinísticas · sem inferência GPU |
| **Live AI** | Futuro | RunPod / vLLM · Qwen · Qwen Coder · DeepSeek · model routing completo |

A arquitectura é desenhada para que o Live AI Mode possa ser activado sem redesenhar o sistema. O nó GPU é responsável apenas pela inferência — dados do protocolo, índices, ferramentas e verificação ficam fora do nó GPU, mantendo o sistema mais barato, mais seguro e mais fácil de escalar.

**Modo actual: Live API — ferramentas reais, sem inferência GPU activa**

#### Desenhado para Auto-Hospedagem

O BanzamIA deve permanecer auto-hospedável. Operadores, reguladores ou sandboxes governamentais devem poder implantar a sua própria instância — porque a infraestrutura financeira requer soberania de dados, e a federação futura pode requerer validação independente.

#### Como uma Pergunta é Respondida

Exemplo completo — *utilizador pergunta: "Como certifico um operador de Nível 2?"*

1. O BanzamIA recebe a pergunta
2. O Task Router classifica-a como `CERTIFICATION`
3. A recuperação de conhecimento encontra docs de certificação e regras de conformidade
4. As ferramentas determinísticas inspeccionam os requisitos disponíveis
5. O Model Router selecciona DeepSeek para raciocínio
6. O DeepSeek explica o resultado usando o contexto recuperado
7. O BanzamIA devolve: resposta clara · requisitos em falta · testes relevantes · referências a fontes · próximas acções

#### Exemplos de Encaminhamento por Modelo

| Pergunta | Rota |
|---------|------|
| "O que é um trace_id?" | Qwen + RAG |
| "Gera uma integração TypeScript para payment requests" | Qwen Coder + SDK templates + contratos OpenAPI |
| "Por que falhou este operador na conformidade de liquidação?" | Conformance Runner + DeepSeek |
| "Este manifesto está pronto para federação?" | Manifest Validator + DeepSeek |

---

### Avaliação da Qualidade de Recuperação

O BanzamIA inclui um framework de avaliação contínua que mede a qualidade das respostas ao longo de quatro dimensões.

![Arquitectura de Avaliação RAG — framework de medição de qualidade do BanzamIA](/images/architecture/rag-evaluation-architecture.svg)

#### Dataset de Referência

200 perguntas sobre o protocolo, organizadas em 12 categorias e três níveis de dificuldade (easy, medium, hard). Cada pergunta inclui `expected_sources`, `expected_answer_keywords`, `category` e `difficulty`.

Categorias cobertas: fundamentos do protocolo, certificação, invariantes financeiros, geração de código SDK, rastreamento de trace, conformidade, glossário, QR, liquidação, SDKs, federação, gateway.

#### Métricas de Recuperação

| Métrica | Significado |
|---------|-------------|
| **Top-1 Accuracy** | O documento mais relevante está na posição 1? |
| **Top-3 / Top-5 Accuracy** | Documento relevante encontrado nos primeiros 3 / 5 resultados |
| **MRR** | Mean Reciprocal Rank — distância ao resultado correcto |
| **Recall@5** | Fracção de fontes esperadas encontradas nos 5 primeiros |
| **Weak Retrieval Rate** | Taxa de queries com pontuação máxima < 0.45 |

#### Classificação por Autoridade

Cada fonte é ponderada por tipo e antiguidade. A pontuação final combina similaridade semântica, peso de autoridade e decaimento por frescura:

```
pontuação_final = semântica × autoridade × frescura
```

| Tipo de Fonte | Autoridade |
|---------------|-----------|
| `reference` (BANZAMI_REFERENCE.md) | 1.00 |
| `accepted_rfc` | 0.95 |
| `accepted_adr` | 0.90 |
| `openapi` | 0.90 |
| `conformance` | 0.85 |
| `certification` | 0.85 |
| `invariant` | 0.85 |
| `manifest_schema` | 0.85 |
| `glossary` | 0.80 |
| `banzamia_doc` | 0.80 |
| `architecture_doc` | 0.75 |
| `readme` | 0.70 |
| `sdk_doc` | 0.70 |
| `website` | 0.60 |
| `draft_rfc` | 0.50 |

O decaimento por frescura tem semi-vida de 180 dias e piso de 0.80 — documentos históricos mantêm relevância.

#### Validação Adversarial

12 perguntas-armadilha que testam se o BanzamIA resiste a afirmações incorrectas sobre o protocolo:

| Armadilha | Critério |
|-----------|---------|
| Nível 1 faz liquidação cross-operador | FAIL se afirmar que sim |
| Operador sandbox pode entrar na federação | FAIL se não mencionar isolamento |
| RFC draft anula BANZAMI_REFERENCE.md | FAIL se inverter prioridade |
| Níveis de certificação podem ser saltados | FAIL se afirmar que sim |
| Saldo de carteira pode ser negativo | FAIL se afirmar que sim |
| Liquidação cria dinheiro novo | FAIL se afirmar que sim |
| BanzamIA pode inventar factos do protocolo | FAIL se afirmar que pode |

**Princípio:** *Tools determine truth. AI explains truth.* — quando uma ferramenta determinística (validador de manifesto, runner de conformidade) conflitua com o modelo, a ferramenta ganha sempre.

---

### Grafo de Protocolo

O BanzamIA indexa todos os documentos do protocolo numa estrutura de grafo de conhecimento tipado, com nós e arestas extraídos automaticamente do markdown.

![Arquitectura do Grafo de Protocolo — nós tipados e relações](/images/architecture/protocol-graph-architecture.svg)

#### Tipos de Nó

| Tipo | Exemplos |
|------|---------|
| `rfc` | RFC-0001…RFC-0006 |
| `adr` | ADR-001…ADR-024 |
| `openapi` | transfers, wallets, auth |
| `conformance_vector` | transfers, ledger-postings, qr-payloads |
| `certification_rule` | conformance.md, certification.md |
| `invariant` | balance-never-negative, no-money-creation |
| `manifest_schema` | schemas/operator, schemas/link |
| `sdk_doc` | TypeScript, Dart, PHP, Go |
| `architecture_doc` | decisões de arquitectura |
| `glossary_term` | glossário do protocolo |

#### Tipos de Aresta

| Relação | Significado |
|---------|-------------|
| `IMPLEMENTS` | ADR implementa RFC |
| `SUPERSEDES` | RFC novo substitui RFC anterior |
| `REQUIRES` | Documento depende de outro |
| `VALIDATES` | Vector de conformidade valida RFC/ADR |
| `REFERENCES` | Referência cruzada em texto ou markdown link |
| `EXPLAINS` | Glossário explica conceito de RFC |
| `DEPENDS_ON` | Dependência técnica |
| `RELATED_TO` | Relação temática |

#### Indexação e API

```bash
npm run graph:index    # constrói e guarda .banzamia-graph.json
```

Endpoints de exploração:

```
GET /graph/stats           — estatísticas do grafo (nós, arestas, por tipo)
GET /graph/node/:id        — nó + vizinhos directos
GET /graph/search?q=...    — pesquisa por path ou título
GET /graph/related/:id     — BFS até depth 2 (configurável até 4)
GET /graph/path?from=&to=  — caminho mais curto entre dois nós
```

#### Recuperação Enriquecida por Grafo

![Retrieval enriquecido pelo Grafo de Protocolo — Qdrant + vizinhos de grafo](/images/architecture/graph-enhanced-retrieval.svg)

O pipeline de recuperação combina pesquisa vectorial Qdrant com enriquecimento por grafo:

1. **Pesquisa Qdrant** — top-5 resultados por similaridade coseno
2. **Lookup de grafo** — encontra nós de grafo correspondentes aos resultados
3. **Vizinhos** — obtém nós ligados por IMPLEMENTS, SUPERSEDES, VALIDATES, REQUIRES
4. **Enriquecimento** — adiciona até 3 nós adicionais ao contexto (pontuação 0.4)
5. **Ranking final** — pesquisa semântica × autoridade × frescura

Este mecanismo garante que um resultado sobre RFC-0002 traz automaticamente contexto de ADRs que o implementam, vectores de conformidade que o validam, e outros RFCs que o RFC requer.

---

### Análise de Cobertura

```bash
npm run rag:coverage    # analisa cobertura por tipo de fonte
npm run rag:eval        # executa benchmark completo
GET /rag/stats          # estatísticas em tempo real via API
```

O relatório de cobertura mostra quantos chunks e documentos estão indexados por tipo de fonte, identifica tipos sem cobertura, e lista os documentos com mais chunks. A saúde do knowledge base é classificada como `good` / `partial` / `sparse`.

---

### Protocol Graph Explorer

O Protocol Graph Explorer é um módulo visual interactivo que permite navegar o grafo de protocolo directamente no BanzamIA. Acesse em `/banzamia` → **Protocol Graph**.

![Protocol Graph Explorer — painel de pesquisa, lista de nós, detalhe com relações](/images/architecture/protocol-graph-explorer.svg)

**Funcionalidades:**

- **Pesquisa de nós** — pesquisa por nome, path, ou tipo com debounce de 300ms
- **Filtros por tipo** — RFC, ADR, OpenAPI, Invariant, Concept, Conformance Vector, etc.
- **Detalhe de nó** — path canónico, autoridade (0–1.00), relações outbound e inbound
- **Tipos de relação** — extends, implements, enforces, depends_on, documents, validates, references, supersedes

**API:**

```
GET /graph/stats                — estatísticas globais (nós, arestas, by_type)
GET /graph/node/:id             — nó + vizinhos directos
GET /graph/search?q=            — pesquisa por path e título
GET /graph/related/:id?depth=   — nós relacionados por BFS (máx. profundidade 4)
GET /graph/path?from=&to=       — caminho mais curto entre dois nós
```

**Indexação do grafo:**

```bash
cd apps/banzamia && npm run graph:index
```

O indexador lê todos os ficheiros Markdown e extrai referências cruzadas para construir `.banzamia-graph.json`. Deve ser re-executado sempre que documentos do protocolo forem adicionados ou alterados.

---

### Agentic Protocol Research

O módulo Protocol Research executa pesquisa multi-passo sobre a base de conhecimento do protocolo. Ao contrário do Chat simples, o Research Agent não responde imediatamente — planeia, recupera, percorre o grafo, e sintetiza antes de responder.

![Agentic Protocol Research — fluxo multi-passo: plan, retrieval, graph, synthesis](/images/architecture/agentic-research-flow.svg)

**Pipeline de pesquisa:**

| Etapa | Tipo | Descrição |
|-------|------|-----------|
| 1 | `plan` | Decomposição da pergunta em sub-queries |
| 2 | `retrieval` | Pesquisa Qdrant primária (top-10) |
| 3 | `graph` | Travessia BFS do grafo de protocolo (profundidade 2) |
| 4 | `retrieval` | Pesquisa secundária sobre os 3 nós de grafo principais |
| 5 | `tool` | Detecção de contradições entre conformance_result e validation_result |
| 6 | `synthesis` | Síntese por modelo LLM com evidências + contexto de grafo |

**Saída — ResearchReport:**

```typescript
{
  answer: string                    // síntese em linguagem natural
  evidence: ResearchEvidence[]      // fontes com score, autoridade, excerpt
  graph_nodes: GraphNode[]          // nós de protocolo encontrados
  relationship_chains: string[]     // cadeias de relação (ex: "RFC-001 → ADR-016 → OAS-TRANSFER")
  contradictions: Contradiction[]   // conflitos detectados
  steps: ResearchStep[]             // passos executados com duração
  research_quality: 'high'|'medium'|'low'
  duration_ms: number
}
```

**Activação:**

```
POST /research    { "question": "..." }
```

Ou directamente no módulo **Protocol Research** do BanzamIA em `/banzamia`.

---

### Certification Copilot

O Certification Copilot analisa um manifesto de operador e capacidades declaradas face aos requisitos de cada nível de certificação Banzami (L0–L4).

![Certification Copilot — análise de readiness, score, roadmap L0→L4](/images/architecture/certification-copilot.svg)

**Níveis de certificação:**

| Nível | Nome | Requisitos principais |
|-------|------|-----------------------|
| L0 | Sandbox Operator | Manifesto válido, ambiente sandbox, protocol_version presente |
| L1 | Payment Operator | supports_wallets + supports_transfers + supports_qr |
| L2 | Settlement Operator | supports_traces + suporte a trace IDs + correlação de eventos |
| L3 | Federation Operator | supports_federation + supports_cross_operator + suporte a manifests |
| L4 | Infrastructure Operator | supports_payment_requests + supports_webhooks + conformidade de liquidação |

**Saída — CopilotResult:**

```typescript
{
  current_level: number             // nível mais alto totalmente atingido
  target_level: number              // nível alvo solicitado
  readiness_score: number           // 0–100 (percentagem de requisitos cumpridos)
  certification_ready: boolean      // true se score ≥ 100 para o nível alvo
  level_statuses: LevelStatus[]     // status por nível: achieved | partial | not_started
  missing_for_target: Requirement[] // requisitos em falta para o nível alvo
  blocking_issues: string[]         // problemas que bloqueiam qualquer certificação
  next_actions: string[]            // próximas acções recomendadas (ordenadas)
  roadmap: RoadmapSegment[]         // segmentos L→L+1 com esforço estimado e passos
}
```

**Activação:**

```
POST /certification/copilot    { "manifest": {...}, "capabilities": [...], "target_level": 2 }
```

Ou directamente no módulo **Certification Copilot** do BanzamIA em `/banzamia`.

---

### Quality Dashboard

O Quality Dashboard torna as métricas internas do BanzamIA públicas e verificáveis. O princípio orientador é: **não pedimos confiança — mostramos medições.**

![Quality Dashboard — fontes de dados, agregador /rag/stats, painel de métricas](/images/architecture/quality-dashboard-architecture.svg)

**Métricas expostas:**

| Categoria | Métricas |
|-----------|----------|
| Knowledge Base | documents_indexed, chunks_indexed, embedding_provider, last_indexed_at |
| Protocol Graph | node_count, edge_count, by_type (distribuição) |
| Retrieval Analytics | total_queries, avg_latency_ms, weak_retrieval_rate, avg_top_authority |
| Citações | avg_citations, top_sources por tipo, task_type_distribution |
| Benchmark | MRR, Precision@K, Recall@K — gerado por `npm run rag:eval` |

**Definição de recuperação fraca:**

Uma recuperação é considerada "fraca" quando o score de similaridade do top resultado é inferior a 0.45, activando o fallback por keyword. A taxa de recuperação forte (`1 − weak_retrieval_rate`) é o indicador primário de qualidade do knowledge base.

**Activação:**

```
GET /rag/stats    — snapshot completo em tempo real
```

Acessível no módulo **Quality Dashboard** do BanzamIA em `/banzamia`.

---

### Ecosystem Intelligence Layer

O BanzamIA é organizado em quatro camadas de inteligência, cada uma construída sobre a anterior:

![Ecosystem Intelligence Layer — 4 camadas: Knowledge, Retrieval+Graph, Intelligence Modules, Trust](/images/architecture/ecosystem-intelligence-layer.svg)

| Camada | Componentes | Propósito |
|--------|-------------|-----------|
| 1 — Knowledge Foundation | RFCs, ADRs, OpenAPI, Invariants, SDK, Tests | Base documental canónica |
| 2 — Retrieval + Graph | Qdrant, Protocol Graph, Keyword Fallback | Recuperação híbrida multi-modal |
| 3 — Intelligence Modules | Chat, Graph Explorer, Research Agent, Certification Copilot | Interfaces de inteligência especializadas |
| 4 — Trust + Verifiability | Quality Dashboard, Benchmark Suite, Adversarial Eval, Tool-Verified Answers | Medição pública de qualidade |

A Camada 3 nunca responde sem evidências da Camada 2. A Camada 4 mede continuamente a qualidade das Camadas 2 e 3.

> **Tools determine truth. AI explains truth.**

---

### Protocol Simulator

O Protocol Simulator permite a qualquer operador simular o impacto de alterações de capacidades **antes** de as implementar. É uma análise what-if determinística baseada em `analyzeCertificationReadiness()`.

![Protocol Simulator — What-If Analysis: estado actual, mudanças propostas, motor de simulação, delta de readiness](/images/architecture/protocol-simulator.svg)

**Como funciona:**

1. O operador submete o manifesto actual + capacidades declaradas
2. O operador propõe mudanças: `+ supports_traces`, `+ supports_webhooks`, target L2
3. O simulador corre `analyzeCertificationReadiness()` com o estado actual (before) e com o estado proposto (after)
4. O diff produz: `readiness_delta`, `requirements_satisfied`, `still_missing`, `level_unlocked`, `estimated_effort`

**Endpoint:** `POST /simulate`

```json
{
  "manifest": { "operator_id": "...", "capabilities": [...] },
  "proposed_changes": [
    { "type": "add_capability", "capability": "supports_traces" },
    { "type": "add_capability", "capability": "supports_webhooks" }
  ],
  "target_level": 2
}
```

**Output:**

| Campo | Descrição |
|-------|-----------|
| `readiness_delta` | Variação percentual de readiness (ex: +17%) |
| `certification_impact.level_unlocked` | Nível desbloqueado pelas mudanças propostas |
| `certification_impact.requirements_satisfied` | IDs de requisitos satisfeitos (ex: L2-001) |
| `estimated_effort` | `low` / `medium` / `high` baseado no número de requisitos em falta |
| `federation_impact` | Se as mudanças afectam compatibilidade de federação |

O simulador nunca modifica estado. É uma função pura e determinística.

---

### Federation Intelligence

A Federation Intelligence analisa a compatibilidade de dois operadores para estabelecer uma relação de federação de acordo com o RFC-0008.

![Federation Intelligence — Operator Compatibility Analysis: dois operadores, motor de análise, compatibility score, capacidades em falta](/images/architecture/federation-intelligence.svg)

**Modelo de análise:**

1. Ambos os operadores são avaliados com `analyzeCertificationReadiness()` com target L3
2. Verifica-se compatibilidade de `protocol_version` (mapa de versões compatíveis)
3. Verifica-se match de `environment` (sandbox vs production = conflito bloqueante)
4. Verifica-se presença de `FEDERATION_REQUIRED_CAPS`: `supports_federation` + `supports_cross_operator`
5. Calcula-se `compatibility_score` de 0–100 com penalizações por conflitos e capacidades em falta

**Endpoint:** `POST /federation/analyze`

```json
{
  "operator_a": {
    "manifest": { "operator_id": "op_alpha_001", "environment": "sandbox" },
    "capabilities": ["supports_wallets", "supports_transfers"]
  },
  "operator_b": {
    "manifest": { "operator_id": "op_beta_002", "environment": "sandbox" },
    "capabilities": ["supports_wallets", "supports_transfers", "supports_traces"]
  }
}
```

**Output:**

| Campo | Descrição |
|-------|-----------|
| `compatibility_score` | 0–100: ≥80 = pronto, 50–79 = parcial, <50 = não pronto |
| `federation_ready` | `true` apenas se score ≥ 80 e sem conflitos bloqueantes |
| `shared_capabilities` | Capacidades declaradas por ambos |
| `missing_in_a` / `missing_in_b` | Capacidades que cada operador precisa de adicionar |
| `conflicts` | Incompatibilidades detectadas (ex: environment mismatch) |
| `suggested_next_actions` | Lista de passos concretos para atingir federação |

A chamada a `/federation/analyze` actualiza automaticamente a memória de ambos os operadores.

---

### Protocol Memory

O Protocol Memory é um registo contínuo da jornada de cada operador no protocolo. É actualizado automaticamente pelas chamadas a `/copilot`, `/federation/analyze` e `/digital-twin`.

![Protocol Memory — Operator Journey History: timeline, armazém de memória, trajectória de readiness](/images/architecture/protocol-memory.svg)

**Estrutura de memória:**

```typescript
interface OperatorMemory {
  operator_id: string;
  assessments: AssessmentRecord[];   // snapshots de certification readiness
  timeline: TimelineEvent[];         // eventos ordenados cronologicamente
  research_history: ResearchRecord[];// queries feitas pelo operador
  federation_analyses: string[];     // parceiros analisados
  notes: string[];                   // notas manuais
  current_level: number;             // nível actual inferido dos assessments
  updated_at: string;
}
```

**Endpoints:**

| Método | Path | Descrição |
|--------|------|-----------|
| `GET` | `/memory` | Listar todos os operadores com memória |
| `GET` | `/memory/:operatorId` | Obter memória completa do operador |
| `POST` | `/memory/:operatorId` | Criar/actualizar memória manualmente |
| `DELETE` | `/memory/:operatorId` | Apagar memória do operador |

**Memória activa na resposta do copilot:**

Quando o copilot detecta um operador com histórico, a resposta inclui contexto de sessões anteriores: "Da última vez faltavam `supports_traces` e `supports_webhooks`. Agora satisfeitos. 78% → 91%."

A memória é actualmente em-memória (sem persistência). Persistência em base de dados está planeada (ver Roadmap).

---

### Operator Digital Twin

O Digital Twin é a representação virtual completa de um operador no protocolo. Agrega todas as dimensões: manifesto, capacidades, certificação, conformidade, federação, memória histórica, invariantes relevantes, RFCs aplicáveis, recomendações e trajectória.

![Operator Digital Twin — Protocol-Aware Virtual Representation: manifesto, capacidades, nível alvo, parceiros federação, buildDigitalTwin(), 6 painéis de dashboard](/images/architecture/operator-digital-twin.svg)

**Endpoint:** `POST /digital-twin`

O Digital Twin é construído por `buildDigitalTwin()` que:

1. Corre `analyzeCertificationReadiness()` para o nível alvo
2. Filtra `INVARIANTS` relevantes baseado nas capacidades declaradas
3. Filtra `RFCS` relevantes baseado em capacidades e requisitos em falta
4. Lê memória histórica via `getOrCreate()`
5. Gera recomendações automáticas com base no estado actual
6. Calcula `readiness_trajectory` a partir dos últimos 3 snapshots

**Dashboard (6 painéis):**

| Painel | Conteúdo |
|--------|----------|
| Overview | Operator ID, readiness score, trajectória (improving/stable/declining) |
| Certificação | Progresso por nível L0–L4 com barra de progresso |
| Invariantes | INV-LEDGER-001, INV-LEDGER-002, INV-TRACE-001 relevantes ao operador |
| RFCs | RFC-0001, RFC-0002, RFC-0007, RFC-0008 aplicáveis |
| Timeline | Histórico de eventos do operador (from memory) |
| Recomendações | Passos concretos ordenados para o próximo nível |

A chamada a `/digital-twin` regista automaticamente um snapshot de assessment na memória do operador.

---

### Protocol Operating System Vision

O BanzamIA evoluiu de assistant de documentação para **Protocol Operating System** — a camada de inteligência que torna o protocolo Banza auto-gerível e auto-explicativo.

![Protocol Operating System — BanzamIA Vision: 8 capabilities em órbita ao redor do hub central BanzamIA POS](/images/architecture/protocol-operating-system.svg)

**As 6 capacidades do Protocol OS:**

| Capacidade | Módulo | Descrição |
|------------|--------|-----------|
| **Compreender** | RAG + Knowledge Base + Protocol Graph | Recupera contexto protocolar relevante |
| **Explicar** | Chat + Research Agent + Citations | Responde com evidências verificáveis |
| **Validar** | Conformance + Manifest + Trace | Confirma conformidade com o protocolo |
| **Simular** | Protocol Simulator + What-If | Projecta impacto de mudanças antes de implementar |
| **Prever** | Memory + Trajectory + Analytics | Antecipa a trajectória do operador |
| **Guiar** | Digital Twin + Recommendations | Orienta o operador com contexto personalizado |

Duas capacidades adicionais emergem da interacção entre estas:

| Capacidade | Módulo | Descrição |
|------------|--------|-----------|
| **Certificar** | Certification Copilot + L0–L4 Roadmap | Guia o operador por cada nível de certificação |
| **Federar** | Federation Intelligence + Federation Graph | Analisa compatibilidade entre operadores |

**Princípio fundador:** *Tools determine truth. AI explains truth.*

O protocolo define as regras. As ferramentas verificam a conformidade. A IA explica o que as ferramentas encontraram — nunca o contrário.

---

### Impacto no Ecossistema

#### A Visão do Protocolo Autónomo

Historicamente, a infraestrutura financeira requeria mediação humana. Um operador que queria integrar um protocolo de pagamento necessitava de equipas de suporte, especialistas de integração, architects de solução e formadores de certificação.

A adopção do protocolo era limitada pelo número de humanos disponíveis para explicar o protocolo.

O BanzamIA muda este modelo.

![A Visão do Protocolo Autónomo — quatro fases na evolução de protocolos financeiros](/images/architecture/autonomous-protocol-vision.svg)

O protocolo torna-se capaz de se explicar a si mesmo, de guiar integrações de forma autónoma, de ajudar operadores a certificar-se, de responder a questões de implementação 24 horas por dia, sem limite de escala.

Isto é a Visão do Protocolo Autónomo.

#### A Economia de Adopção do Protocolo

O BanzamIA muda fundamentalmente a economia de adopção do protocolo.

![A Economia de Adopção — como o BanzamIA muda a relação entre crescimento e custo](/images/architecture/protocol-adoption-economics.svg)

Sem BanzamIA, o crescimento do ecossistema cria custo: mais operadores significa mais pedidos de suporte, mais carga de certificação, mais documentação manual. O custo escala linearmente com o crescimento.

Com BanzamIA, o crescimento do ecossistema cria valor: mais operadores significa mais adopção self-service, melhor qualidade do RAG, protocolo mais acessível. O custo cresce sub-linearmente.

#### O Custo de Compreensão

Cada protocolo financeiro tem dois custos distintos:

1. **Custo de implementação** — o trabalho técnico de integrar o protocolo
2. **Custo de compreensão** — o tempo e esforço de aprender o protocolo

A maioria dos projectos foca-se apenas no custo de implementação.

O BanzamIA ataca o custo de compreensão. O protocolo torna-se mais fácil de aprender, mais fácil de certificar, mais fácil de integrar, mais fácil de adoptar.

#### O Protocolo que se Explica a Si Mesmo

![O Protocolo que se Explica — modelo tradicional vs BanzamIA](/images/architecture/protocol-self-explanation.svg)

Os protocolos financeiros tradicionais dependem de humanos para explicar o comportamento do protocolo. A escala é limitada pela capacidade humana disponível.

O BanzamIA permite um modelo diferente. O protocolo pode agora explicar-se a si mesmo — 24 horas por dia, sem limite de escala, com citações verificáveis para cada afirmação.

O protocolo torna-se parcialmente auto-descritivo.

#### Além da Interface de Chat

O BanzamIA não é uma funcionalidade de chat. A interface de chat é apenas uma manifestação do sistema.

O BanzamIA também alimenta:

- Criação guiada de operadores e geração de manifestos
- Fluxos de validação e orientação de certificação
- Explicação de traces e assistência de SDK
- Navegação de governança e exploração de RFCs/ADRs

A camada de inteligência existe independentemente da interface de utilizador. Pode ser integrada em IDEs, portais de operador, painéis de certificação e ferramentas de auditoria.

#### Uma Nova Categoria de Infraestrutura

![Modelo de Força Multiplicadora — seis componentes do ecossistema amplificados](/images/architecture/force-multiplier-model.svg)

A maioria dos ecossistemas de pagamento fornece APIs, SDKs e documentação. Alguns fornecem portais de suporte e fóruns. Muito poucos fornecem inteligência nativa ao protocolo.

O BanzamIA introduz uma nova categoria arquitectónica: **Infraestrutura de Protocolo AI-native**.

O BanzamIA não é simplesmente IA anexada a um protocolo. É inteligência de protocolo construída no ecossistema do protocolo — que cresce em valor à medida que o protocolo cresce em complexidade.

À medida que o ecossistema cresce:

- RFCs crescem → BanzamIA torna-os pesquisáveis e compreensíveis
- Operadores crescem → BanzamIA escala o onboarding de forma autónoma
- Regras de certificação crescem → BanzamIA guia automaticamente
- SDKs crescem → BanzamIA gera código correcto

O valor do BanzamIA cresce com a complexidade do protocolo. Isto cria uma vantagem composta.

#### A Interface Humana do Protocolo

O protocolo Banzami tem quatro pilares fundamentais:

| Pilar | Função |
|-------|--------|
| **Kernel** | Move valor · executa verdade financeira com precisão determinística |
| **Certificação** | Protege valor · garante conformidade e confiança entre operadores |
| **Federação** | Conecta valor · interliga a rede de operadores certificados |
| **BanzamIA** | Torna o valor compreensível · é a interface humana de todo o sistema |

O Kernel é o motor financeiro. A Federação é a rede. A Certificação protege a confiança. O BanzamIA é a interface humana.

Juntos transformam um protocolo de pagamentos numa infraestrutura financeira autónoma — onde qualquer programador, operador, auditor ou regulador pode compreender o que o protocolo exige, validar o que implementou e construir com confiança.

---

### O futuro do BanzamIA

O BanzamIA deve evoluir para se tornar a interface primária através da qual humanos interagem com o protocolo.

Capacidades futuras podem incluir:

- **Protocol Copilots** — assistentes contextuais integrados em IDEs e ferramentas de desenvolvimento
- **Certification Copilots** — guia passo-a-passo ao longo de todo o processo de certificação
- **Integration Copilots** — assistência em tempo real durante a integração de SDKs
- **Operator Creation Workflows** — fluxos completos de criação e activação de operadores
- **Governance Assistants** — análise e explicação de alterações a RFCs e ADRs
- **Audit Assistants** — apoio a auditores na verificação de conformidade de operadores

---

### Declaração Final

O Kernel é o motor financeiro do Banzami.

O BanzamIA é a interface cognitiva do Banzami.

Um move valor. O outro torna o valor compreensível.

Juntos transformam um protocolo de pagamentos numa infraestrutura financeira acessível — onde qualquer programador, operador ou auditor pode compreender o que o protocolo exige, validar o que implementou e construir com confiança.

---

### Postura de segurança

O BanzamIA é read-only. Não pode:
- Iniciar operações financeiras
- Modificar a validation matrix sem frases de governança
- Aprovar certificações de forma autónoma

Cita fontes para todas as afirmações sobre o protocolo. Delega decisões de certificação às ferramentas determinísticas.

---

## 10. Banza para Programadores

### Integração em horas

A superfície de integração oficial do Banzami são os SDKs. Integrações directas via HTTP não são o caminho recomendado. SDKs oficiais:

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

## 11. Banza para Comerciantes

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

## 12. Para Consumidores

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

## 13. Segurança e Integridade Financeira

### Camadas de segurança

![Camadas de segurança — Consumidor → API Gateway → Rust Core → PostgreSQL, cada transacção atravessa todas as camadas](/images/architecture/security-layers.svg)

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

## 14. Sandbox e Ambiente de Testes

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

## 15. Por que Angola. Por que Agora.

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

## 16. Roadmap

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

## 17. Declaração de Visão

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

**SCAN** → **CONFIRMAR** → **PAGO INSTANTANEAMENTE**

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
