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

## Como actualizar

1. Actualizar `BANZAMI_REFERENCE.md` primeiro (ADR-015 — referência é canónica)
2. Criar ou actualizar o item correspondente neste JSON
3. Adicionar evidência quando o item transita para IMPLEMENTED ou VALIDATED
4. Deploy do site de documentação para reflectir alterações

## Site de validação

Acessível em `/validacao` — renderiza este JSON com filtros, pesquisa e métricas de progresso.

Derivado de: `BANZAMI_REFERENCE.md` · ADR-015
