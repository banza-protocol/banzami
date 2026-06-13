# 07 — Auditoria de Conformidade BANZA

**Versão:** 1.0
**Data:** 2026-06-13
**Tipo:** Auditoria estratégica — Fase 7 (Conformidade com o protocolo BANZA)
**Pergunta:** O Banzami respeita realmente o protocolo BANZA que afirma implementar?

---

## Resposta curta

**Sim, nas invariantes financeiras que importam. E essa conformidade é mais teórica do que testada contra um terceiro, porque o Banzami é hoje o único operador — não há federação real para comprovar interoperabilidade.**

---

## Verificação por área

### Wallets
- **Conforme.** Modelo wallet-native, conta `available`, reservas (`0032_wallet_reservations.sql`), identidade por @handle. Consistente com BANZA_REFERENCE (wallet-native, handle-addressable).

### Ledger
- **Conforme e exemplar.** Double-entry (`core/ledger/src/posting.rs`), invariante `assert_balanced()` (sum(débitos)==sum(créditos) por moeda) imposta no build, mínimo de 2 entradas, imutabilidade reforçada por migração (`0033`), unidades monetárias inteiras (sem float — cumpre MON-001). Isto satisfaz os invariantes financeiros centrais do protocolo.

### Liquidação (settlement)
- **Parcialmente conforme.** A lógica de settlement e reconciliação existe (`core/settlement`, `core/reconciliation`), mas **não há liquidação externa real** porque os rails (EMIS) estão por ligar. A conformidade do *desenho* está presente; a conformidade *operacional end-to-end* não pode ser demonstrada sem rail.

### Certificados / Certificação
- **Desvio de maturidade.** O CLAUDE.md e os produtos afirmam "Banzami opera no Nível 2" de certificação BANZA. A suite de conformância vive em `~/banza` (`tools/banzami-conformance`) e, segundo o histórico recente, passa 12/12 testes de Nível 2 contra o *sandbox-operator*. **Mas:** isso valida o sandbox de referência, não necessariamente o stack de produção do Banzami contra um certificador independente. Nível 2 num ecossistema com um só operador é auto-atribuído na prática.

### Operadores / Federação
- **Conforme no papel, vazia na prática.** O modelo de federação (L3 = Federation Operator, `federation-overview` com "79/79 testes, 14/14 cenários de interoperabilidade") está documentado e diagramado. Mas **federação requer ≥2 operadores**. Existe um. Logo, toda a maquinaria de federação/inter-operator payment flow é, hoje, arquitectura especulativa — corretamente desenhada, comercialmente prematura.

---

## Lista de desvios

| # | Desvio | Tipo | Gravidade |
|---|---|---|---|
| 1 | Liquidação externa não demonstrável (EMIS stub) | Operacional | Alta (bloqueia LIVE) |
| 2 | "Nível 2 certificado" é auto-atribuído (operador único, sem certificador externo) | Governança/marketing | Média |
| 3 | Federação implementada sem segundo operador que a exercite | Maturidade | Baixa (não é erro; é prematuridade) |
| 4 | Compliance/KYC/AML em esqueleto (`core/compliance`, `core/risk` mínimos) | Regulatório | **Alta** (obrigatório antes de dinheiro real em Angola) |

---

## A questão de fundo da separação BANZA/Banzami

A separação institucional (Banzami = operador independente; BANZA = protocolo aberto em `github.com/banza-protocol`) está **documentalmente coerente** e foi reforçada recentemente (governança de "Operator Independence" em `BANZA_GOVERNANCE.md`). Do ponto de vista de conformidade, o Banzami respeita a fronteira: não redefine regras de protocolo localmente, consome definições de `~/banza`.

**Crítica de auditor, sem diplomacia:** esta separação é **doutrinariamente impecável e estrategicamente cara**. Está-se a manter a disciplina de um consórcio de protocolo multi-operador (ADRs, certificação, federação, neutralidade de operador) com uma equipa que ainda não moveu um Kwanza real. A conformidade é real; o *retorno* dessa conformidade só se materializa quando existirem terceiros (operadores, reguladores, auditores) que a exijam. Hoje, é conformidade consigo mesmo.

---

## Veredicto de conformidade

O Banzami **é** conforme com BANZA onde conformidade é verificável e importa (ledger, wallets, unidades monetárias, idempotência) — e fá-lo a um nível alto. As lacunas de conformidade não são violações do protocolo; são **lacunas de maturidade operacional** (rails, KYC/AML, certificação externa) e **excesso de investimento em primitivas de ecossistema** (federação) que ainda não têm contraparte real. Em suma: o aluno cumpre o regulamento melhor do que o necessário, numa escola onde ainda é o único aluno.

---

*Próximo: `08_banzai.md`.*
