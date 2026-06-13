# 01 — Inventário Técnico do Projecto Banzami

**Versão:** 1.0
**Data:** 2026-06-13
**Tipo:** Auditoria estratégica — Fase 1 (Inventário)
**Método:** Inspecção directa do código-fonte em `~/banzami`, `~/banza`, `~/banzai`

> Este inventário descreve **o que existe de facto no código**, não o que a documentação afirma existir. Onde há divergência, ela é assinalada.

---

## 1. Visão geral quantitativa

| Métrica | Valor | Fonte |
|---|---|---|
| Crates Rust (core financeiro) | 19 domínios | `core/*` |
| Ficheiros Rust | 120 | `find core services -name "*.rs"` |
| Serviços Go | 3 (api-gateway, public-api, admin-api) | `services/*` |
| Ficheiros Go | 104 | `find services -name "*.go"` |
| Rotas HTTP expostas (únicas) | ~101 | grep de `r.Get/Post/...` |
| Apps frontend (Next.js) | 6 (dashboard, admin, pay, checkout, docs, validation-studio) | `apps/*` |
| App mobile (Flutter) | 1 binário, 2 personas (consumidor + comerciante) | `apps/mobile/lib/` |
| Ficheiros Dart | 63 | `find apps -name "*.dart"` |
| SDKs | 6 (TypeScript, Flutter, Go, PHP, Python, checkout-web) | `sdk/*` |
| Plugins | 5 (generic-node, generic-php, generic-laravel, shopify, woocommerce) | `plugins/*` |
| Migrações de base de dados | 40 (`0001`–`0040`) | `db/migrations/` |
| Ficheiros de teste Rust (core) | 21 | grep `#[test]`/`#[tokio::test]` |
| Ficheiros de teste Go (serviços) | 6 | `find services -name "*_test.go"` |

---

## 2. Núcleo financeiro (Rust) — `core/`

19 crates de domínio, escritor único das tabelas financeiras:

| Crate | Estado observado | Notas |
|---|---|---|
| `ledger` | **Sólido** | Double-entry, invariante `assert_balanced()` imposta no build, idempotência, append-only. Testes de invariante presentes. |
| `transfers` | **Sólido** | Transferência P2P atómica numa transacção PostgreSQL, `SELECT FOR UPDATE` no remetente, saldo derivado do ledger, idempotência. |
| `wallets` / `consumer-wallets` | Implementado | Conta `available`, reservas, funding. |
| `transactions` | Implementado | Ciclo auth/capture/void. |
| `qr` | Implementado | QR estático + dinâmico, expiração via worker. |
| `payment-links` | Implementado | Slugs, expiração. |
| `merchants` / `identity` | Implementado | Perfis, @handles. |
| `payouts` | Implementado (lógica) | Sem rail de saída real ligado. |
| `settlement` | Implementado (lógica) | Sem rail real ligado. |
| `reconciliation` | Implementado | Jobs de reconciliação. |
| `acquiring` | **Parcial / crítico** | Provider `Simulated` funcional; provider `EMIS` é **stub** (ver §6). |
| `risk` / `compliance` | Esqueleto | Estruturas presentes, regras mínimas. |
| `routing` | Implementado | Selecção de regras por prioridade. |
| `reconciliation`, `jobs`, `api`, `types` | Suporte | `api` = Axum router (core-api :8081); `types` = unidades monetárias inteiras. |

---

## 3. Camada de API (Go) — `services/`

| Serviço | Porta | Audiência | Auth |
|---|---|---|---|
| `api-gateway` | 8080 | Comerciantes + páginas públicas | JWT (API key → token), scopes, rate-limit Redis, idempotência |
| `public-api` | 8083 | Consumidores | JWT (handle+PIN), rate-limit **só em transferências** |
| `admin-api` | 8082 | Operadores (rede interna) | JWT admin |

Núcleo Rust `core-api` (:8081) acessível apenas por loopback, **sem token de autenticação** entre Go→Rust (confia na fronteira de rede).

---

## 4. Frontends

