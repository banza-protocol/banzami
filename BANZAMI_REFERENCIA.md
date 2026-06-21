# BANZAMI_REFERENCIA.md

**Version:** 1.0
**Estado:** Documento-mãe para o website oficial (fonte única de verdade)
**Idioma:** Português
**Domínio:** `banzami.com`
**Contacto:** `contact@banzami.com`

> Este ficheiro **não é o website**. É o documento de referência que será entregue
> ao Claude Design para construir o site oficial do Banzami em português. Todo o
> conteúdo aqui é verdadeiro, controlado e coerente com o estado real do projeto.
> As secções 24, 25 e 26 (claims permitidas, claims proibidas e informação
> sensível) são **vinculativas** e prevalecem sobre qualquer texto criativo.

---

## Índice

1. Identidade oficial
2. Definição simples
3. Posicionamento estratégico
4. Problema que o Banzami resolve
5. Solução Banzami
6. Produtos principais
7. Público-alvo
8. Como o dinheiro se move
9. Arquitectura técnica
10. Developer Platform
11. Comerciante / Merchant
12. Consumidor
13. Impacto nacional
14. BANZA, Banzami e BanzAI
15. Estado real do projeto
16. Validation Studio
17. BANZA conformance
18. Segurança, confiança e compliance
19. Cores oficiais e identidade visual
20. Estrutura recomendada do website
21. Homepage recomendada
22. Conteúdo textual pronto para o site
23. FAQ
24. Claims permitidas
25. Claims proibidas
26. Informação sensível a evitar no site
27. Brief para Claude Design

---

## 1. Identidade oficial

| Campo | Valor |
|---|---|
| Nome | **Banzami** |
| Domínio oficial | `banzami.com` |
| Email oficial | `contact@banzami.com` |
| País principal | **Angola** |
| Moeda | **Kwanza (AOA)** |
| Natureza | Rede de pagamentos **wallet-native** e instantânea |
| Repositório | `github.com/banzami/banzami` |
| Construído sobre | O protocolo aberto **BANZA** (`github.com/banza-protocol/banza`) |

**Relação com o BANZA**
O Banzami é o **primeiro operador** construído sobre o protocolo aberto BANZA. O
Banzami **não é** o BANZA. O BANZA é o protocolo (regras financeiras, invariantes,
contratos, framework de certificação). O Banzami é o produto/operador que
implementa esse protocolo como uma rede de pagamentos para Angola. O protocolo
existe independentemente do Banzami.

**Relação com o BanzAI**
O **BanzAI** é o sistema de conhecimento do protocolo — explica e ajuda a entender
o BANZA. O BanzAI **não opera pagamentos** e **não certifica operadores sozinho**.
É um sistema adjacente, não faz parte do operador Banzami.

**Frase curta da marca**
> O Banzami é como Angola paga.

**Frase longa da marca**
> O Banzami é a rede de pagamentos wallet-native de Angola — onde cada conta é uma
> carteira em Kwanza, cada pagamento é uma transferência instantânea e o dinheiro
> liquida em segundos, sem dinheiro físico, sem cartões, sem terminais e sem
> comprovativos por WhatsApp. Construído sobre o protocolo aberto BANZA.

**Slogans possíveis**
- "O dinheiro move-se à velocidade da internet."
- "Scan. Confirmar. Pago."
- "BANZA é o protocolo. Banzami é como Angola paga."
- "Pagamentos instantâneos em Kwanza."

**Tom de voz**
Claro, moderno, confiante e honesto. Ambicioso sem ser fantasioso. Técnico quando
necessário, simples por defeito. Nunca exagera o estado do projeto. Nunca promete
o que ainda não existe. Orgulhosamente angolano, sem clichés.

**Regra gramatical (vinculativa):** "Banzami" e "Banza" são **masculinos** em
português. Escreve-se *o* Banzami, *do* Banzami, *o* Banza, *do* Banza —
nunca *a* Banzami nem *da* Banzami.

---

## 2. Definição simples

**O que é**
O Banzami é uma rede de pagamentos digitais para Angola. Cada pessoa e cada
negócio tem uma carteira em Kwanza, identificada por um nome legível — o `@banza`.
Pagar é tão simples como fazer scan de um QR ou enviar dinheiro para um `@banza`.

**O que resolve**
Elimina o dinheiro físico, os comprovativos por screenshot, as confirmações
manuais lentas e a dependência de terminais POS caros. Substitui tudo por um
único gesto: **scan → confirmar → pago**.

**Para quem é**
Para consumidores, pequenos comerciantes, restaurantes, lojas, plataformas
digitais, sites de ecommerce e programadores angolanos.

**Como funciona**
O dinheiro move-se de carteira para carteira dentro da rede, registado num ledger
de dupla entrada. Cada pagamento é uma transferência atómica e idempotente; o
saldo é sempre derivado do ledger, nunca alterado de forma silenciosa.

**Por que é diferente**
Não é um banco, não é um processador de cartões e não é uma simples app de
carteira. É a **infraestrutura de pagamentos** — a rede partilhada onde consumidores,
comerciantes e aplicações se ligam. Construída especificamente para Angola e para
o Kwanza, sobre o protocolo aberto BANZA.

Esta explicação deve ser compreensível por consumidores, comerciantes,
programadores, investidores, parceiros bancários/regulatórios e pela equipa interna.

---

## 3. Posicionamento estratégico

O Banzami é **infraestrutura de pagamento**, não apenas um produto isolado:

