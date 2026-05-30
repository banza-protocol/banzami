# ADR-016 — Arquitectura de Marca Banzami/Banza

**Status:** Accepted  
**Date:** 2026-05-19  
**Author:** Organização Banzami  
**Deciders:** Fidel Monteiro (Founder)

---

## Contexto

O ecossistema Banzami cresceu do conceito inicial — uma única plataforma referida como "Banzami" — para uma arquitectura de dois níveis com responsabilidades distintas: a organização que constrói a infraestrutura, e o produto que os utilizadores e comerciantes utilizam diariamente.

À medida que o produto madura, a ambiguidade entre o nome organizacional e o nome do produto cria problemas:

- Documentação inconsistente: "rede Banzami", "carteira Banzami", "SDK Banzami", "Banzami Business" mistura o nome da organização com funcionalidades do produto.
- Posicionamento confuso: quando um consumidor diz "Pago com Banzami", está a referir-se à organização ou ao produto?
- Escalabilidade da marca: à medida que o Banzami lança futuros produtos e serviços de infraestrutura, um nome de produto igual ao da organização torna impossível distingui-los.

---

## Decisão

O Banzami adopta uma arquitectura de marca de dois níveis com papéis semanticamente distintos:

### Banzami — Organização / Ecossistema / Infraestrutura

**Banzami** é o nome da organização. Refere-se a:

- A empresa e equipa que constrói o ecossistema
- A infraestrutura técnica e plataforma
- A missão institucional e visão de longo prazo
- O ecossistema de parceiros, bancos e relações regulatórias
- A entidade que publica SDKs, mantém APIs e opera a infraestrutura
- A fonte de verdade de toda a documentação técnica e pública
- Todos os produtos futuros da organização (além do Banza)

### Banza — Produto Principal de Pagamento

**Banza** é o produto principal de pagamento construído pelo Banzami. Refere-se a:

- A rede de pagamentos instantâneos QR-native em Kwanza
- A experiência de pagamento que consumidores e comerciantes usam diariamente
- O produto wallet-native (@banza, carteiras, QR, transferências)
- Todos os sub-produtos do produto de pagamento principal:
  - Banza Wallet
  - Banza Business
  - Banza QR
  - Banza Checkout
  - Banza Pay Links
  - Banza Payment Requests
  - Banza API
  - Banza SDK
  - @banza (identidade de pagamento)

### A Relação

```
Banzami (organização / ecossistema)
└── Banza (produto principal de pagamento)
    ├── Banza Wallet
    ├── Banza Business
    │   ├── Interface móvel (operação diária)
    │   └── Interface web (administração avançada)
    ├── Banza QR
    ├── Banza Checkout
    ├── Banza Pay Links
    ├── Banza Payment Requests
    ├── Banza API
    ├── Banza SDK
    └── @banza (identidade de pagamento)
```

### Frase de posicionamento canónica

> *"Banzami constrói a infraestrutura que permitirá Angola pagar digitalmente."*  
> *"Banzami constrói a infraestrutura. Banza move o dinheiro."*  
> *"Banzami constrói a infraestrutura que permitirá Angola pagar digitalmente. Banza é como Angola paga."*

---

## Regras de Nomenclatura

### Usar "Banza" quando o contexto é:

- Experiência de pagamento do utilizador ("Paga com Banza.")
- Carteiras e saldos ("a tua Banza Wallet")
- Identidades de pagamento ("o teu @banza")
- Pagamentos QR ("Scan do QR Banza")
- Produto do comerciante ("Banza Business")
- SDKs e APIs de pagamento ("Banza SDK", "Banza API")
- Links de pagamento ("Banza Pay Links")
- Checkout ("Banza Checkout")
- A rede de pagamento em si ("rede Banza")
- Adopção pelo consumidor ("adoptar o Banza")
- Integração em apps ("integra o Banza no teu app")

**Exemplos correctos:**
- "Paga com Banza."
- "Envia para o @banza da Ana."
- "Aceitamos Banza."
- "Integra Banza no teu ecommerce."
- "O Banza Business permite aos comerciantes receber pagamentos instantâneos."
- "O Banza SDK TypeScript suporta idempotência automática."

### Usar "Banzami" quando o contexto é:

- A organização como entidade ("o Banzami constrói...", "parceiros do Banzami")
- A missão institucional ("a visão do Banzami")
- Infraestrutura técnica a nível de plataforma ("infraestrutura do Banzami")
- Documentação fonte-de-verdade ("BANZA_REFERENCE.md")
- Relações com bancos e reguladores ("o Banzami ganha acesso a...")
- O ecossistema no seu conjunto ("ecossistema Banzami", "o Ecossistema Banzami")
- Futuros produtos não-Banza da organização
- Nomes de domínio de infraestrutura (pay.banzami.com, api.banzami.com)

