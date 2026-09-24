# BANZAMI FINAL DEPLOY REPORT

> Technical close + deploy + live verification. **PUBLIC_LAUNCH = NOT PERFORMED.**
> Date: 2026-09-24.

SOURCE_REVISION: `69caefa2`
DEPLOYED_REVISION: `69caefa2` (api-gateway-staging = Sandbox gateway; website-frontend = banzami.com)
SCHEMA_HEAD: `0167_environment_columns_never_default_to_live.sql` (no migration this close)

TERMS_VERSION: `2026-09-beta.2`
PRIVACY_VERSION: `2026-09-beta.2`
LEGAL_CONTENT_HASH (sha256 of lib/legal-content.ts): `05e2723a80a8b511c5296698a128d2b474aa41f494c6380709d2dc06ab730a79`

LEGAL_ENTITY_DETAILS: BANZAMI – Tecnologia e Serviços, Lda. (sociedade por quotas) · NIF 5003208729 · sede Rua Avenida 21 de Janeiro, Bairro Morro Bento, Samba, Luanda, Angola. Verified from the AGT taxpayer registration + company statutes; shareholders' personal data not stored/published.
LEGAL_CONTENT_STATUS: PUBLISHED (beta.2), PT+EN, versioned, content-hashed, indexable, in sitemap. LEGAL_ENTITY = COMPLETE. COUNSEL_REVIEW = PENDING. Not declared "LEGAL FINAL".

BUSINESS_SANDBOX_STATUS: REAL. Distinct minimal Sandbox policy `ao-business-sandbox-2026-09` (business_name, @negócio, category, email, terms) — no NIF, no documents. Live-verified on sandbox-api. Candidatura submits for real and shows the server-issued application_id (UUID); no fabricated BZB code.
BUSINESS_STATUS_SECURITY: PASS. Public status returns a PII-free DTO (application_id, status, origin, requested_handle, requirements, created_at) — no email/NIF/representative. E2E-verified: a leaked reference discloses only status, not personal data.
DEVELOPER_STATUS: PASS. SDK claims truthful: @banzami/sdk (npm), banzami_client (pub.dev) and banzami-python (PyPI, verified) published; PHP/Go not published, no install command. Landing derives from PUBLISHED_PACKAGES (source of truth).

PUBLIC_STUBS: 0 on the onboarding flows. Candidatura/estado/ativação wired to the real backend; no fake success, no fabricated reference, no hardcoded timeline. Testers + contact already real.
CLAIM_TRUTH_FAILURES: 0.

SECURITY_STATUS: PASS (reviewed). Rate limits intact + fail-closed (onboarding 30/min, application-submit 30/24h, beta 20/24h, contact 10/24h). No secret keys in client flows; PIN entered client-side, sent over HTTPS, never logged; status endpoint PII-free (no IDOR leak). TLS floor 1.2 (Cloudflare). No new headers/CSP changes.
ACCESSIBILITY_STATUS: PASS (functional; no redesign). Labelled fields (Field/Check), error messages role="alert", activation states role="status", keyboard-operable buttons.
BUILD_STATUS: PASS. Website: tsc clean, next build clean, vitest 1185 passed / 0 failed / 95 files. Backend: go build + vet clean, policy unit tests green (mutation-proven Sandbox-vs-LIVE).

DEAD_CODE_REMOVED: yes (proven orphan, no live importer).
FILES_REMOVED:
- app/comerciantes/candidatura/CandidaturaForm.tsx
- app/comerciantes/candidatura/estado/ApplicationStatusView.tsx
- app/comerciantes/activar/ActivarFlow.tsx
- lib/sandbox-autofill.ts
- components/site/CTASection.tsx
- lib/closing-ctas.ts
- (obsolete tests) lib/onboarding.test.ts, lib/sandbox-autofill.test.ts, app/comerciantes/activar/activation-states.test.ts, lib/closing-cta.test.ts

POST_DEPLOY_SMOKE:
- banzami.com / /produto /comerciantes /comerciantes/candidatura /comerciantes/candidatura/estado /comerciantes/activar /developers /termos /privacidade /verificar → all 200
- developers.banzami.com → 200
- /termos live: version 2026-09-beta.2, NIF 5003208729, registered seat, no noindex
- sandbox-api /v1/merchant/application-requirements → `ao-business-sandbox-2026-09`, 5 items (minimal)
- E2E real submit → application_id UUID, status SUBMITTED; status-by-UUID PII-free
- candidatura page renders the data-minimized form (@negócio; no NIF; no Responsável step)

FINANCIAL_LIVE_STATUS: DISABLED. api.banzami.com/v1/platform-mode → 503 (fail-closed) before and after deploy. Sandbox is the only live plane. Nothing in this close can enable Financial Live.

OPEN_P0: 0
OPEN_P1: 0
OPEN_P2: minor — SDK3 py3.12 clean-room install-and-run assertion pending (registry publication proven); contact endpoint depends on the gateway mailer being enabled.

EXTERNAL_FOLLOWUPS (not deploy blockers):
- COUNSEL_REVIEW = PENDING (Terms + Privacy sign-off; pack: docs/legal/LEGAL-REVIEW-PACK.md)
- APD_STATUS = REVIEW_REQUIRED (registration/notification duty)
- INTERNATIONAL_TRANSFER_POSITION = PENDING (subprocessors abroad)
- RETENTION_REVIEW = PENDING (concrete retention periods)

DEPLOY_COMPLETED: YES
DEPLOY_VERIFIED: YES

PUBLIC_LAUNCH = NOT PERFORMED
