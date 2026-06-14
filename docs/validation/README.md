# BANZAMI_IMPLEMENTATION_MATRIX.json

Sistema de execução e validação do ecossistema Banza.

---

## Modelo de governança

**Git é a camada de governança.**
**O Validation Studio é apenas a camada visual operacional em cima do Git.**
**O Claude nunca aplica directamente uma alteração de estado — apresenta sempre uma proposta que requer confirmação humana.**

Não existe interface de edição em produção. Não existe painel de administração remoto.

Toda a história de alterações é imutável e auditável via Git. Qualquer alteração pode ser revertida. O estado de produção é sempre derivado do repositório Git via deploy explícito.

---

## Claude validation commands

Claude Code inclui comandos slash de validação assistida. Claude inspecciona a implementação, verifica os critérios de aceitação e **propõe** uma actualização — nunca escreve sem a frase de aprovação exacta.

| Comando | Descrição |
|---------|-----------|
| `/validate-feature QR-001` | Inspecciona e propõe validação de um item específico |
| `/validate-current` | Detecta automaticamente o item em curso e propõe validação |
| `/validation-propose QR-001` | Gera proposta apenas — nunca escreve nada |
| `/validation-apply QR-001` | Aplica uma proposta já gerada nesta conversa |

### Frases de aprovação obrigatórias

As alterações de validação são acções de governança. Requerem frases exactas com fingerprint — nenhuma outra formulação é aceite.

| Acção | Frase exacta obrigatória |
|-------|--------------------------|
| Aplicar alteração ao JSON | `APPROVE VALIDATION QR-001 a84f9e2d1c3b5f7e` |
| Criar commit git | `APPROVE COMMIT QR-001` |

O fingerprint é gerado na proposta e deve ser incluído literalmente. Sem fingerprint, a aprovação é rejeitada.

**Rejeitado explicitamente:** `yes` · `ok` · `confirm` · `go` · `apply` · `pode avançar` · `sim` · `continua` · `approved` · qualquer paráfrase · frase sem fingerprint

### Regra multi-item

Se múltiplos itens forem afectados, cada item requer aprovação individual com o seu fingerprint:

```
APPROVE VALIDATION QR-001 a84f9e2d1c3b5f7e
APPROVE VALIDATION WH-001 3c7a2f9e4b1d8a5f
```

Aprovação em lote não existe.

### Separação de fases

Aplicar a alteração ao JSON e commitar são fases separadas, cada uma com a sua própria frase de aprovação. Aplicar não comita automaticamente.

**Regra absoluta:** Claude não pode aplicar alterações de estado sem proposta prévia e frase de aprovação exacta com fingerprint.

---

## Primitivas avançadas de governança

### Validation Fingerprints

Cada proposta de validação gera um fingerprint determinístico de 16 caracteres hexadecimais:

```bash
echo -n "QR-001|$(git diff -- docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json | sha256sum | cut -c1-16)" | sha256sum | cut -c1-16
```

O fingerprint incorpora:
- o ID do item,
- o estado actual do ficheiro JSON (via git diff),
- o estado proposto (status, evidências, invariantes).

**Se a implementação mudar entre a proposta e a aprovação, o fingerprint não corresponde e a operação é abortada.** É necessário gerar uma nova proposta.

O fingerprint aparece no diff modal do Studio e em cada entrada do histórico imutável.

---

### Immutable Validation History

Cada item tem um campo `history[]` append-only. Quando um status muda, é adicionada uma entrada — nunca se modificam entradas existentes.

```json
{
  "timestamp": "2026-05-20T14:30:00Z",
  "from": "IN_PROGRESS",
  "to": "IMPLEMENTED",
  "approvedBy": "local-admin",
  "fingerprint": "a84f9e2d1c3b5f7e",
  "reason": "QR generation and scan flow implemented and verified",
  "evidence": ["core/qr/generator.rs:1-120", "services/qr-service/handler.go:45-90"]
}
```

Campos imutáveis após escrita: `timestamp`, `from`, `to`, `approvedBy`, `fingerprint`, `reason`, `evidence`.

O campo `commit` é opcional e pode ser adicionado após o commit git (nunca retroactivamente aos outros campos).

**A história é o registo de auditoria governamental. Nunca pode ser editada, truncada ou reordenada.**

---

### Financial Invariant Validation

As categorias financeiramente críticas requerem que todos os invariantes sejam `PASS` antes de `VALIDATED` ser proposto.