- **Não é apenas uma app de carteira** — a carteira é um dos produtos sobre a rede.
- **Não é apenas QR** — o QR é uma das formas de iniciar um pagamento.
- **Não é apenas link de pagamento** — o link é mais uma forma de iniciar a mesma transferência.
- **É uma rede wallet-native** — cada conta é uma carteira, cada pagamento é uma transferência entre carteiras.
- **Pagamentos instantâneos em Kwanza** — o dinheiro liquida em segundos dentro da rede.

O Banzami posiciona-se como alternativa a: dinheiro físico, comprovativos
manuais, TPA/POS físicos e processos de confirmação lentos.

**Comparações de referência (modelo, não claim de equivalência):**

```
Pix      → Brasil
M-Pesa   → Quénia
UPI      → Índia
Banzami  → Angola
```

São referências de **modelo** (redes de pagamento instantâneo, wallet-native ou
de transferência direta). Não devem ser apresentadas como afirmação de que o
Banzami já tem a mesma escala, autorização ou adoção. Evitar qualquer exagero
ilegal ou não comprovado.

---

## 4. Problema que o Banzami resolve

Pagar em Angola hoje é lento, manual e assente na confiança numa fotografia de um
comprovativo. O Banzami ataca diretamente:

- **Pagamentos manuais** — transferências que exigem passos e confirmações repetidas.
- **Dependência de dinheiro físico** — com todo o custo e risco que acarreta.
- **Comprovativos por screenshot** — fotografias de transferências enviadas por WhatsApp como "prova".
- **Confirmações lentas** — espera até o dinheiro "aparecer" do outro lado.
- **Custo dos terminais** — TPA/POS caros e burocráticos para pequenos negócios.
- **Fricção para pequenos comerciantes** — cantinas, táxis e bancas ficam de fora do digital.
- **Falta de APIs simples** — programadores angolanos não tinham uma API de pagamentos nativa.
- **Dificuldade de digitalização do comércio local** — sem rails comuns e simples.

O estado-alvo é uma só sequência:

```
SCAN  →  CONFIRMAR  →  PAGO INSTANTANEAMENTE
```

---

## 5. Solução Banzami

O Banzami reúne, numa única rede, tudo o que é preciso para pagar e receber em
Kwanza:

- **Carteira Kwanza** — cada conta é uma carteira; saldo disponível, reservado e total sempre exatos.
- **`@banza`** — identificador humano e legível que substitui IBANs e números de conta (paga-se a `@maria`, não a um IBAN).
- **QR estático** — um código impresso transforma qualquer balcão num ponto de pagamento.
- **Links de pagamento** — um URL partilhável que substitui o "envia-me o comprovativo".
- **Transferências instantâneas** — dinheiro de carteira para carteira em tempo real.
- **Liquidação em segundos** — o destinatário é creditado no momento em que a transferência é confirmada (dentro da rede).
- **API para programadores** — REST, versionada e idempotente.
- **SDKs oficiais** — clientes tipados para integração rápida.
- **Dashboard para comerciantes** — saldo, transações, análises, reembolsos e levantamentos.
- **Rede comum** — consumidores, comerciantes, plataformas e apps no mesmo sistema.

> **`@banza` é terminologia de produto do Banzami** — é simplesmente a palavra que o
> Banzami usa para "handle"/nome de utilizador. **Não é o protocolo BANZA.**

---

## 6. Produtos principais

> Nota de estado: o núcleo financeiro (ledger, carteiras de consumidor, derivação
> de saldo, transferências P2P, handles `@banza`) está implementado e validado
> contra base de dados real. QR, apps de comerciante, Business Dashboard e o
> conjunto completo de SDKs estão **em progresso**. Funding/levantamento em Kwanza
> real e KYC/KYB **ainda não estão operacionais**. Apresentar cada produto como
> capacidade da rede, sem afirmar que está em produção comercial.

### App Consumidor (Banzami Wallet)
- **Público-alvo:** consumidores angolanos.
- **Promessa:** uma carteira Kwanza simples, com `@banza`, para enviar, receber e pagar.
- **Funcionalidades:** carteira em Kwanza, pagar por QR, enviar para `@banza`, receber dinheiro, histórico, notificações em tempo real.
- **Benefícios:** menos dinheiro físico, sem IBAN, sem cartão, experiência de um toque.
- **Estado:** em desenvolvimento.

### App Comerciante (Banzami Business mobile)
- **Público-alvo:** cantinas, táxis, bancas de mercado, vendedores ambulantes, pequenos serviços.
- **Promessa:** aceitar pagamentos digitais sem terminal físico.
- **Funcionalidades:** notificações de pagamento instantâneas, gerar QR, links de pagamento, saldo e transações em tempo real, iniciar levantamentos.
- **Benefícios:** zero hardware, onboarding em minutos, confirmação criptográfica em vez de screenshot.
- **Estado:** em progresso.

### Business Dashboard (web)
- **Público-alvo:** comerciantes e negócios com gestão pela web.
- **Promessa:** um único painel para gerir os recebimentos.
- **Funcionalidades:** saldo em tempo real, transações, análises, reembolsos, disputas, levantamentos, gestão de chaves API.
- **Benefícios:** visibilidade total, conciliação simples, controlo das integrações.
- **Estado:** em progresso.

### Developer Platform
- **Público-alvo:** programadores, fintechs e plataformas.
- **Promessa:** aceitar Kwanza nativamente dentro de qualquer aplicação.
- **Funcionalidades:** API REST, SDKs oficiais, sandbox, idempotência, webhooks assinados.
- **Benefícios:** integração em horas, segurança por defeito, ambiente de testes isolado.
- **Estado:** API e SDKs em desenvolvimento ativo; SDKs em diferentes graus de maturidade.

