# Money Engine — Banzami / BANZA

> **Regra de ouro: a UI mostra dinheiro; o ledger guarda inteiros.**
>
> A interface aceita e exibe valores humanos (`50 000,50 Kz`). O ledger, as APIs
> financeiras e toda a aritmética usam **minor units inteiros** (cêntimos).
> **Dinheiro nunca usa `float`/`double`.**

## Porquê nunca float

Vírgula flutuante não representa exatamente valores decimais (`0.1 + 0.2 != 0.3`).
Num sistema financeiro isto corrompe saldos, taxas e reconciliação. Por isso o
dinheiro é sempre um **inteiro de minor units**; o parsing usa `BigInt`/strings e
o resultado é um `int` de 64 bits.

## Major vs minor units

| Conceito | AOA |
|---|---|
| currency | `AOA` |
| símbolo | `Kz` |
| major unit | Kwanza |
| minor unit | cêntimo |
| scale | 2 |
| armazenamento | inteiro minor units |

```
1 Kz          = 100 minor units
50 000,50 Kz  = 5 000 050 minor units
0,01 Kz       = 1 minor unit
```

## Formato visual

- separador de milhares: **espaço** (nunca ponto nem vírgula);
- separador decimal: **vírgula**;
- moeda no **fim**;
- cêntimos só aparecem quando existem (`50 000 Kz`, não `50 000,00 Kz`).

```
5 000 000 → "50 000 Kz"
5 000 050 → "50 000,50 Kz"
1 250,75 Kz ← 125 075
0,01 Kz     ← 1
0 Kz        ← 0
```

## Contrato (fonte única da verdade)

Flutter: `sdk/flutter/lib/money/money_engine.dart` (reexportado por
`utils/money_format.dart`). TypeScript: `apps/*/lib/money.ts` (+ `lib/format.ts`).

| Função | Descrição |
|---|---|
| `parseMoneyInput(input, currency)` | string humana → **minor units** (lança em input inválido) |
| `tryParseMoneyInput(input)` | idem, devolve `null` em vez de lançar |
| `formatMoneyMinor(minor, currency)` | minor units → `"50 000,50 Kz"` |
| `formatMoneyInput(raw, currency)` | formatação ao digitar (`"50000,5"` → `"50 000,5"`) |
| `toMinorUnits(major, currency)` / `fromMinorUnits(minor)` | conversões major↔minor |
| `splitEvenlyMinor(totalMinor, people)` | divisão com resto distribuído (soma == total) |
| `feeMinor(grossMinor, bps)` | `floor(gross*bps/10000)`, inteiro, `fee ≤ gross` |
| `validateMoneyInput` / `normalizeMoneyInput` | validação / normalização |

## Parsing (regras de input)

Aceita: dígitos, espaços (milhares), **uma** vírgula, até 2 casas decimais (AOA),
símbolo da moeda. Rejeita: letras, ponto como decimal, várias vírgulas, mais de 2
casas, negativos.

```
"50000"      → 5 000 000
"50 000"     → 5 000 000
"50 000,50"  → 5 000 050
"1250,75"    → 125 075
"0,01"       → 1
"abc"        → erro
"1,234"      → erro   (3 casas)
"1,,23"      → erro   (2 vírgulas)
"1.23"       → erro   (ponto decimal)
```

## Split Bill (divisão com cêntimos)

A divisão opera **sempre em minor units**:

```
base      = totalMinor ~/ people
remainder = totalMinor %  people
parte[i]  = base + (i < remainder ? 1 : 0)
```

Exemplo `50 000 Kz / 3` = `5 000 000 / 3`:

```
1 666 667 + 1 666 667 + 1 666 666 = 5 000 000  ✅
Pessoa 1: 16 666,67 Kz
Pessoa 2: 16 666,67 Kz
Pessoa 3: 16 666,66 Kz
```

A app **não bloqueia** divisões não exatas: ajusta os cêntimos e mostra o preview
por pessoa; a soma das partes é sempre exatamente o total. A cobrança dividida é
criada como uma **Collection (BANZA ADR-016) FIXED_AMOUNTS** com os montantes
exatos por pessoa — o core valida `Σ partes == total`.

## Fees / Pricing

Fees em minor units, arredondamento **FLOOR** salvo regra explícita:

```
fee_minor = floor(gross_minor * bps / 10000)
net_minor = gross_minor - fee_minor
```

Nunca calcular fee em major units ou float. Ver `core/pricing` / `core/payouts`
(withdrawal fee 0,75%).

## APIs / SDK

- **APIs do operador**: dinheiro autoritativo em `amount_minor` (inteiro).
- **SDK/UI**: podem aceitar `amount_display` (string humana); o SDK converte com o
  Money Engine e envia **sempre** `amount_minor` ao operador.
- `amount_display` é para UX; `amount_minor` é a fonte financeira.

## Componentes de UI

- `MoneyAmount` — exibição dominante (bold, tamanhos sm/md/lg/xl/hero, tons
  normal/brand/success/danger/muted, `showCurrency`). Recebe `amountMinor`.
- `MoneyInput` — input que formata ao digitar (espaço + vírgula + `Kz`), reporta
  **minor units** via `onChanged(int?)`.

## Integração com ledger / receipts / proofs

O ledger (`ledger_entries`) guarda apenas minor units inteiros e é append-only. Os
recibos, comprovativos e PDFs formatam com `formatMoneyMinor` — valor principal
grande e legível, subtotal/taxa/total claros.

## Edge cases

```
50 000 / 3     → [1 666 667, 1 666 667, 1 666 666]
100,01 / 2     → [5 001, 5 000]  (10 001 minor)
0,01           → 1 minor unit
1 250 000,75   → 125 000 075 minor units
```

## Migração / compatibilidade

Os montantes já eram armazenados em minor units no ledger e nas APIs; esta
mudança é de **parsing/exibição** (aceitar vírgula, mostrar cêntimos) e do
**cálculo do split** (agora em minor units). Não houve reinterpretação de dados
existentes. O SANDBOX foi limpo de comerciantes de teste antes desta fase.

## Aplicação

Motor implementado no Flutter SDK (Merchant + Consumer) e nos helpers TS
(website/dashboard/admin/checkout). Adoção incremental nos restantes ecrãs/PDFs e
no DOA (repo separado) — ver limitações na entrega.
