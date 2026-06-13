# 05 — Auditoria de Arquitectura

**Versão:** 1.0
**Data:** 2026-06-13
**Tipo:** Auditoria estratégica — Fase 5 (Arquitectura)
**Postura:** CTO de fintech + arquitecto de sistemas distribuídos.

---

## Avaliação global

**A arquitectura é, de longe, o ponto mais forte do projecto.** As decisões macro estão corretas e raramente se vêem tão bem executadas num projecto neste estádio:

- **Rust como escritor único do núcleo financeiro**, Go na camada de API, separação rígida de fronteiras de linguagem.
- **Modular monolith** em vez de microserviços prematuros — disciplina rara.
- **Double-entry ledger imutável** com invariante imposta em tempo de build.
- **PostgreSQL como fonte única de verdade financeira**; Redis só para coordenação (rate-limit, idempotência, locks).

Isto não é arquitectura de protótipo. É a fundação certa para um operador de pagamentos. O problema não é a fundação — é o desequilíbrio entre a solidez da fundação e a ausência das peças que produzem valor (rails, utilizadores).

---

## Backend

### Núcleo Rust (`core-api` :8081)
- **Forte.** Engine de transferências (`core/transfers/src/engine.rs`) faz tudo certo: transacção PostgreSQL única, `SELECT FOR UPDATE` no remetente (serializa envios concorrentes), saldo **derivado do ledger** (não um campo mutável — elimina toda uma classe de bugs de saldo), idempotência por chave, double-entry DR/CR atómico.
- Acessível só por loopback — bem isolado.

### Serviços Go
- Estrutura limpa e idiomática (chi router, middleware de auth/tracing/logger/idempotency/ratelimit, `apierror` consistente).
- 101 rotas, três audiências bem separadas (comerciante/consumidor/admin).

---

## Base de dados
- 40 migrações sequenciais, esquema por domínio, imutabilidade de ledger reforçada (`0033_ledger_immutability.sql`), constraints de unicidade em postings (`0040`).
- **Risco de escalabilidade (ver abaixo):** saldo calculado por `SUM(CASE ... )` sobre `ledger_entries` a cada transferência.

---

## Mobile
- Flutter, uma base, duas personas. `BanzaDateFormatter` para timestamps UTC, arquitectura de splash própria. Estruturalmente são.

---

## Autenticação
- JWT HS256 com `WithExpirationRequired` e verificação explícita do método de assinatura (rejeita `alg=none`/troca de algoritmo — **correto**, este é o erro clássico evitado).
- Scopes via `RequireScope`. Claim de `environment` (LIVE/SANDBOX) no token — bom isolamento.
- **Fraqueza:** segredo único partilhado (HS256), sem rotação de chaves, TTL de 24h sem refresh nem revogação. Para um operador financeiro, JWT assimétrico (RS256/EdDSA) com rotação e lista de revogação seria o esperado.

---

## Eventos / realtime
- Webhooks com assinatura HMAC robusta (timestamp + comparação constante + janela de tolerância anti-replay).
- O CLAUDE.md exige WebSocket/SSE + Redis pub/sub para realtime; o grau de implementação realtime não foi confirmado no código inspeccionado — **a verificar**.

---

## Gargalos e dívida técnica

| # | Item | Severidade | Detalhe |
|---|---|---|---|
| 1 | **Saldo = `SUM` sobre todo o histórico de `ledger_entries` por conta, a cada transferência** | **Alta** | O(n) no nº de entradas da conta. Carteiras activas degradam-se com o tempo. Necessário snapshot/saldo materializado + reconciliação periódica. |
| 2 | **Rate limiter de transferências em memória** (`sync.Map` por processo) | **Alta** | Não funciona com múltiplas instâncias; reinicia a cada restart. Para "escala nacional" tem de ir para Redis (já presente para outros usos). |
| 3 | **EMIS stub** | **Crítica (produto)** | `initiate_payment` devolve erro; ver `06`/`07`. |
| 4 | Cobertura de testes Go: 6 ficheiros / 104 | **Média-alta** | Núcleo Rust razoavelmente testado (21); camada Go quase não. Risco em handlers financeiros. |
| 5 | Go→Rust sem auth (confia na rede loopback/firewall) | **Média** | Aceitável se a fronteira de rede for garantida; um único erro de exposição = acesso direto ao core. Defesa em profundidade recomendaria mTLS ou token interno. |
| 6 | JWT HS256, segredo único, sem rotação/revogação | **Média** | Migrar para chave assimétrica + rotação. |
| 7 | README de 1973 linhas, três repos com docs espelhadas | **Média (manutenção)** | Custo de manutenção e risco de drift; sinal de over-documentation. |
| 8 | `ACQUIRING_WEBHOOK_SECRET` com default `"change-in-production"` | **Média** | Default inseguro em código; deve falhar fechado se não definido em LIVE. |

---

## Riscos de escalabilidade (resumo)

O sistema **não está pronto para "escala nacional"** apesar de o afirmar, por três razões concretas e corrigíveis:
1. Saldo O(n) (item 1).
2. Estado de rate-limit em memória (item 2).
3. Cobertura de teste insuficiente na camada que faz dinheiro mudar de mãos (item 4).

Nenhum destes é fatal; todos são típicos de pré-escala e todos têm solução conhecida. O importante: a **forma** da arquitectura está certa, pelo que estes são problemas de *implementação dentro de uma boa estrutura*, não de *re-arquitectura*.

---

## Veredicto de arquitectura

Fundação de qualidade institucional, executada com disciplina invulgar para a fase. A dívida técnica é normal e localizada. **O maior risco arquitectural não é técnico — é de alocação:** demasiada sofisticação investida em camadas de protocolo/federação/certificação (que não escalam um único pagamento real) e dívida deixada exactamente onde o dinheiro flui (saldo O(n), rate-limit em memória, testes Go finos).

---

*Próximo: `06_security.md`.*