### SDKs
- **Público-alvo:** equipas de engenharia.
- **Promessa:** clientes tipados que tornam a integração segura e rápida.
- **Funcionalidades:** APIs tipadas, idempotência automática, retries com backoff, verificação de assinatura de webhooks, isolamento sandbox/live.
- **Estado:** TypeScript, Flutter, Python, PHP e Go em progresso; checkout web para browser.

### Checkout / Pay Links
- **Público-alvo:** ecommerce, criadores, serviços que precisam de cobrar online.
- **Promessa:** cobrar com um link ou uma página de checkout, sem montar infraestrutura.
- **Funcionalidades:** páginas de pagamento, links partilháveis, confirmação instantânea.
- **Estado:** em progresso.

### QR Payments
- **Público-alvo:** comerciantes presenciais e consumidores.
- **Promessa:** transformar um QR impresso num ponto de pagamento.
- **Funcionalidades:** QR estático (consumidor introduz o valor) e dinâmico (valor codificado).
- **Estado:** em progresso.

### Sandbox
- **Público-alvo:** programadores e integradores.
- **Promessa:** testar integrações sem dinheiro real e sem risco.
- **Funcionalidades:** ambiente simulado, isolado da produção, com ferramentas de financiamento e simulação de pagamentos.
- **Estado:** operacional como ambiente de conformidade L0 (dry-run); ver secção 17.

---

## 7. Público-alvo

| Segmento | O que procura no Banzami |
|---|---|
| **Consumidores** | Carteira simples, pagar por QR, enviar/receber por `@banza`, menos dinheiro físico |
| **Pequenos comerciantes** | Aceitar pagamentos sem terminal, confirmação instantânea, onboarding em minutos |
| **Restaurantes / lojas / serviços** | QR no balcão, histórico, conciliação, levantamentos |
| **Plataformas digitais** | Pagamentos e liquidação embebidos no próprio produto |
| **Ecommerce** | Checkout e pay links em Kwanza, sem montar infraestrutura |
| **Programadores** | API simples, SDKs, sandbox, integração em horas |
| **Fintechs / parceiros** | Rails comuns wallet-native sobre um protocolo aberto |
| **Instituições / operadores futuros** | Modelo de operador de referência sobre o protocolo BANZA |

---

## 8. Como o dinheiro se move

- **Wallet-to-wallet** — cada pagamento é uma transferência entre duas carteiras.
- **Ledger interno** — todo o movimento é registado num ledger de dupla entrada.
- **Double-entry** — cada lançamento tem origem e destino que se equilibram.
- **Atomicidade** — a transferência ocorre por inteiro ou não ocorre; tudo numa transação de base de dados.
- **Idempotência** — repetir o mesmo pedido (mesma chave) devolve o resultado original, sem duplicar.
- **Saldos derivados do ledger** — o saldo é calculado a partir dos lançamentos, nunca guardado e alterado à parte.
- **Sem mutações silenciosas** — não há "balance -= valor"; só lançamentos imutáveis e auditáveis.
- **Liquidação imediata dentro da rede** — o destinatário é creditado no momento em que a transferência é confirmada.

```
Carteira do Consumidor  ──transferência no ledger──▶  Carteira do Comerciante
```

> **Importante (vinculativo):** a liquidação instantânea descrita é **dentro da rede
> Banzami** (transferências de carteira para carteira). O **funding em Kwanza real**
> (entrada de dinheiro) e os **levantamentos** (saída) dependem de rails externos
> aprovados (ex.: EMIS ou banco parceiro) que **ainda não estão ativos**. Não
> apresentar produção real de money-in/money-out como já disponível.

---

## 9. Arquitectura técnica

O Banzami é construído com fronteiras de linguagem estritas e correção financeira
no centro.

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| Núcleo financeiro | **Rust** | Ledger, carteiras, transações, transferências, QR, settlement, payouts, risco, compliance |
| Camada de API | **Go** | APIs públicas e admin, gateway, autenticação, entrega de webhooks, orquestração |
| Frontend | **TypeScript + Next.js + React** | Dashboards de comerciante e admin, consola de programador |
| Mobile | **Flutter** | App de carteira e SDK móvel |
| Base de dados | **PostgreSQL** | Fonte única da verdade financeira |
| Cache / coordenação | **Redis** | Cache, rate limiting, idempotência, locks distribuídos |
| Observabilidade | **OpenTelemetry + Prometheus + Grafana** | Traces, métricas, logs estruturados |
| Infraestrutura | **Docker + Hetzner/OVH + Cloudflare** | Modelo de deployment |

**Princípio central:** o núcleo em Rust é o **único escritor** do estado financeiro.
Nenhum serviço acima dele pode violar um invariante financeiro. O Go é dono da
superfície pública e delega cada operação financeira no núcleo. O PostgreSQL é a
fonte única de verdade.

Componentes adicionais relevantes para o site técnico: **sandbox operator** (superfície
de conformidade), **Validation Studio** (sala de controlo de prontidão), pasta de
**evidências** de conformance e **tooling** de verificação. (Para a homepage,
manter alto nível; aprofundar apenas nas páginas técnicas.)

---

## 10. Developer Platform

Página dedicada a programadores. Mensagem central: **uma API e SDKs oficiais para
aceitar Kwanza nativamente em qualquer aplicação.**