**Exemplos correctos:**
- "Banzami é a organização que constrói..."
- "A visão do Banzami é completar a camada de pagamentos de Angola."
- "Banzami ganha acesso à infraestrutura regulada."
- "A arquitectura técnica do Banzami é um monólito modular."

### Usar "@banza" para a identidade de pagamento

`@banza` é a identidade de pagamento humana na rede Banza. Cada pessoa e comerciante tem um @banza.

**Exemplos:**
- `@joao`, `@ana`, `@cantina.luanda`, `@escola.benguela`

---

## Regras Proibidas

- **PROIBIDO:** "Pagar com Banzami" → usar "Pagar com Banza"
- **PROIBIDO:** "carteira Banzami" → usar "Banza Wallet" ou "carteira Banza"
- **PROIBIDO:** "SDK Banzami" → usar "Banza SDK"
- **PROIBIDO:** "Banzami Business" → usar "Banza Business"
- **PROIBIDO:** "QR Banzami" → usar "Banza QR" ou "QR Banza"
- **PROIBIDO:** "API Banzami" → usar "Banza API"
- **PROIBIDO:** substituição cega de todo o "Banzami" por "Banza" sem verificar o contexto

---

## Nomes de Pacotes SDK

Os SDKs do produto Banza adoptam o prefixo `banza`:

| Linguagem | Package Name | Classe principal |
|-----------|-------------|-----------------|
| TypeScript / Node.js | `@banza/sdk` | `BanzaClient` |
| PHP | `banza/sdk-php` | `BanzaClient` |
| Go | `banza-go` | `BanzaClient` |
| Python | `banza-python` | `BanzaClient` |
| Flutter / Dart | `banza_flutter` | `BanzaPay` |

Cabeçalhos HTTP de webhook: `banza-signature`  
Variáveis de ambiente: `BANZA_WEBHOOK_SECRET`, `BANZA_API_KEY`  
Prefixo de chaves API: `bz_live_...`, `bz_sandbox_...` (prefixo `bz` mantém-se)

---

## Domínios de Infraestrutura

Os domínios de infraestrutura mantêm o nome `banzami` por serem activos da organização, não do produto:

- `pay.banzami.com` — página de pagamento e lojas de comerciantes
- `api.banzami.com` — endpoint da API REST
- `banzami.com` — website público da organização

Os protocolos QR usam o prefixo `banza` por serem activos do produto:

- `banza://pay/@cantina.luanda` — protocolo QR nativo do produto

---

## Alternativas Consideradas

### Alternativa 1: Manter "Banzami" para tudo

Rejeitado porque cria ambiguidade crescente à medida que a organização lança produtos adicionais e porque "Paga com Banzami" soa mais pesado do que "Paga com Banza" para uso quotidiano.

### Alternativa 2: Renomear a organização para outro nome

Rejeitado porque "Banzami" já tem valor de marca institucional e é o nome registado da organização.

### Alternativa 3: Usar "Banza" para tudo (incluindo org)

Rejeitado porque a organização precisa de um nome distinto para contextos institucionais: relações bancárias, regulatórias, documentação técnica, e futuros produtos não-Banza.

---

## Consequências

### Positivas

- Clareza de posicionamento: consumidores falam de "Banza", investidores e parceiros falam de "Banzami".
- Copy de marketing mais fluido: "Paga com Banza" é mais simples e natural.
- Escalabilidade: o Banzami pode lançar futuros produtos sem confusão de nomes.
- Consistência com modelos de referência: Visa (org) / Visa Checkout (produto), EMIS (org) / Multicaixa Express (produto).

### Negativas / Riscos

- Migração de copy existente: documentação, website, SDK names requerem actualização sistemática.
- Risco de inconsistência durante a transição: diferentes partes do ecossistema podem usar nomenclatura mista.

### Mitigação

- `docs/BANZA_REFERENCE.md` é actualizado primeiro — todas as outras superfícies derivam dele.
- CLAUDE.md inclui regras vinculativas de nomenclatura para todos os engenheiros.
- Qualquer novo conteúdo deve ser verificado contra as regras deste ADR antes de publicação.

---

## Fluxo de Actualização de Conteúdo

```
BANZA_REFERENCE.md  (fonte de verdade)
          ↓
    website rendering
          ↓
      UI labels
          ↓
       metadata
          ↓
   developer docs
          ↓
  future code/package naming
```

---

## Referências

- [ADR-013](ADR-013-wallet-native-identity.md) — Identidade Wallet-Native
- [ADR-014](ADR-014-angola-national-mission.md) — Missão Nacional Angola-First
- [ADR-015](ADR-015-markdown-first-content-architecture.md) — Arquitectura de Conteúdo Markdown-First
- [CLAUDE.md](../../CLAUDE.md) — Constituição de Engenharia Banzami
- [docs/BANZA_REFERENCE.md](../BANZA_REFERENCE.md) — Fonte de Verdade Oficial
