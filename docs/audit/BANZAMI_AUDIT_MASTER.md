# BANZAMI — Relatório Executivo de Auditoria Estratégica

**Versão:** 1.0
**Data:** 2026-06-13
**Âmbito:** Todo o projecto (`~/banzami`, `~/banza`, `~/banzai`)
**Postura:** Comité de investimento a decidir um cheque de 5 M USD. Sem diplomacia, sem marketing, sem proteger egos.
**Documentos de suporte:** `01_inventory` · `02_product` · `03_ux` · `04_business` · `05_architecture` · `06_security` · `07_banza_compliance` · `08_banzai` · `09_gtm`

---

## TL;DR para o comité

O Banzami é um **projecto de engenharia raro: uma fundação de pagamentos de qualidade institucional, construída com disciplina invulgar, provavelmente por uma equipa muito pequena.** Resolve um problema real e grande (pagamentos instantâneos em Kwanza num país dependente de dinheiro físico) com o modelo certo (wallet-native, QR, @handle — Pix/M-Pesa, não Stripe).

E, ao mesmo tempo, é um **caso de manual de má alocação de prioridades de fundador técnico:** investiu-se profundamente numa catedral de protocolo aberto, certificação, federação e "Protocol OS" assistido por IA — antes de mover **um único Kwanza real** e antes de ter **um único utilizador**. O caminho de dinheiro real (EMIS) é um stub. A autenticação de consumidor tem um furo de brute-force. Não há tracção de mercado de nenhum tipo.

**Não escreveria o cheque de 5 M hoje.** Escreveria um cheque menor, *milestone-based*, condicionado a uma única coisa: provar entrada+saída de Kwanza real e os primeiros 100 utilizadores reais num corredor. Se isso acontecer em 90 dias, a fundação técnica torna isto altamente financiável.

---

## O que está EXCELENTE

1. **Núcleo financeiro Rust.** Double-entry ledger imutável com invariante imposta no build; transferências atómicas com `SELECT FOR UPDATE`; saldo derivado do ledger (não campo mutável); idempotência em todo o lado; unidades monetárias inteiras. Isto é como se constrói dinheiro a sério. Raro nesta fase.
2. **Disciplina de arquitectura.** Fronteiras de linguagem rígidas (Rust escreve, Go serve), modular monolith em vez de microserviços prematuros, PostgreSQL como verdade única.
3. **Segurança de webhooks.** HMAC-SHA256 + timestamp + comparação em tempo constante + janela anti-replay. Feito corretamente.
4. **Modelo de produto.** Wallet-native + @handle + QR é exactamente o modelo que vence em mercados emergentes.

## O que está BOM

1. Amplitude do que existe (19 domínios core, 3 serviços, 6 apps, 6 SDKs, 40 migrações) — construído por uma equipa aparentemente pequena.
2. SDKs tipados, idempotentes, com webhooks assinados — prontos para integração.
3. Isolamento LIVE/SANDBOX via claim de ambiente no token.
4. Separação institucional BANZA/Banzami documentalmente coerente.
5. BanzAI tem substância técnica real (conformance-runner, manifest-validator).

## O que está FRACO

1. **Cobertura de testes na camada Go** (6 ficheiros / 104) — fina exactamente onde o dinheiro passa pela API.
2. **Escalabilidade:** saldo O(n) por `SUM` sobre `ledger_entries`; rate-limiter em memória (não multi-instância).
3. **Comunicação de produto:** a proposta de valor está soterrada sob jargão de protocolo.
4. **Onboarding de developer:** README de ~2000 linhas; falta o quickstart de 5 minutos.
5. **JWT HS256** com segredo único, sem rotação nem revogação.

## O que está ERRADO

1. **EMIS é um stub** (`initiate_payment` devolve erro; provider por omissão é `Simulated`). **Não há caminho de dinheiro real.** Este é o defeito que define tudo o resto. (`07`, `09`)
2. **Login de consumidor sem rate-limit/lockout + handles enumeráveis** = risco de takeover por brute-force de PIN. (`06` HIGH-1)
3. **KYC/AML em esqueleto** — gating regulatório para operar em Angola.
4. **Inversão de prioridades:** federação/certificação/BanzAI construídos antes de produto-com-tracção.

## O que deve ser REMOVIDO (ou congelado)

1. **Federação** do roadmap de 12 meses — requer ≥2 operadores; existe 1. Congelar.
2. **BanzAI** como linha de investimento activa — congelar; é upside de fase B+. (`08`)
3. **Plugins Shopify/WooCommerce** — desalinhados com a estratégia de mercado local (a própria estratégia de produto desaconselha plataformas ocidentais).
4. **Excesso de documentação espelhada** em três repos — consolidar; é custo de manutenção e fonte de drift.

## O que deve ser SIMPLIFICADO

1. **A narrativa pública** → "Banzami: paga e recebe Kwanza ao instante." BANZA/BanzAI passam a decisões internas de arquitectura, invisíveis ao mercado.
2. **O onboarding de developer** → uma página, chave sandbox em 1 clique, exemplo táxi funcional.
3. **O modelo mental do projecto** → um produto (Banzami), não três marcas.

## O que deve ser CONSTRUÍDO a seguir