Conteúdos:
- **API** — REST, versionada, idempotente, com tratamento de erros estruturado.
- **SDKs** — clientes tipados (ver secção 6); o caminho recomendado de integração é sempre via SDK oficial, não chamadas HTTP artesanais.
- **Sandbox** — ambiente isolado e simulado para desenvolver e testar sem risco.
- **Idempotência** — cada operação mutante aceita uma chave de idempotência; repetir é seguro.
- **Webhooks assinados** — eventos entregues com assinatura verificável (contrato de assinatura definido pelo protocolo BANZA).
- **Integração rápida** — do `install` ao primeiro pagamento em minutos (em sandbox).
- **QR / link / checkout** — helpers para iniciar pagamentos de várias formas.
- **Casos de uso** — apps de táxi, delivery, ecommerce, doações, escolas.

**Limites do estado atual (apresentar com honestidade):** a plataforma está em
desenvolvimento ativo; os SDKs estão em diferentes graus de maturidade; o sandbox
é simulado e está ao nível de conformidade L0; os exemplos no site devem usar o
ambiente sandbox. **Não publicar comandos, chaves, endpoints ou exemplos que não
sejam verdadeiros e corretos no momento da publicação.**

Convenções de nomes (operador, prefixo Banzami):
- TypeScript: `@banzami/sdk` — classe `BanzamiClient`
- Flutter: `banzami_flutter` — classe `BanzamiClient`
- Go: `banzami-go`
- Python: `banzami` (`banzami-python`)
- PHP: `banzami/sdk-php` — namespace `Banzami\`

Contratos de wire preservados ao nível do protocolo (não renomear): header
`banza-signature`, variáveis `BANZA_WEBHOOK_SECRET` e `BANZA_API_KEY`.

---

## 11. Comerciante / Merchant

Página para negócios. Mensagem central: **aceitar pagamentos digitais sem terminal,
com liquidação em segundos.**

Conteúdos:
- **Sem terminal físico** — nada de TPA/POS; basta um smartphone.
- **QR impresso** — cola-se no balcão; o cliente faz scan e paga.
- **Link de pagamento** — partilhável por WhatsApp ou SMS.
- **Dashboard** — saldo, transações e análises em tempo real.
- **Histórico** — cada pagamento com data/hora, valor e `@banza`.
- **Conciliação** — visibilidade clara dos recebimentos.
- **Liquidação** — o comerciante é creditado no momento da confirmação (dentro da rede).
- **Vantagens para pequenos negócios** — onboarding em minutos, sem volume mínimo, sem burocracia de cartão.

Honestidade de estado: os **levantamentos para conta bancária** dependem de rails
de saída aprovados que ainda não estão ativos; apresentar como capacidade da
rede/roadmap, não como serviço comercial já disponível.

---

## 12. Consumidor

Página para pessoas. Mensagem central: **uma carteira Kwanza simples e segura.**

Conteúdos:
- **Carteira simples** — saldo claro: disponível, reservado, total.
- **Pagar com QR** — scan, confirmar, pago.
- **Enviar para `@banza`** — pagar a uma pessoa sem IBAN nem número de conta.
- **Receber dinheiro** — recebe-se de imediato na carteira.
- **Menos dinheiro físico** — o digital passa a ser mais rápido que as notas.
- **Experiência simples e segura** — autenticação por PIN/biometria, notificações em tempo real, recibo criptográfico em vez de screenshot.

---

## 13. Impacto nacional

O Banzami existe para tornar o pagamento digital em Kwanza a norma em Angola.

| Alavanca | Efeito |
|---|---|
| **Digitalização do Kwanza** | Menos notas em circulação, mais pagamentos digitais |
| **Inclusão financeira** | Uma carteira para quem tem um telemóvel — sem balcão, sem cartão |
| **Comércio digital** | Qualquer comerciante aceita pagamento digital sem terminal |
| **Economia QR** | Um QR impresso transforma qualquer balcão num ponto de venda |
| **Programadores angolanos** | Rails partilhados para construir apps de pagamento |
| **Redução de fricção** | Liquidação em segundos no lugar de confirmações manuais |
| **Modernização dos pagamentos** | Pagamentos pensados para a realidade angolana |

Tom: ambicioso mas responsável. Apresentar como **objetivo e direção**, não como
resultado já alcançado em escala nacional.

---

## 14. BANZA, Banzami e BanzAI

```
BANZA    = protocolo aberto (regras, invariantes, contratos, certificação)
Banzami  = operador de referência (produto, UX, carteiras, serviços a comerciantes)
BanzAI   = sistema de conhecimento do protocolo (explica/ajuda a entender)
```

- **BANZA define o protocolo** — é a infraestrutura aberta; define as regras financeiras e o framework de certificação.
- **Banzami opera/implementa** — constrói produto sobre o BANZA, como rede de pagamentos para Angola.
- **BanzAI explica/ajuda a entender/verificar** conhecimento sobre o protocolo.
- **O BanzAI não opera pagamentos.**
- **O BanzAI não certifica operadores sozinho.**

Regras vinculativas:
- Nunca apresentar o BANZA como propriedade do Banzami.
- Nunca apresentar o BanzAI como operador de pagamentos.
- O `@banza` é terminologia de produto do Banzami (a palavra para "handle"), **não** é o protocolo BANZA.

Frases canónicas de posicionamento:
> "O Banzami é construído sobre o protocolo BANZA."
> "BANZA é o protocolo. Banzami é como Angola paga."
> "O Banzami é o operador de referência da rede BANZA."

---

## 15. Estado real do projeto

Estado verdadeiro, a apresentar com transparência:

- O Banzami está em **desenvolvimento ativo**.
- **Não está launch-ready.**
- **Não é um operador certificado.**
- **L0** tem **evidência validada em dry-run** (5/5).
- **L1** tem **gap analysis** e um **adapter de sandbox local**; **L1 não está validado**.
- **L2 / L3 / L4** são **roadmap / futuro**.
- A **produção** depende de **KYC/KYB**, **rails de money-in/money-out** e de dependências **BNA / regulatórias**.
- O **sandbox público permanece L0-only**, salvo decisão futura.

Resumo de estado (verdadeiro):

```
Estado:                               NÃO está launch-ready (NOT YET)
Bloqueadores internos de engenharia:  0
Bloqueadores externos:                10
Evidência BANZA L0 (dry-run):         validada
Certificação BANZA:                   não emitida
Federação de produção:                não está ativa
```

Os 10 bloqueadores externos incluem: fornecedor de **KYC/KYB** (decisão pendente),
**rails de money-in** (financiamento via provedor aprovado), **rails de money-out**
(levantamentos/settlement via provedor aprovado) e dependências **BNA / regulatórias /
de licenciamento**. Enquanto não forem resolvidos, o estado de lançamento mantém-se
**NOT YET**, independentemente do quanto a engenharia interna esteja completa.

---

## 16. Validation Studio

**O que é:** a sala de controlo de prontidão do Banzami. Acompanha cada domínio de
implementação, cada bloqueador de lançamento, cada dependência externa, cada item
de roadmap e cada peça de evidência de validação.

**Por que existe:** para manter "implementado" deliberadamente **separado** de
"launch-ready" e impedir afirmações de prontidão falsas ou subjetivas.

**Como protege contra falsas claims:** cada estado `VALIDATED` carrega evidência,
fingerprint, aprovador e commit, criando um rasto de governança auditável. Separa
conclusão de código de prontidão de negócio.

**Como separa estados:** implementado, validado, bloqueado (interno vs externo) e
futuro/roadmap são categorias distintas, não uma única barra de "progresso".

**Snapshot atual (verdadeiro):**

```
Total acompanhado:        87
Âmbito de lançamento:     76
Launch-ready:             66/76
Code-complete:            68/76
Bloqueadores internos:     0
Bloqueadores externos:    10
Estado de lançamento:     NOT YET
```

O que cada figura significa:
- **Launch-ready** — VALIDATED contra evidência real (provado para o seu âmbito).
- **Code-complete** — VALIDATED ou IMPLEMENTED (engenharia interna concluída).
- **Bloqueadores internos** — por resolver sob controlo de engenharia do próprio Banzami.
- **Bloqueadores externos** — dependentes de terceiros (KYC/KYB, rails money-in/out, BNA/regulatório).
- **Roadmap** — âmbito futuro (ex.: BANZA L1–L4); **não** é bloqueador de lançamento.
- **Baseline** — capacidade já alcançada mostrada como contexto (ex.: baseline L0).

**Importância no projeto:** o Validation Studio pode ser apresentado no site como
**cultura de transparência** — uma prova de que o Banzami separa o que está feito do
que está validado e do que falta. **Não** expor no site detalhes internos sensíveis
(IDs de itens, evidências internas, caminhos de ficheiros, fingerprints).

---

## 17. BANZA conformance

O Banzami corre a **suite oficial de conformance do BANZA** contra o seu sandbox,
como **operador candidato**.

- **L0 dry-run:** evidência validada, **5/5** (Health + Operator manifest).
- Cross-validada em dois canais: **PyPI** `banza-conformance==0.1.0` e **GHCR**
  `ghcr.io/banza-protocol/banza-conformance:v0.1.0`.
- **PASS significa evidência, não certificação.**
- **Certificado de produção ausente** — `/.well-known/banza/certificate.json` está
  intencionalmente ausente (404).
- **`certificate.json` ausente.**
- **O Banzami não é certificado** e não consta de nenhum registo de operadores de produção.

Níveis (definidos pelo BANZA, não pelo Banzami):

| Nível | Significado | Estado Banzami |
|---|---|---|
| **L0** | Conformance de protocolo em sandbox | **VALIDATED baseline** (evidência L0, PyPI + GHCR 5/5) |
| **L1** | Pagamentos core | **PLANNED** — gap analysis feita, adapter sandbox local, **não validado** |
| **L2** | Iniciação de pagamento | **FUTURE** |
| **L3** | Federação | **FUTURE** — dependente de M2–M3 (certificado CA BANZA + confiança de produção) |
| **L4** | Interoperabilidade externa | **FUTURE** |

Regra vinculativa: PASS é **evidência de conformidade**, nunca certificação. A
framework de certificação é propriedade do **BANZA**, não do Banzami.

---

## 18. Segurança, confiança e compliance

Conteúdo de confiança, verdadeiro e sem promessas regulatórias:

- **Ledger de dupla entrada** — toda a movimentação é balanceada e auditável.
- **Idempotência** — operações financeiras são seguras para retry.
- **Auditoria** — lançamentos imutáveis, append-only, com rasto.
- **Traces** — rastreabilidade da origem ao destino (observabilidade).
- **Sandbox** — ambiente simulado e isolado para testes.
- **Separação sandbox / produção** — ambientes completamente isolados; o sandbox nunca acede a credenciais ou dados de produção.
- **Dependências regulatórias** — apresentadas como requisitos a cumprir, não como já obtidas.
- **KYC/KYB** — verificação de identidade de clientes e negócios (dependência externa, ainda não operacional).
- **AML-CFT** — obrigações de prevenção de branqueamento e financiamento ao terrorismo reconhecidas como requisito.

**Não prometer** autorização regulatória, licença bancária ou estatuto de operador
certificado que ainda não existam. A conformance **não substitui** obrigações legais,
regulatórias, KYC/KYB, AML-CFT, bancárias ou de licenciamento.

---

## 19. Cores oficiais e identidade visual

A paleta oficial do Banzami é extraída dos assets existentes (diagramas SVG em
`docs/diagrams/` e `colors.xml` da app móvel). É uma **paleta de vermelhos**
coerente em todo o projeto.

**Cores principais**

| Cor | Hex | Uso recomendado |
|---|---|---|
| Vermelho Banzami | `#B5101F` | Cor primária da marca — logótipo, botões principais, destaques |
| Vermelho vivo | `#D7242E` | Acentos brilhantes, estados ativos, hover |
| Coral / vermelho claro | `#E8434B` | Acento secundário, ícones, ilustrações |
| Vermelho escuro | `#9A1B22` | Profundidade, sombras, contraste em superfícies escuras |
| Rosa pálido | `#FBD2D0` | Fundos suaves, tints, superfícies de apoio |