**Categorias críticas:**

| Category ID | Área |
|-------------|------|
| `cat-ledger` | Ledger engine |
| `cat-wallet` | Wallet engine |
| `cat-p2p` | P2P transfers |
| `cat-qr` | QR payments |
| `cat-payouts` | Payouts |
| `cat-refunds` | Refunds |

**Estatutos de invariante:**

| Status | Significado |
|--------|-------------|
| `PASS` | Invariante verificado — comportamento confirmado |
| `FAIL` | Invariante violado — bloqueia VALIDATED |
| `UNKNOWN` | Não verificado — bloqueia VALIDATED |
| `NOT_RUN` | Verificação ainda não executada — bloqueia VALIDATED |

Exemplo de invariante em JSON:

```json
{
  "id": "INV-LED-001",
  "name": "Double-entry balance",
  "rule": "Sum of all ledger entries must equal zero at all times",
  "status": "PASS",
  "lastChecked": "2026-05-20"
}
```

Se qualquer invariante não for `PASS` numa categoria crítica, `VALIDATED` não pode ser proposto. O Claude reporta cada invariante bloqueante.

---

### Architecture Lock Rules

Um item não pode transitar para `VALIDATED` enquanto qualquer item listado no seu campo `requires[]` não for `VALIDATED`.

```json
"requires": ["LED-001", "WAL-001"]
```

Neste exemplo, o item só pode ser marcado como `VALIDATED` depois de `LED-001` e `WAL-001` estarem ambos `VALIDATED`.

**Comportamento:**
- O Studio mostra o estado de cada dependência em tempo real no editor.
- Um ícone de cadeado aparece na lista para itens bloqueados por dependências não validadas.
- O Claude rejeita qualquer proposta de `VALIDATED` que viole a lock, mesmo com fingerprint correcto e invariantes PASS.
- A lock é verificada na proposta E na aplicação (segurança dupla).

O campo `requires[]` é distinto do campo `dependencies[]` (informativo). Apenas `requires[]` tem efeito de bloqueio.

---

## Propósito

Este ficheiro é a base de dados operacional do sistema de validação — mapeia cada funcionalidade descrita em `BANZAMI_REFERENCE.md` ao seu estado de implementação, evidências e critérios de aceitação.

## Regra fundamental

**`BANZAMI_REFERENCE.md` define o QUÊ.**
**`BANZAMI_IMPLEMENTATION_MATRIX.json` prova o QUÊ existe, o que funciona e o que falta.**

Nada pode aparecer como VALIDATED sem evidência. Nada pode ser marcado como IMPLEMENTED sem existir código real.

## Estatutos

| Status | Significado |
|--------|-------------|
| `VALIDATED` | Implementado E validado com evidência documentada |
| `IMPLEMENTED` | Implementado mas sem validação formal |
| `IN_PROGRESS` | Em desenvolvimento activo |
| `PLANNED` | Planeado, ainda não iniciado |
| `FUTURE` | Roadmap — médio/longo prazo |
| `BLOCKED` | Bloqueado por dependência externa (ex: EMIS, regulação) |
| `NEEDS_REVIEW` | Requer revisão — segurança, arquitectura ou produto |

## Prioridades

| Prioridade | Critério |
|------------|---------|
| `CRITICAL` | Bloqueia o produto core ou a segurança financeira |
| `HIGH` | Necessário para operação em produção |
| `MEDIUM` | Importante mas não bloqueante |
| `LOW` | Nice-to-have ou roadmap distante |

## Política de acesso — página pública somente de leitura

A página `/validacao` é um espelho público do estado de execução. É exclusivamente de leitura.

**Utilizadores públicos podem:**
- consultar todos os itens,
- filtrar por estado, prioridade e categoria,
- pesquisar por palavra-chave,
- expandir detalhes de cada item.

**Utilizadores públicos NÃO podem:**
- editar estados ou prioridades,
- criar ou eliminar itens,
- modificar evidências ou critérios,
- escrever no ficheiro JSON,
- aceder a qualquer endpoint de escrita.

Não existe interface de edição pública. Não existe API de escrita. Não existe modo admin no browser. A arquitectura é somente de leitura por construção — o JSON é lido em build time pelo servidor e nunca exposto como activo mutável.

## Local Validation Studio

Ferramenta gráfica de edição exclusivamente local — nunca deployada, nunca exposta publicamente.

