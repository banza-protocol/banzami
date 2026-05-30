# Alignment Fixes

**Version:** 1.0
**Date:** 2026-05-29
**Audit:** BANZAMI-CANONICAL-ALIGNMENT-AUDIT-013
**Status:** Complete — 11 fixes, 3 critical

---

## Priority 1 — FALSE (must fix immediately)

### FIX-001 — Roadmap: Protocol OS listed as "vision" when it's built

**File:** `/Users/fm65/Banza/apps/docs/app/roadmap/page.tsx`  
**Line:** 49  
**Issue (E — False):** "Protocol Operating System" has `status: 'vision'` but is fully implemented.

```diff
- { id: 'r26', status: 'vision', title: 'Protocol Operating System',
-   description: 'BanzamIA becomes the OS of the Banzami ecosystem — understand, explain, validate, simulate, predict, guide, and certify.', tags: ['Vision'] },
+ { id: 'r26', status: 'completed', title: 'Protocol Operating System',
+   description: 'BanzamIA is the Protocol Operating System of the Banzami ecosystem — Compreender, Explicar, Validar, Simular, Prever, Guiar, Certificar, Federar.', tags: ['Protocol OS'] },
```

---

### FIX-002 — BANZA_REFERENCE.md: "8 modules" when 16 exist

**File:** `/Users/fm65/Banza/docs/BANZA_REFERENCE.md`  
**Lines:** 782–798  
**Issue (E — False):** States BanzAI has 8 modules; actual count is 16.

```diff
- O BanzamIA disponível publicamente em `banzami.org/banzamia` é composto por oito módulos especializados:
- 
- ![Arquitectura do Produto BanzamIA — 8 módulos especializados](/images/architecture/banzamia-product-architecture.svg)
- 
- | Módulo | Função |
- |--------|--------|
- | **Chat** | Q&A sobre o protocolo, fundamentado em citações de RFC e ADR |
- | **Operator Builder** | Criação guiada de manifesto de operador |
- | **Conformance** | Runner de testes de conformidade e análise de resultados |
- | **Manifest Validator** | Validação estrutural e semântica de manifestos |
- | **Trace Explainer** | Reconstrução de linha temporal causal e verificação de invariantes |
- | **SDK Assistant** | Geração de código e orientação de integração SDK |
- | **RFC/ADR Explorer** | Pesquisa e explicação de documentos de governança |
- | **Knowledge Search** | Pesquisa semântica sobre documentação do protocolo via Qdrant |

+ O BanzamIA disponível publicamente em `banzami.org/banzamia` é composto por dezasseis módulos especializados, organizados em três camadas:
+
+ ![Protocol Operating System — 8 capacidades em órbita em torno do núcleo BanzamIA](/images/architecture/protocol-operating-system.svg)
+
+ **Camada de Protocolo — Conhecimento e Raciocínio**
+
+ | Módulo | Função |
+ |--------|--------|
+ | **Chat** | Q&A sobre o protocolo, fundamentado em citações de RFC e ADR |
+ | **Protocol Research** | Pesquisa multi-passo agentic — planeia, recupera, percorre o grafo, sintetiza |
+ | **Protocol Graph** | Explorador visual do grafo de protocolo (17 tipos de nó, 11 tipos de relação) |
+ | **Knowledge Search** | Pesquisa semântica sobre documentação do protocolo via Qdrant |
+ | **RFC/ADR Explorer** | Pesquisa e explicação de documentos de governança |
+
+ **Camada de Operador — Construção e Certificação**
+
+ | Módulo | Função |
+ |--------|--------|
+ | **Operator Builder** | Criação guiada de manifesto de operador |
+ | **Certification Copilot** | Análise de readiness L0–L4, score 0–100%, roadmap de certificação |
+ | **Conformance** | Runner de testes de conformidade e análise de resultados |
+ | **Manifest Validator** | Validação estrutural e semântica de manifestos |
+ | **Protocol Simulator** | Análise what-if determinística — impacto de alterações de capacidades |
+
+ **Camada de Inteligência — Análise e Federação**
+
+ | Módulo | Função |
+ |--------|--------|
+ | **Trace Explainer** | Reconstrução de linha temporal causal e verificação de invariantes |
+ | **SDK Assistant** | Geração de código e orientação de integração SDK |
+ | **Federation Intelligence** | Análise de compatibilidade de federação — score 0–100, conflitos, bloqueadores |
+ | **Protocol Memory** | Registo contínuo da jornada do operador — assessments, milestones, trajectória |
+ | **Digital Twin** | Representação virtual completa do operador no protocolo |
+ | **Quality Dashboard** | Métricas do sistema BanzamIA — RAG, Protocol Graph, Qdrant, ferramentas |
```