**Cores derivadas / neutras sugeridas (coerentes, propostas para o site)**

| Cor | Hex sugerido | Uso |
|---|---|---|
| Branco | `#FFFFFF` | Fundos principais, espaço em branco |
| Quase-preto | `#0E0E10` | Tipografia principal, modo escuro |
| Cinza neutro | `#6B6B70` | Texto secundário, legendas |
| Cinza claro | `#F4F4F5` | Fundos de secção, cartões |

**Uso recomendado**
- Vermelho `#B5101F` como cor de identidade dominante, com moderação (CTA, marca, destaques).
- Grandes áreas brancas/neutras para sensação premium e financeira de confiança.
- Gradientes subtis entre `#B5101F → #D7242E → #E8434B` para heros e ilustrações.
- `#FBD2D0` para tints e fundos suaves, nunca como cor de texto.

**Aparência e atmosfera desejada**
Moderno, africano sem clichés, tecnológico, financeiro, confiável, simples,
premium, robusto e revolucionário sem parecer fantasioso. Tipografia limpa e
geométrica; muito espaço em branco; ilustrações vetoriais (SVG) no estilo dos
diagramas existentes; animações subtis e funcionais.

> Nota: todas as ilustrações de arquitetura/diagramas devem ser **SVG**, coerentes
> com os assets em `docs/diagrams/`.

