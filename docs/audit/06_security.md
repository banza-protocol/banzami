# 06 — Auditoria de Segurança

**Versão:** 1.0
**Data:** 2026-06-13
**Tipo:** Auditoria estratégica — Fase 6 (Segurança)
**Postura:** Auditor de segurança. Classificação: Critical / High / Medium / Low.
**Âmbito:** Revisão de código (auth, pagamentos, QR, links, webhooks, rate-limit). Não foi feito teste de penetração dinâmico — achados são estáticos e devem ser confirmados/explorados num pentest formal antes de LIVE.

---

## Sumário executivo

O **núcleo financeiro é seguro por construção** (ledger imutável, double-entry, idempotência, transacções atómicas, comparações em tempo constante nos webhooks). O **perímetro de autenticação do consumidor é o ponto fraco** e contém pelo menos um achado de severidade alta que, combinado com a enumeração pública de handles, aproxima-se de takeover de conta. Nada deve ir para LIVE com dinheiro real antes de fechar os achados Critical/High.

---

## Achados

### 🔴 HIGH-1 — Login de consumidor sem limitação de tentativas + handles enumeráveis → brute-force de PIN

**Evidência:**
- `services/public-api/internal/server/server.go:66-67` — `/v1/auth/register` e `/v1/auth/token` registados **fora** de qualquer middleware de rate-limit. O único limitador (`transferLimiter`) aplica-se apenas a `/v1/transfers`.
- PIN = 4 a 8 dígitos (`auth.go:50`). Um PIN de 4 dígitos = 10 000 combinações.
- Handles são **publicamente pesquisáveis e enumeráveis**: `/v1/consumers/search` e `/v1/consumers/{handle}` (sem auth, `server.go:76-77`).

**Impacto:** um atacante obtém handles válidos via `/search` e faz brute-force do PIN via `/v1/auth/token` sem bloqueio. O bcrypt (`DefaultCost`, ~100 ms) abranda mas não impede ataque paralelizado; 10 000 tentativas são triviais com concorrência. Resultado: **acesso à carteira e drenagem de fundos**.

**Atenuante a confirmar:** poderá existir `limit_req` ao nível do nginx no servidor (não presente em `infra/` nem `deploy.sh`). **Não confirmado em código.** Não deve ser assumido como mitigação.

**Correcção:** rate-limit + lockout progressivo por handle **e** por IP no endpoint de login (Redis, já disponível); CAPTCHA após N falhas; PIN mínimo de 6 dígitos; bloqueio temporário de conta; alertas. Idealmente, segundo factor (OTP) em logins de novo dispositivo.

---

### 🔴 HIGH-2 — Modelo de autenticação fraco para um produto financeiro

**Evidência:** consumidor autentica-se só com handle + PIN; sem 2FA, sem vínculo a dispositivo, JWT 24h sem revogação.

**Impacto:** roubo de telemóvel, SIM swap (comum em Angola) ou phishing de PIN = acesso pleno por 24h sem forma de revogar. Para uma carteira de dinheiro real, abaixo do padrão esperado.

**Correcção:** binding de dispositivo, OTP em novo dispositivo, revogação de sessão, e reavaliação do TTL.

---

### 🟠 MEDIUM-1 — Sem auth entre Go e Rust core-api

**Evidência:** `BANZAMI_ARCHITECTURE.md` §Fronteiras + `core-api` em loopback "sem token de auth". Confia inteiramente na fronteira de rede.

**Impacto:** qualquer SSRF, má configuração de firewall ou contentor comprometido na mesma rede fala diretamente com o core financeiro sem credencial.

**Correcção:** token de serviço interno ou mTLS (defesa em profundidade), mesmo em loopback.

---

### 🟠 MEDIUM-2 — Segredo de webhook com default inseguro

**Evidência:** `core/api/src/state.rs:252` — `ACQUIRING_WEBHOOK_SECRET` cai para `"change-in-production"` se não definido.

**Impacto:** se esquecido em produção, assinaturas de callback de acquiring tornam-se forjáveis.

**Correcção:** falhar fechado (recusar arrancar em LIVE sem segredo definido).

---

### 🟠 MEDIUM-3 — JWT HS256 com segredo único partilhado, sem rotação

**Evidência:** `middleware/auth.go` em ambos os serviços assina/verifica com `cfg.JWTSecret` simétrico único.

**Impacto:** comprometer um serviço expõe a chave de assinatura de todos os tokens; sem rotação nem revogação, mitigação difícil.

**Correcção:** RS256/EdDSA, rotação de chaves, `kid` no header, lista de revogação.

---

### 🟡 LOW-1 — Enumeração de handles por design

Já coberto em HIGH-1 como amplificador. Isolado, é Low (handles são públicos por natureza num sistema de pagamentos por @handle). O risco vem da **combinação** com a falta de rate-limit no login.

### 🟡 LOW-2 — Mensagens de erro de autenticação
`/v1/auth/token` devolve "invalid handle or PIN" (genérico — bom). Manter assim; não revelar qual dos dois falhou.

---

## O que está BEM feito (segurança)

| Controlo | Avaliação |
|---|---|
| Ledger imutável + double-entry + idempotência | Excelente — elimina classes inteiras de fraude interna |
| Transacções atómicas + `SELECT FOR UPDATE` | Excelente — sem race de double-spend |
| Assinatura de webhooks HMAC-SHA256 + timestamp + `hmac.Equal` (tempo constante) + janela anti-replay | Excelente |
| Verificação explícita do algoritmo JWT (anti `alg=none`) | Correto |
| PIN com bcrypt (`DefaultCost`), nunca devolvido | Correto (a fraqueza é a falta de rate-limit, não o armazenamento) |
| Isolamento de ambiente LIVE/SANDBOX via claim no token | Bom |
| `.env` não versionado (git) | Confirmado — sem segredos no repo |
| Idempotência via middleware + Redis | Bom |

---

## Veredicto de segurança

**Núcleo: forte. Perímetro de consumidor: precisa de trabalho antes de tocar em dinheiro real.** Nenhum achado é irreparável; HIGH-1 é o que verdadeiramente importa e é fechável numa sprint. **Recomendação inegociável:** rate-limit/lockout no login + 2FA mínimo antes de qualquer piloto LIVE, e um pentest externo formal antes de processar Kwanza real.

---

*Próximo: `07_banza_compliance.md`.*