---

### FIX-003 — BANZA_REFERENCE.md: SVG caption references old 8-module diagram

**File:** `/Users/fm65/Banza/docs/BANZA_REFERENCE.md`  
**Line:** 784  
**Issue (E — False):** Caption says "8 módulos especializados" — already addressed in FIX-002 above.

---

## Priority 2 — MISLEADING (fix before next public communication)

### FIX-004 — Banza kernel README: Shopify/WooCommerce as integrations

**File:** `/Users/fm65/Banzami/README.md`  
**Line:** 54  
**Issue (D — Misleading):** Lists Shopify and WooCommerce as provided integrations. These conflict with the Africa-first, no-western-platform strategy, and the directories are empty.

```diff
- - **Integration plugins** — WooCommerce, Shopify, Laravel, Node.js, PHP
+ - **Integration plugins** — Generic payment plugins for African commerce platforms (WooCommerce adapter, generic PHP/Laravel, Node.js)
```

Also update line 104 in the ecosystem diagram:
```diff
- │  WooCommerce │
+ │  Plugins     │
```

And update the `integrations/` section of the directory tree:
```diff
- ├── integrations/           Commerce and framework integrations
- │   └── plugins/
+ ├── integrations/           Commerce and framework plugins
+ │   └── plugins/            Generic payment plugins (WooCommerce, PHP/Laravel, Node.js)
```

---

## Priority 3 — PARTIALLY OUTDATED (fix within 1 week)

### FIX-005 — BanzAI standalone README: Missing Protocol OS framing and new modules

**File:** `/Users/fm65/BanzamIA/README.md`  
**Issue (C — Partially Outdated):** Missing Protocol OS canonical framing and 8 new modules.

Replace the opening description:
```diff
- **The intelligence layer of the Banzami programmable financial infrastructure ecosystem.**
- 
- BanzamIA is not a generic AI assistant. It is a:
- 
- - Financial infrastructure reasoning engine
- - Operator certification intelligence system
- - Protocol integration copilot
- - Conformance and governance advisor
- - Architecture review system for financial primitives

+ **The Protocol Operating System of the Banzami ecosystem.**
+
+ BanzamIA is not a chatbot. It is not a generic AI assistant. It is the cognitive interface of the Banzami protocol.
+
+ ```
+ Tools determine truth. AI explains truth.
+ ```
+
+ BanzamIA is the Protocol Operating System — an orchestrated AI system that combines RAG, Protocol Graph, deterministic validation tools, and certification logic into 16 specialized modules:
+
+ | Capability | Modules |
+ |-----------|---------|
+ | **Compreender** | RAG · Knowledge Search · Protocol Graph |
+ | **Explicar** | Chat · Protocol Research · RFC/ADR Explorer |
+ | **Validar** | Conformance · Manifest Validator · Trace Explainer |
+ | **Simular** | Protocol Simulator |
+ | **Prever** | Protocol Memory · Quality Dashboard |
+ | **Guiar** | Operator Builder · SDK Assistant · Digital Twin |
+ | **Certificar** | Certification Copilot |
+ | **Federar** | Federation Intelligence |
```

---

### FIX-006 — sobre-banzamia page metadata: Incomplete capability description

**File:** `/Users/fm65/Banza/apps/docs/app/sobre-banzamia/page.tsx`  
**Issue (B — Incomplete):** SEO description covers only 3 of 8 capabilities.

```diff
- description: 'BanzamIA — o Agente de Protocolo nativo de IA para construir, validar e certificar operadores Banzami.',
+ description: 'BanzamIA — o Sistema Operativo do Protocolo Banzami. Compreender, explicar, validar, simular, certificar e federar operadores. Ferramentas determinam a verdade. A IA explica a verdade.',
```

```diff
-     description: 'O Agente de Protocolo nativo de IA. Public Product · Developer Portal · Operator Platform.',
+     description: 'O Sistema Operativo do Protocolo Banzami. 16 módulos especializados — Protocol Graph, RAG, Certification Copilot, Federation Intelligence, Digital Twin, Protocol Simulator.',
```