---

## 20. Estrutura recomendada do website

Mapa do site proposto (cada página com objetivo, público, secções, mensagens e CTA):

| Página | Objetivo | Público | CTA principal |
|---|---|---|---|
| **Home** | Apresentar o Banzami e converter interesse | Todos | "Falar connosco" / "Entrar na waitlist" |
| **Produto** | Explicar a rede e os produtos | Consumidores, comerciantes | "Ver como funciona" |
| **Para Comerciantes** | Mostrar valor para negócios | Pequenos comerciantes | "Quero aceitar pagamentos" |
| **Para Programadores** | API, SDKs, sandbox | Programadores | "Ver a documentação / sandbox" |
| **Para Empresas / Plataformas** | Integração wallet-native em produtos | Plataformas, ecommerce | "Falar com a equipa" |
| **Tecnologia** | Arquitetura e correção financeira | Técnicos, parceiros | "Saber mais" |
| **Segurança / Confiança** | Confiança, ledger, compliance | Todos, parceiros | "Como protegemos o dinheiro" |
| **BANZA Conformance** | Transparência sobre conformance e estado | Técnicos, parceiros | "Ver a evidência L0" |
| **Sobre** | Missão, visão, ecossistema | Todos | "Contactar" |
| **Contacto** | Canal oficial | Todos | `contact@banzami.com` |
| **Legal / Termos / Privacidade** | Páginas legais (se aplicável) | Todos | — |

Notas:
- A página **Para Programadores / Sandbox** só deve mostrar comandos e exemplos verdadeiros e atuais.
- A página **BANZA Conformance** deve afirmar claramente "PASS = evidência, não certificação".
- Para cada página, definir: objetivo, público, secções, mensagens principais, CTA e conteúdo recomendado (ver secções 21 e 22).

---

## 21. Homepage recomendada

Blocos sugeridos, cada um com título, subtítulo, texto curto, CTA e ideia visual:

1. **Hero**
   - Título: "O dinheiro move-se à velocidade da internet."
   - Subtítulo: "A rede de pagamentos wallet-native de Angola, em Kwanza."
   - Texto: scan → confirmar → pago, sem dinheiro físico nem comprovativos.
   - CTA: "Falar connosco" / "Entrar na waitlist".
   - Visual: animação subtil do fluxo QR → confirmação → carteira creditada.

2. **Problema**
   - Título: "Pagar em Angola ainda é lento e manual."
   - Texto: dinheiro físico, screenshots de comprovativos, confirmações lentas, TPA caro.
   - Visual: SVG do problema (estilo `banzami-problem-v1.svg`).

3. **Solução**
   - Título: "Uma rede. Uma carteira. Um `@banza`."
   - Texto: carteira Kwanza, QR, links, transferências instantâneas.
   - CTA: "Ver como funciona".

4. **Como funciona**
   - Título: "Scan. Confirmar. Pago."
   - Visual: três passos animados.