```bash
# A partir da raiz do repositório:
npm run studio:validation
```

Abre em: `http://localhost:3099`

O Studio permite editar itens com interface visual, verificação de governança em tempo real, pré-visualização de diff campo a campo, e commit git integrado. Aplica todas as regras de governança antes de permitir gravação em disco.

**Regras de segurança do Studio:**
- Corre exclusivamente em localhost
- Recusa arrancar se `NODE_ENV === production`
- Não tem build de produção
- Não é exposto via nginx nem incluído em Docker de produção

Ver `apps/validation-studio/README.md` para documentação completa.

## Fluxo de actualização (administração Banzami)

Todas as alterações ao estado de validação seguem obrigatoriamente este fluxo:

```
1. Abrir Validation Studio (npm run studio:validation)
2. Editar item com interface visual — governança verificada automaticamente
3. Guardar em disco via "Pré-visualizar e guardar"
4. Criar commit via botão "Git Commit" no Studio
5. Push para origin/main (manual: git push origin main)
```

Também é possível editar `BANZAMI_IMPLEMENTATION_MATRIX.json` directamente com um editor de texto, seguindo o mesmo fluxo de commit e deploy.

Nenhuma alteração pode ser feita directamente em produção, via interface web pública, ou fora deste fluxo.

## Regras antes de alterar um estado

| Transição | Requisito obrigatório |
|-----------|----------------------|
| → `IMPLEMENTED` | Código real existe no repositório, ficheiro de evidência referenciado |
| → `VALIDATED` | Evidência documentada e verificável no campo `evidence[]` |
| → `BLOCKED` | Campo `blockingIssues[]` preenchido com descrição da causa |
| → `IN_PROGRESS` | Trabalho activo iniciado, sem evidência ainda necessária |
| Qualquer | `lastUpdated` actualizado para a data da alteração |

**Nunca marcar como `VALIDATED` sem evidência.** Um item VALIDATED sem entradas em `evidence[]` é considerado um erro de dados.

## Como actualizar

1. Actualizar `BANZAMI_REFERENCE.md` primeiro (ADR-015 — referência é canónica)
2. Criar ou actualizar o item correspondente neste JSON
3. Adicionar evidência quando o item transita para IMPLEMENTED ou VALIDATED
4. Actualizar `meta.lastUpdated` e o `lastUpdated` do item
5. Deploy do site de documentação para reflectir alterações

## Site de validação

Acessível em `/validacao` — renderiza este JSON com filtros, pesquisa e métricas de progresso.

Derivado de: `BANZAMI_REFERENCE.md` · ADR-015

---

## Governance Primitive Freeze

### Estado

A arquitectura de governança de validação está **madura e suficiente**.

As seguintes camadas são consideradas estáveis e fundacionais:

- BANZAMI_REFERENCE.md
- Validation Matrix
- Página pública /validacao
- Local Validation Studio
- Validation Fingerprints
- Immutable Validation History
- Financial Invariants + Invariant Taxonomy
- Validation Domains (11 DOM-*)
- Confidence Scores (limiar = 80)
- Freeze / Revalidation Rules
- Strict Human Approval Gates
- Git-based Governance
- Architecture Lock Rules
- Claude Validation Commands

### Regra de congelamento

**Nenhuma nova primitiva de governança deve ser introduzida sem uma necessidade operacional concreta.**

Justificações aceites:

1. Um problema real de implementação surge
2. Uma questão de segurança real é identificada
3. Um bottleneck operacional real é encontrado
4. Um requisito de auditoria ou conformidade real aparece
5. Um problema real de escalamento do produto emerge

**Não aceite:**

- elegância teórica
- abstracções sem valor operacional
- camadas meta-governança
- complexidade especulativa

Qualquer nova proposta de governança deve responder:

- Que problema concreto resolve?
- Por que as primitivas existentes são insuficientes?
- Qual é o impacto operacional versus o custo de complexidade?

### Prioridade actual

A prioridade do projecto é agora **execução do produto**.

O foco move-se para: carteiras, fluxos QR, UX do comerciante (Banza Business), UX do consumidor, liquidação e reconciliação, SDKs, sandbox, pagamentos em circuito fechado, integrações de ecommerce e app móvel.

O sistema de governança existe para apoiar este trabalho.
**Não pode tornar-se mais complexo do que o produto que governa.**
