# BANZAMI_IMPLEMENTATION_MATRIX.json

Sistema de execução e validação do ecossistema Banzami.

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

## Fluxo de actualização (administração Banzami)

Todas as alterações ao estado de validação seguem obrigatoriamente este fluxo:

```
1. Editar BANZAMI_IMPLEMENTATION_MATRIX.json localmente
2. Commit com mensagem descritiva (fix(validation): ou feat(validation):)
3. Push para origin/main
4. Deploy via ./deploy.sh docs-frontend
```

Nenhuma alteração pode ser feita directamente em produção, via interface web, ou fora deste fluxo.

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
