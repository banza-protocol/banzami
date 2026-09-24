# BETA — DEPLOY READINESS (technical close, NOT a public launch)

> Scope: technical closure + deploy + live verification. **No public launch, no
> Financial Live, no announcement.** Go-live-only concerns are listed as
> EXTERNAL_FOLLOWUPS, not deploy blockers (§7).

| Field | Value |
|-------|-------|
| SOURCE_REVISION (pre-deploy) | `502249fd` |
| SCHEMA_HEAD | `0167_environment_columns_never_default_to_live.sql` (unchanged — no migration this close) |
| TERMS_VERSION / PRIVACY_VERSION | `2026-09-beta.2` |
| LEGAL_CONTENT_HASH | `05e2723a80a8b511c5296698a128d2b474aa41f494c6380709d2dc06ab730a79` |

## Technical gates

| Gate | State | Evidence |
|------|-------|----------|
| Typecheck (website) | PASS | `tsc --noEmit` clean |
| Unit/integration (website) | PASS | vitest 1185 passed, 0 failed, 95 files |
| Backend build + vet (api-gateway) | PASS | `go build ./...`, `go vet`, policy unit tests green |
| CLAIM_TRUTH_FAILURES | 0 | developer-docs SDK guards green; banzami-python proven on PyPI |
| Production build (website) | PASS | `next build` clean |
| LEGAL_CONTENT | PASS | published, versioned (beta.2), content-hashed, indexable, PT+EN |
| LEGAL_ENTITY | COMPLETE | BANZAMI – Tecnologia e Serviços, Lda., NIF 5003208729, seat verified |
| PRIVACY / CODE PARITY | PASS | Sandbox onboarding collects no NIF/docs — matches the Privacy Policy + backend Sandbox policy |
| BUSINESS_SANDBOX_ONBOARDING | PASS (real) | minimal Sandbox policy; candidatura → real POST; real reference (UUID) |
| BUSINESS_STATUS_SECURITY | PASS | public status returns PII-free DTO (no IDOR/PII leak); UUID is a capability |
| ACTIVATION | PASS (real) | ?token → validate → PIN → complete; no fake success |
| ZERO_PUBLIC_STUBS | PASS | candidatura/estado/ativação wired to real backend; no fabricated BZB code, no fake timeline |
| TESTERS / CONTACT | PASS | already real (contact gated on gateway mailer) |
| FINANCIAL_LIVE_PUBLICLY_DISABLED | PASS | api.banzami.com/v1/platform-mode → 503 (fail-closed); Sandbox is the only plane |
| COOKIE_TRUTH | PASS | no analytics/marketing deps; only functional cookies → no banner (documented) |
| SECURITY | PASS (reviewed) | rate limits intact + fail-closed; no secret keys in client flows; PIN never logged client-side; TLS floor 1.2 (CF); status endpoint PII-free |
| ACCESSIBILITY | PASS (functional) | form labels via Field/Check; errors role="alert"; activar role="status"; no redesign |
| DEAD_CODE | REMOVED | orphan CandidaturaForm/ApplicationStatusView/ActivarFlow + sandbox-autofill + CTASection/closing-ctas; guards retargeted/retired |
| DESIGN | UNCHANGED | frozen; only functional-truth/legal/privacy edits (e.g. data-minimized form) |

## Components to deploy

- `website-frontend` (banzami.com) — legal beta.2, real onboarding flows, claim-truth, cleanup.
- `api-gateway-staging` (public Sandbox gateway) — environment-aware minimal Sandbox business-application policy (code-only, no migration).

## EXTERNAL_FOLLOWUPS (not deploy blockers)

- **COUNSEL_REVIEW = PENDING** — lawyer sign-off on the published Beta Terms + Privacy (pack ready).
- **APD_STATUS = REVIEW_REQUIRED** — confirm any registration/notification duty (docs/legal pack).
- **INTERNAL_TRANSFER_POSITION = PENDING** — lawful-transfer basis for subprocessors abroad.
- **RETENTION_REVIEW = PENDING** — concrete retention periods.
- **SDK3 clean-room run** — a py3.12 `pip install banzami-python` + run assertion (registry publication already proven).
- Contact endpoint depends on the gateway mailer being enabled (503 otherwise) — ops.

## Not performed (by instruction)

PUBLIC_LAUNCH, Financial Live enablement, announcements, feature-flag changes,
"BETA_LAUNCH_READY"/"LEGAL FINAL" declarations.
