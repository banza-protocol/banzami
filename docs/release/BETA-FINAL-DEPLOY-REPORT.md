# BANZAMI FINAL DEPLOY REPORT

> Technical close + deploy + live verification. **PUBLIC_LAUNCH = NOT PERFORMED.**
> Date: 2026-09-24.

DEPLOY_SOURCE_REVISION: `69caefa2`
DEPLOYED_REVISION: `69caefa2` (api-gateway-staging = Sandbox gateway; website-frontend = banzami.com)
FINAL_REPOSITORY_HEAD: `9d620278` → (this closure pass adds one more docs commit)
RUNTIME_DIFF_DEPLOY_TO_HEAD: **NONE** — the only commit after 69caefa2 (9d620278) changed exactly one file, `docs/release/BETA-FINAL-DEPLOY-REPORT.md`; no runtime code/config differs between the deployed revision and HEAD, so the existing deployment is kept (no redeploy).
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

SECURITY_GATES: PASS. KNOWN_SECURITY_P0 = 0. KNOWN_SECURITY_P1 = 0.
Evidence: rate limits intact + fail-closed (onboarding 30/min, application-submit 30/24h, beta 20/24h, contact 10/24h); no secret keys in client flows; PIN entered client-side, sent over HTTPS, never logged; public status endpoint returns a PII-free DTO (no IDOR leak); TLS floor 1.2 (Cloudflare); no new headers/CSP changes this close.
ACCESSIBILITY_GATES: PASS.
Evidence (functional, no redesign): labelled fields (Field/Check), error messages role="alert", activation states role="status", keyboard-operable buttons.
CONTACT_FLOW: PASS.
Evidence — real Sandbox submission to POST /v1/contact:
- FORM_SUBMIT: real POST accepted.
- GATEWAY_ACCEPTANCE: 200 `{"status":"received"}` (passed validation + honeypot).
- MAILER_RESULT: delivered — the handler returns 200 only after a synchronous `mailer.DeliverErr` succeeds (nil mailer → 503 UNAVAILABLE; delivery failure → 502 DELIVERY_FAILED). Neither occurred, so the mailer is connected and the message was sent (to contact@banzami.com, Reply-To the visitor). The earlier "depends on the mailer being connected" ambiguity is resolved: it IS connected.
- ERROR_HANDLING: a bad payload returns 400 `INVALID_EMAIL` with a request_id (not a page 200).
- RATE_LIMIT: 10 / 24h / IP (fail-closed), unchanged.
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

TEST_RESIDUALS: 1 (preserved, cannot be removed safely). The post-deploy check created one SUBMITTED Sandbox merchant application, handle `verify_14413` (test email only, no other PII). Reason it is preserved: there is NO public applicant cancel/withdraw endpoint; the only canonical removals are (a) an operator reject via `/internal/v1/merchant-applications/{id}/reject` (requires owner MFA/operator access) or (b) the clean-slate retire ceremony (requires owner `--apply` approval), and direct SQL is prohibited. It is harmless Sandbox data; the owner can retire it via the official lifecycle. (The closure contact test created only an email, not a persistent record.)

OPEN_P0: 0
OPEN_P1: 0
OPEN_P2: minor — SDK3 py3.12 clean-room install-and-run assertion pending (registry publication proven). Note: banzami-python requires Python ≥ 3.12; installing on an older interpreter fails with "Requires-Python >=3.12" — not a publication defect.

EXTERNAL_FOLLOWUPS (not deploy blockers):
- COUNSEL_REVIEW = PENDING (Terms + Privacy sign-off; pack: docs/legal/LEGAL-REVIEW-PACK.md)
- APD_STATUS = REVIEW_REQUIRED (registration/notification duty)
- INTERNATIONAL_TRANSFER_POSITION = PENDING (subprocessors abroad)
- RETENTION_REVIEW = PENDING (concrete retention periods)

DEPLOY_COMPLETED: YES
DEPLOY_VERIFIED: YES

PUBLIC_LAUNCH = NOT PERFORMED