5. **Produtos**
   - Título: "Para consumidores, comerciantes e programadores."
   - Cards: App Consumidor, App Comerciante, Business Dashboard, Developer Platform.

6. **Para quem**
   - Título: "Construído para a forma como Angola paga."
   - Cards por segmento (secção 7).

7. **Developer Platform**
   - Título: "Aceita Kwanza dentro da tua app."
   - Texto: uma API, SDKs oficiais, sandbox.
   - CTA: "Para programadores".

8. **Segurança / Ledger**
   - Título: "Confiança é o produto."
   - Texto: ledger de dupla entrada, idempotência, auditoria, sandbox isolado.

9. **BANZA Conformance / Transparência**
   - Título: "Transparentes sobre o que está pronto."
   - Texto: L0 validado em dry-run; PASS = evidência, não certificação; ainda não launch-ready.
   - CTA: "Ver conformance".

10. **Impacto nacional**
    - Título: "Modernizar os pagamentos em Angola."
    - Visual: alavancas de impacto (secção 13).

11. **CTA final**
    - Título: "Constrói connosco."
    - CTA: "Contacto" / "Waitlist" / "Sandbox".

12. **Footer**
    - Links de páginas, `contact@banzami.com`, ecossistema (BANZA/BanzAI), legal.
    - Nota: "Construído sobre o protocolo aberto BANZA."

---

## 22. Conteúdo textual pronto para o site

**Headline hero**
> O dinheiro move-se à velocidade da internet.

**Subheadline hero**
> A rede de pagamentos wallet-native de Angola. Cada conta é uma carteira em Kwanza,
> cada pagamento é uma transferência instantânea — sem dinheiro físico, sem cartões,
> sem comprovativos.

**CTAs**
- "Falar connosco"
- "Entrar na waitlist"
- "Para programadores"
- "Ver como funciona"
- "Quero aceitar pagamentos"

**Secções principais (texto curto)**
- Problema: "Pagar ainda depende de dinheiro físico e de screenshots de comprovativos. O Banzami substitui tudo por um gesto: scan, confirmar, pago."
- Solução: "Uma carteira Kwanza com um `@banza`. Paga por QR, envia para um `@banza`, recebe em segundos."
- Programadores: "Uma API e SDKs oficiais para aceitar Kwanza nativamente — do install ao primeiro pagamento em minutos, em sandbox."
- Comerciantes: "Aceita pagamentos sem terminal. Imprime um QR, partilha um link, recebe em segundos."
- Confiança: "Ledger de dupla entrada, idempotência e auditoria. Confiança é o produto."

**Cards (exemplos)**
- "Carteira Kwanza — saldo sempre exato: disponível, reservado, total."
- "`@banza` — paga a `@maria`, não a um IBAN."
- "QR — um código no balcão chega para receber."
- "Sandbox — testa sem risco, com dinheiro virtual."

**Rodapé**
> O Banzami é construído sobre o protocolo aberto BANZA. BANZA é o protocolo;
> Banzami é como Angola paga. `contact@banzami.com`

**Meta description (SEO)**
> O Banzami é a rede de pagamentos wallet-native de Angola — carteira em Kwanza,
> QR, links de pagamento e transferências instantâneas por `@banza`. Construído
> sobre o protocolo aberto BANZA.

**Titles (SEO)**
- Home: "Banzami — A rede de pagamentos de Angola"
- Programadores: "Banzami para Programadores — API e SDKs de pagamento em Kwanza"
- Comerciantes: "Banzami para Comerciantes — Aceita pagamentos sem terminal"
- Conformance: "Banzami — BANZA Conformance e estado do projeto"

**Textos curtos para botões**
- "Começar", "Saber mais", "Contactar", "Ver docs", "Waitlist".

---

## 23. FAQ

**O que é o Banzami?**
É a rede de pagamentos wallet-native de Angola: cada conta é uma carteira em
Kwanza e cada pagamento é uma transferência instantânea, por QR ou `@banza`.
Construído sobre o protocolo aberto BANZA.

**O Banzami é um banco?**
Não. O Banzami não é um banco nem um processador de cartões. É uma rede de
pagamentos que move Kwanza entre carteiras.

**O Banzami já está disponível?**
Está em desenvolvimento ativo e **ainda não está launch-ready**. O núcleo
financeiro está implementado e validado; funcionalidades como funding e
levantamentos em Kwanza real dependem de rails externos ainda por ativar.

**O que é um `@banza`?**
É o teu nome de utilizador no Banzami — um identificador legível que substitui
IBANs e números de conta. Pagas a `@maria`, não a um IBAN. É terminologia do
Banzami, **não** é o protocolo BANZA.

**O Banzami é o BANZA?**
Não. BANZA é o protocolo aberto; Banzami é o operador/produto construído sobre
ele. O protocolo existe independentemente do Banzami.

**O Banzami é certificado?**
Não. O Banzami **não é um operador certificado**. Tem evidência de conformance L0
em dry-run, mas PASS significa evidência, não certificação.

**O que significa "L0 validado"?**
Significa que o Banzami passou a suite de conformance de nível 0 (sandbox) em
modo dry-run, com evidência arquivada. Não é uma certificação de produção.

**O que falta para o lançamento?**
Dependências externas: fornecedor de KYC/KYB, rails de entrada e saída de dinheiro
(money-in/money-out) e requisitos BNA/regulatórios. Não há bloqueadores internos
de engenharia no âmbito de lançamento, mas estes externos mantêm o estado em NOT YET.

**Como podem os comerciantes usar?**
Registando um negócio, recebendo uma carteira e um `@banza`, e aceitando
pagamentos por QR ou link — sem terminal físico. (Em desenvolvimento.)