1. **Rail real: EMIS/Multicaixa funding + payout bancário.** Tudo depende disto.
2. **Rate-limit + lockout + 2FA** no login antes de qualquer LIVE.
3. **KYC/AML mínimo viável** + enquadramento BNA.
4. **Saldo materializado** + reconciliação (remover O(n)).
5. **Quickstart de developer** + 1 app piloto (táxi/entregas/DOA).

---

## Top 10 prioridades (por ordem)

1. Fechar acordo de rail (EMIS/Multicaixa ou banco parceiro) — funding + payout reais.
2. Enquadramento regulatório BNA + KYC/AML mínimo.
3. Corrigir HIGH-1 (rate-limit/lockout no login) e adicionar 2FA.
4. Pentest externo antes de processar dinheiro real.
5. Quickstart de developer + 1 integração piloto a funcionar.
6. Conquistar um corredor: 10–30 comerciantes + os seus consumidores.
7. Saldo materializado + rate-limit em Redis (remover gargalos de escala).
8. Subir cobertura de testes da camada Go (handlers financeiros).
9. Recolapsar narrativa pública para o produto Banzami; congelar federação/BanzAI publicamente.
10. JWT assimétrico + rotação; segredos que falham fechado em LIVE.

---

## Roadmap 30 dias — "Provar que o dinheiro se mexe"

- Assinar/avançar acordo de rail (mesmo que sandbox EMIS real).
- Implementar `EMISProvider::initiate_payment` real + callback mapeado.
- Fechar HIGH-1 (login rate-limit/lockout) + PIN mínimo 6 dígitos.
- Quickstart de developer (1 página) + chave sandbox self-service.
- Escolher o corredor-piloto e o app-piloto.
- Decisão executiva: congelar federação e BanzAI; recolapsar narrativa.

## Roadmap 90 dias — "Primeiros utilizadores reais"

- Funding + payout reais a funcionar end-to-end com Kwanza real (volume controlado).
- KYC/AML mínimo + conformidade BNA em curso.
- 2FA + pentest externo concluído.
- 1 app piloto em produção a aceitar pagamentos reais.
- Corredor-piloto: primeiros 10–30 comerciantes + ~100 consumidores activos.
- Saldo materializado + rate-limit em Redis em produção.
- Métricas reais: GMV, transacções/dia, retenção a 7/30 dias.

## Roadmap 12 meses — "Densidade e prova de modelo"

- Múltiplos corredores; primeiras empresas/marketplaces integradas via SDK.
- Cobertura de testes e observabilidade a nível operador nacional.
- Caso de referência público (ex.: app de táxi/entregas a liquidar instantaneamente).
- Decisão informada — *com base em tracção real* — sobre se/quando reactivar a tese de protocolo/federação.
- **Fora do roadmap de 12 meses:** segundo operador BANZA / federação / BanzAI como produto externo (fase B+).

---

## Classificação

| Dimensão | Nota | Justificação de uma linha |
|---|---:|---|
| **Produto** | 6/10 | Problema e modelo certos; comunicação e foco soterrados em meta-arquitectura. |
| **UX** | 6/10 | Fluxos competentes e bem modelados; bloqueada por falta de rail e fragilidade de auth. |
| **Tecnologia** | 7/10 | Núcleo financeiro excelente; testes Go finos, stubs, gargalos de escala. |
| **Segurança** | 5/10 | Núcleo seguro por construção; perímetro de consumidor com furo de brute-force. |
| **Escalabilidade** | 5/10 | Forma certa; saldo O(n) e rate-limit em memória travam "escala nacional". |
| **Mercado** | 5/10 | Oportunidade enorme e real; captura por validar, rail inexistente. |
| **Execução** | 5/10 | Capacidade de construção altíssima; sequenciação de prioridades invertida. |

### **Nota Final: 5.5 / 10**

Não é a nota de um projecto mau — é a nota de um **projecto excepcionalmente construído a executar a estratégia errada primeiro.** A distância entre 5.5 e 8.0 não é mais engenharia: é um acordo de rail, um furo de segurança fechado, e a primeira rua conquistada. Poucas equipas têm a fundação técnica que esta tem; poucas a desperdiçaram tão eficientemente em camadas que o mercado ainda não pediu.

---

## Veredicto de investimento (5 M USD)

**PASS condicional.** Não no cheque completo, não hoje. Estrutura recomendada: tranche inicial pequena (de-risking), com libertação dos 5 M condicionada a **três provas em 90 dias**:
1. Kwanza real entra e sai da rede (rail provado end-to-end).
2. HIGH-1 fechado + pentest externo limpo.
3. ≥100 utilizadores reais activos num corredor, com retenção mensurável.

Se a equipa redireccionar a sua evidente capacidade de engenharia da catedral de protocolo para estas três provas, **isto torna-se altamente financiável** — a fundação já lá está. Se insistir em federação/certificação/Protocol OS antes de tracção, é um pass definitivo: tecnologia bonita à procura de um mercado que nunca conhecerá.

---

*Fim do relatório executivo. Auditoria realizada por inspecção directa do código-fonte. Achados de segurança são estáticos e requerem confirmação por pentest dinâmico antes de produção.*
