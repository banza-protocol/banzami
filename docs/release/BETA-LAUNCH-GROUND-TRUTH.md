# BETA LAUNCH — GROUND TRUTH

> Reconstructed from live authority (running services, source at HEAD, deploy
> config) — not from historical docs. Live authority > comments > docs.
> Captured 2026-09-24.

## Revisions & schema

| Item | Value |
|------|-------|
| SOURCE_HEAD | `7fc4d9a5` (worktree clean at capture) |
| SCHEMA_HEAD | `db/migrations/0167_environment_columns_never_default_to_live.sql` |
| Website app | `apps/website` (Next.js App Router) |

## Platform mode / Financial Live (live probe)

| Endpoint | Result | Meaning |
|----------|--------|---------|
| `GET https://api.banzami.com/v1/platform-mode` (LIVE stack) | **503** fail-closed HTML | Financial LIVE rail is **unavailable** — desired state |
| `GET https://sandbox-api.banzami.com/v1/platform-mode` | `{"mode":"SANDBOX","public_banner":true}` | Public Sandbox is the only live plane |
| `getPlatformMode()` fallback | SANDBOX | Fails closed to SANDBOX |

**FINANCIAL_LIVE = UNAVAILABLE (PASS).** No Beta flow can reach LIVE: the LIVE
stack answers 503, and approvals are env-gated (`ENVIRONMENT_MISMATCH`, ADR-025).

## Public surfaces

| Surface | Host | Notes |
|---------|------|-------|
| Marketing website | banzami.com | Rebuilt from dossier; design frozen |
| App (Beta Web) | app.banzami.com | Shared Flutter app on a Node BFF |
| Hosted payer | pay.banzami.com | ADR-052 |
| Developers Console | developers.banzami.com | Authenticated |
| Developer API | developer-api.banzami.com | Sandbox keys |
| Sandbox payments API | sandbox-api.banzami.com | Public Sandbox rail |
| Operator console | admin.banzami.com | Internal |

## Public flows — wired vs stub (as found)

| Flow | Real backend | NEW routed form | Verdict |
|------|-------------|-----------------|---------|
| Merchant application (candidatura) | `POST /v1/merchant/applications` | `components/marketing/pages/Candidatura.tsx` | **STUB** — fabricates `BZB-` code client-side, never POSTs |
| Application status (estado) | `GET /v1/merchant/applications/{id}` | `CandidaturaEstado.tsx` | **STUB** — hardcoded "Em análise" timeline, no GET |
| Activation (ativação) | `POST /v1/merchant/activation/validate` + `/complete` (PIN) | `ComerciantesActivar.tsx` | **STUB** — fake success, no PIN |
| Beta testers | `POST /v1/beta/testers` | `HeroPlatforms.tsx` | **REAL + WIRED** |
| Contact | `POST /v1/contact` | `ContactCTA.tsx` | **REAL + WIRED** (gated on gateway mailer) |

The old, fully-wired forms (`app/comerciantes/candidatura/CandidaturaForm.tsx`,
`estado/ApplicationStatusView.tsx`, `activar/ActivarFlow.tsx`) are **orphaned**
(no live route imports them).

## Backend onboarding policy (authority: `services/api-gateway/internal/service/business_requirements.go`)

- **One policy, not environment-aware**: `BusinessApplicationPolicy`
  (`RequirementPolicyVersion = "ao-business-2026-09"`), capability
  `receive_payments`. Requires **12 fields** at submit (business_name,
  desired_handle, category, email, phone, nif, province, municipality, address,
  legal_representative, representative_role, business_activity) + terms, and
  **2 KYB documents** (BUSINESS_REGISTRATION, REPRESENTATIVE_ID) at **approval**.
- Environment is stamped from the gateway stack, never the request body (ADR-025).
- **No `public_reference` / short code exists server-side** — the only reference
  is the UUID `application_id`. `BZB-…` exists nowhere in the backend.

### Security notes (as found)

- **`GET /v1/merchant/applications/{id}` (PublicStatus) returns the FULL
  application** (incl. NIF, legal representative, address, email, phone) to
  anyone who holds the UUID — no auth, no ownership check. The UUID is 122-bit
  unguessable, but a leaked URL exposes full PII. **IDOR/PII item (§18).**
- Activation is real: `validate` + `complete` with a PIN and an unguessable
  capability token (same model as documents).

### Rate limits (authority: `services/api-gateway/internal/server/server.go`) — all fail-closed

| Route | Limit |
|-------|-------|
| onboarding group | 30 / min / IP |
| `POST /v1/merchant/applications` | 30 / 24h / IP |
| `POST /v1/beta/testers` | 20 / 24h / IP |
| `POST /v1/contact` | 10 / 24h / IP |
| merchant auth (credential) | `CredentialPerMinute` / IP |

## Legal / infra ground truth

| Item | Value | Source |
|------|-------|--------|
| Operator name | BANZAMI – Tecnologia e Serviços, Lda. (sociedade por quotas) | AGT registration + statutes (verified 2026-09-24) |
| NIF | 5003208729 | AGT "Comprovativo Fiscal de Registo de Contribuinte" |
| Registered seat | Rua Avenida 21 de Janeiro, Bairro Morro Bento, Samba, Luanda | Company statutes |
| General/legal contact | contact@banzami.com | terms.ts, footer |
| Security contact | security@banzami.com | SECURITY.md |
| Jurisdiction | Angola | site copy |
| Hosting/compute | IONOS (VPS 217.160.9.248) | `infra/terraform/ionos/`, deploy.sh |
| CDN / DNS / TLS | Cloudflare | `infra/terraform/cloudflare/`, edge compose |
| Transactional email | Resend (SMTP fallback) | `services/api-gateway/internal/config/config.go` |
| Object storage (KYB docs) | Cloudflare R2 | env `R2_*` |
| Push | Firebase FCM | `services/**` FCM wiring |
| Database | Self-hosted PostgreSQL (IONOS VPS) | infra |
| Public-site analytics | **NONE** (no deps, no tracking cookies) | `apps/website/package.json` |
| Public-site cookies | `bz_app_present` (functional), Developers session (strictly necessary) | website source |

**Cookie consequence:** only strictly-necessary/functional cookies exist on the
public site → **no cookie-consent banner is required** (§9). Documented truthfully
in the Privacy Policy.

## Applicable law (see docs/legal/BETA-LEGAL-SOURCES.md)

- **Lei n.º 22/11, de 17 de junho** — Lei da Protecção de Dados Pessoais.
- **APD — Agência de Protecção de Dados** (Decreto Presidencial n.º 214/16) —
  supervisory authority; complaints via geral@apd.ao / www.apd.ao.

## Named blockers carried into the plan

- **BLOCKER-1 (owner input): CLEARED 2026-09-24** — legal name, NIF (5003208729)
  and registered seat verified from AGT + statutes and published.
- **BLOCKER-2 (human):** lawyer review of the published Terms + Privacy (§40).
- **Design is frozen** — only functional-truth / legal / a11y / security changes.