**Como podem os programadores integrar?**
Através da API e dos SDKs oficiais, com um ambiente sandbox para testes. O caminho
recomendado é sempre via SDK oficial.

**Como contactar?**
Por `contact@banzami.com`.

---

## 24. Claims permitidas

Frases verdadeiras que **podem** ser usadas no site:

- "O Banzami é uma rede de pagamentos wallet-native para Angola."
- "O Banzami está alinhado com o protocolo BANZA."
- "O Banzami está construído sobre o protocolo aberto BANZA."
- "O Banzami possui evidência L0 validada em dry-run."
- "O Banzami está em desenvolvimento ativo."
- "O Banzami ainda não está launch-ready."
- "PASS significa evidência, não certificação."
- "O Banzami é o operador de referência da rede BANZA."
- "Cada conta é uma carteira em Kwanza."
- "Pagamentos instantâneos dentro da rede, de carteira para carteira."
- "Sem dinheiro físico, sem cartões, sem terminais, sem comprovativos por WhatsApp."

---

## 25. Claims proibidas

Frases que **nunca** podem aparecer no site (falsas ou enganosas):

- "O Banzami é certificado."
- "O Banzami é operador certificado BANZA."
- "O Banzami está launch-ready."
- "O Banzami está production-ready."
- "L1 validado." / "L2 validado." / "L3 validado." / "L4 validado."
- "L3 federation ready."
- "M2/M3 completo."
- "Certificado de produção emitido."
- "BANZA certificou o Banzami."
- "PASS = certificação."
- "O Banzami é um banco."
- "O Banzami é o protocolo BANZA."
- "A produção já está ativa."
- "Já temos autorização/licença regulatória." (a menos que e até que seja verdade)

---

## 26. Informação sensível a evitar no site

Não publicar:

- Detalhes internos demasiado técnicos (IDs de itens da matriz, fingerprints, evidências internas).
- Endpoints internos não públicos (ex.: rotas `/internal/v1/...`).
- Caminhos de ficheiros internos do repositório quando não adequados ao público.
- Claims regulatórias não confirmadas (licenças, autorizações, estatuto BNA).
- Nomes de parceiros bancários, EMIS ou fornecedores **não confirmados publicamente**.
- Promessas de licença ou de datas de lançamento não comprometidas.
- Afirmações de produção real antes de existir (money-in/money-out, federação).
- Dados de segurança sensíveis (segredos, chaves, configurações, headers internos).
- Snapshots de validação com nível de detalhe interno (apresentar só o resumo público).

---

## Brief para Claude Design

**Objetivo visual**
Construir o website oficial do Banzami: moderno, simples, robusto, altamente
polido e dinâmico. Deve transmitir uma startup de pagamentos de referência para
Angola e para a África lusófona — confiável, financeira, tecnológica e ambiciosa
sem parecer fantasiosa.

**Identidade**
- Marca: Banzami (masculino: *o* Banzami).
- Paleta de vermelhos: `#B5101F` (primária), `#D7242E`, `#E8434B`, `#9A1B22`, `#FBD2D0`, com neutros brancos/cinza.
- Tipografia limpa e geométrica; muito espaço em branco; sensação premium.
- Ilustrações **SVG** coerentes com `docs/diagrams/`.

**Páginas** (ver secção 20): Home, Produto, Para Comerciantes, Para Programadores,
Para Empresas/Plataformas, Tecnologia, Segurança/Confiança, BANZA Conformance,
Sobre, Contacto, Legal.

**Conteúdo**
Usar os textos prontos da secção 22 e a homepage da secção 21. Toda a cópia em
**português**. Respeitar a regra gramatical masculina.

**Tom**
Claro, confiante, honesto, ambicioso e responsável. Nunca exagerar o estado real.

**Animações / componentes**
Animações subtis e funcionais (fluxo scan→confirmar→pago, transferência entre
carteiras), cards de produto, secções com SVG, microinterações em CTAs. Nada de
efeitos gratuitos que prejudiquem a clareza.

**Restrições (vinculativas)**
- Respeitar as **claims permitidas** (secção 24) e **proibidas** (secção 25).
- Não publicar **informação sensível** (secção 26).
- Não apresentar o BANZA como propriedade do Banzami.
- Não apresentar o BanzAI como operador de pagamentos.
- Não dizer que o Banzami é certificado, launch-ready, production-ready ou banco.
- Não dizer que L1/L2/L3/L4 estão validados nem que M2/M3 estão completos.
- "PASS = evidência, não certificação" sempre que se mencionar conformance.

**Processo (vinculativo)**
- Construir e testar **primeiro localmente**.
- **Não fazer deploy.**
- **Não apontar para produção** sem aprovação explícita.
- Criar um site **dinâmico, moderno, simples, robusto e altamente polido**.

---

### Guardrails gerais (resumo vinculativo)

- Português apenas.
- Sem marketing enganoso.
- O Banzami **não** é certificado.
- O Banzami **não** está launch-ready nem production-ready.
- O Banzami **não** é um banco.
- A produção **não** está ativa.
- L1/L2/L3/L4 **não** estão validados.
- M2/M3 **não** estão completos.
- BANZA **não** é propriedade do Banzami.
- BanzAI **não** opera pagamentos.

---

*O Banzami é construído sobre o protocolo aberto BANZA.*
*BANZA é o protocolo. Banzami é como Angola paga.*
*O Banzami é o operador de referência da rede BANZA.*
</content>
</invoke>