| App | Stack | Função | Estado |
|---|---|---|---|
| `dashboard` | Next.js 14 | Painel do comerciante (transacções, payment-links, payouts, refunds, disputes, webhooks, wallets) | Páginas existem |
| `admin` | Next.js | Backoffice do operador | Existe |
| `pay` | Next.js | Página de pagamento pública (`/[slug]`, `/r/[code]`, `/u/[handle]`) | Existe |
| `checkout` | Next.js | Checkout hosted | Existe |
| `docs` | Next.js | Site público banzami.com — **em reconstrução protocol-first** (componentes `protocol/*` já presentes) | Em transição |
| `validation-studio` | Next.js | Ferramenta interna de validação | Existe |

**Mobile (Flutter):** um único binário com duas personas — consumidor (onboarding, PIN, enviar, receber, QR, histórico, perfil, segurança, notificações) e comerciante (dashboard, charge, QR, payout, histórico).

---

## 5. SDKs e plugins

- **SDKs:** TypeScript (`@banza/sdk`), Flutter (`banza_flutter`), Go (`banzami/...`), PHP, Python, checkout-web. TypeScript e Flutter listados como "Disponível"; PHP "em desenvolvimento"; Go/Python "planeado" na documentação, mas há código presente para Go.
- **Plugins:** generic-node, generic-php, generic-laravel, shopify, woocommerce. (Nota: a estratégia de produto desaconselha Shopify/plataformas ocidentais — ver `02_product.md`.)
- **Webhooks:** assinatura HMAC-SHA256 com timestamp e comparação em tempo constante (`sdk/go`, `api-gateway/internal/webhook/signer.go`). Robusto.

---

## 6. Integrações e rails — o ponto crítico

| Integração | Estado real no código | Evidência |
|---|---|---|
| **EMIS / Multicaixa (entrada de dinheiro)** | **STUB** — `initiate_payment` devolve erro `"EMIS provider not yet configured"` | `core/acquiring/src/providers/emis.rs:67-87` |
| Provider por omissão em produção | `SimulatedProvider` (dinheiro virtual) | `core/api/src/state.rs:255-259` (`_ => AcquirerKind::Simulated`) |
| Validação de callback EMIS | HMAC implementado, mas mapeamento de campos é TODO | `emis.rs:104` |
| Saída de dinheiro (payouts/settlement) | Lógica de ledger existe; **sem rail bancário real ligado** | `core/payouts`, `core/settlement` |
| OTP de onboarding (SMS) | Rate-limit por IP referido; provider SMS não confirmado | `public-api/.../onboarding.go` |

**Conclusão do inventário:** o sistema é, hoje, um **circuito fechado**. Carteiras são financiadas por crédito sandbox; não existe caminho confirmado para Kwanza real entrar ou sair da rede.

---

## 7. Documentação

- Conjunto extenso de documentos canónicos: `BANZAMI_REFERENCE.md`, `_ARCHITECTURE`, `_PRODUCTS`, `_SECURITY`, `_GOVERNANCE`, `_OPERATIONS`, `_DEPLOYMENT`, `_ROADMAP`.
- `README.md` = **1973 linhas / ~101 KB** (excessivo; ver `05_architecture.md`).
- `docs/audit/` já contém 13 relatórios de auditorias anteriores (foco em documentação/ecossistema).
- Três repositórios paralelos com documentação espelhada: `~/banza` (protocolo), `~/banzai` (Protocol OS), `~/banzami` (operador).

---

## 8. O que NÃO existe (apesar de mencionado)

- Caminho de dinheiro real (EMIS por ligar).
- Rate-limiting na autenticação de consumidor (`/v1/auth/token`).
- Cobertura de testes significativa na camada Go (6 ficheiros de teste para 104 ficheiros).
- Snapshot/materialização de saldo (saldo é recalculado por `SUM` sobre `ledger_entries` a cada transferência).
- Utilizadores, comerciantes ou volume reais.

---

*Próximo: `02_product.md` — Auditoria de Produto.*
