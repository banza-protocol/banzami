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

Os traces são a ferramenta de auditoria primária. O módulo Trace Explainer da BanzamIA reconstrói e verifica qualquer trace interactivamente.

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

A BanzamIA é um produto de primeira classe do ecossistema Banzami — não um componente interno, não um chatbot, não um wrapper genérico de LLM. É a interface cognitiva do protocolo.

Se o Kernel é o motor financeiro do Banzami, a BanzamIA é a interface cognitiva do Banzami. Um move valor. O outro torna o valor compreensível.

> **Ferramentas determinam a verdade. A IA explica a verdade.**

![BanzamIA como Camada Cognitiva — arquitectura em quatro camadas do protocolo Banzami](/images/architecture/banzamia-cognitive-layer.svg)

---

### Porquê existe a BanzamIA

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

A BanzamIA existe para resolver este problema.

---

### O Fosso de Conhecimento do Protocolo

Sem a BanzamIA, um programador que quer integrar o protocolo Banzami tem de navegar centenas de páginas de documentação, pesquisar RFCs manualmente, interpretar ADRs e tentar implementar sem orientação contextual. O resultado são semanas de aprendizagem, erros de implementação e ciclos de validação falhados.

Com a BanzamIA, o mesmo programador faz uma pergunta e recebe uma resposta contextual fundamentada em fontes do protocolo. Recebe referências exactas. Recebe orientação de implementação. Constrói correctamente.

**A BanzamIA comprime semanas de aprendizagem do protocolo em minutos.**

![O Fosso de Conhecimento do Protocolo — comparação sem e com BanzamIA](/images/architecture/banzamia-knowledge-gap.svg)

---

### Por que é diferente de IA genérica

A BanzamIA **não é**:

- ChatGPT para pagamentos
- Um assistente genérico
- Um wrapper de LLM público

A BanzamIA **é**:

- Protocol-native — construída sobre o corpus do protocolo Banzami
- RFC-aware — conhece todos os RFCs e ADRs publicados
- Invariant-aware — conhece e explica os invariantes financeiros
- Certification-aware — guia operadores no processo de certificação
- Citation-first — fundamenta todas as respostas em fontes verificáveis

O propósito da BanzamIA não é criatividade. É compreensão do protocolo.

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

O Kernel move valor. A BanzamIA move compreensão.
O Kernel executa regras. A BanzamIA explica regras.
O Kernel garante verdade. A BanzamIA torna a verdade acessível.

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

A BanzamIA transforma o conhecimento do protocolo numa capacidade interactiva.

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

A BanzamIA não é apenas mais um módulo. É um multiplicador de força de todo o ecossistema.

![BanzamIA como Multiplicador de Força — cada componente amplificado](/images/architecture/banzamia-force-multiplier.svg)

Cada componente do ecossistema torna-se mais acessível e mais eficaz quando combinado com a BanzamIA:

- **Kernel × BanzamIA** = integrações mais fáceis para programadores
- **Certificação × BanzamIA** = progressão mais rápida de operadores através dos níveis
- **RFCs × BanzamIA** = conhecimento de protocolo acessível a qualquer contribuidor
- **Integration Surface × BanzamIA** = desenvolvimento de SDK mais rápido e correcto
- **Governança × BanzamIA** = melhor conformidade e menos desvios de protocolo

---

### Arquitectura do Produto

A BanzamIA disponível publicamente em `banzami.org/banzamia` é composta por oito módulos especializados:

![Arquitectura do Produto BanzamIA — 8 módulos especializados](/images/architecture/banzamia-product-architecture.svg)

| Módulo | Função |
|--------|--------|
| **Chat** | Q&A sobre o protocolo, fundamentado em citações de RFC e ADR |
| **Operator Builder** | Criação guiada de manifesto de operador |
| **Conformance** | Runner de testes de conformidade e análise de resultados |
| **Manifest Validator** | Validação estrutural e semântica de manifestos |
| **Trace Explainer** | Reconstrução de linha temporal causal e verificação de invariantes |
| **SDK Assistant** | Geração de código e orientação de integração SDK |
| **RFC/ADR Explorer** | Pesquisa e explicação de documentos de governança |
| **Knowledge Search** | Pesquisa semântica sobre documentação do protocolo via Qdrant |

---

### O futuro da BanzamIA

A BanzamIA deve evoluir para se tornar a interface primária através da qual humanos interagem com o protocolo.

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

A BanzamIA é a interface cognitiva do Banzami.

Um move valor. O outro torna o valor compreensível.

Juntos transformam um protocolo de pagamentos numa infraestrutura financeira acessível — onde qualquer programador, operador ou auditor pode compreender o que o protocolo exige, validar o que implementou e construir com confiança.

---

### Postura de segurança

A BanzamIA é read-only. Não pode:
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