---

### FIX-007 — Banza kernel README: BanzAI omitted from main ecosystem diagram

**File:** `/Users/fm65/Banzami/README.md`  
**Issue (C — Partially Outdated):** Main ASCII ecosystem diagram doesn't include BanzAI.

The existing ASCII diagram ends with `→ BANZA`. It should show:

```diff
  ┌──────────────────────────────────────┐
  │             BANZA                    │
  │  First Commercial Operator           │
  │  Consumer app · Merchant app         │
  │  EMIS/Multicaixa adapters            │
  │  Production infra · Ops              │
  │  Compliance · Risk rules             │
  └──────────────────────────────────────┘
+                   │
+                   ▼
+ ┌──────────────────────────────────────┐
+ │            BanzamIA                  │
+ │  Protocol Operating System           │
+ │  banzami.org/banzamia                │
+ │  16 modules · RAG · Protocol Graph   │
+ │  Certification · Federation · Memory │
+ └──────────────────────────────────────┘
```

---

## Priority 4 — TRUE BUT INCOMPLETE (enrich when time permits)

### FIX-008 — BANZA_REFERENCE.md §1: "produto principal" narrative tension

**File:** `/Users/fm65/Banza/docs/BANZA_REFERENCE.md`  
**Issue (B — Incomplete):** "Banzami é o produto principal do Banza" could be read as Banza = Banzami's company.

Add clarifying sentence:
```diff
- **Banza** é o produto principal do Banzami: a rede angolana de pagamentos instantâneos por QR Code.
+ **Banza** é o produto principal do Banzami e o primeiro operador certificado do protocolo: a rede angolana de pagamentos instantâneos por QR Code. Qualquer organização pode implementar o protocolo Banzami — Banza é apenas a primeira a fazê-lo.
```

---

### FIX-009 — sobre-banzamia: No BanzAI context before CTA

**File:** `/Users/fm65/Banza/apps/docs/app/sobre-banzamia/page.tsx`  
**Issue (B — Incomplete):** Visitor reaches this page from the sidebar and immediately sees a CTA "Abrir BanzAI →" without any context on what they'll find.

Add a brief intro line above the CTA:
```
O BanzamIA é o Sistema Operativo do Protocolo Banzami — 16 módulos especializados que tornam o protocolo compreensível, validável e certificável.
```

---

### FIX-010 — Homepage: BanzAI widget without context

**File:** `/Users/fm65/Banza/apps/docs/app/page.tsx`  
**Issue (B — Incomplete):** `<HomeBanzamIAEntry />` appears immediately after the hero without explaining why a payments infrastructure has a Protocol OS.

The `HomeBanzamIAEntry` component itself should display a 1–2 line positioning statement before the chat widget:
```
BanzamIA é o Sistema Operativo do Protocolo — faz perguntas sobre o protocolo, simula cenários, valida manifestos e guia a certificação.
```

---

### FIX-011 — BanzAI standalone README: Architecture section outdated

**File:** `/Users/fm65/BanzamIA/README.md`  
**Issue (C):** The `core/` folder structure listed doesn't match the actual `apps/banzamia/src/` structure.

The standalone README shows `core/orchestrator/`, `core/routing/` etc. but the live implementation in `Banzami/apps/banzamia/` uses `src/routes/`, `src/rag/`, `src/graph/`, `src/tools/`, `src/memory/`. These are divergent architectures — both valid but should be documented separately to avoid confusion.

---

## Fix Priority Matrix

| Fix | Effort | Impact | Do First? |
|-----|--------|--------|-----------|
| FIX-001 (roadmap vision→completed) | 2 min | High — live page shows false info | YES |
| FIX-002 (8→16 modules in reference) | 30 min | High — canonical source is wrong | YES |
| FIX-006 (metadata description) | 5 min | Medium | YES |
| FIX-004 (Shopify/WooCommerce) | 10 min | Medium | This week |
| FIX-005 (standalone README) | 45 min | Medium | This week |
| FIX-007 (ecosystem diagram + BanzAI) | 15 min | Medium | This week |
| FIX-008 (produto principal tension) | 5 min | Low | When convenient |
| FIX-009 (sobre-banzamia intro) | 10 min | Low | When convenient |
| FIX-010 (homepage BanzAI context) | 15 min | Medium | This week |
| FIX-011 (standalone arch outdated) | 30 min | Low | Next sprint |
