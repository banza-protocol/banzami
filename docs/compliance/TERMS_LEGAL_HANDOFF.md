# Terms of Service — Legal Handoff Packet

**Milestone:** PUBLIC-WEBSITE-LEGAL-RELEASE-001
**Status:** `TERMS_INFRASTRUCTURE_READY=PASS` · `TERMS_LEGAL_SOURCE=BLOCKED_ON_HUMAN_APPROVAL`
**Version:** 1.0

This packet gives legal counsel the factual context to author the Banzami Terms of
Service. All infrastructure around the document is built and wired; only the
human-approved legal body is outstanding. **No legal clauses were fabricated.**

---

## 1. What is ready (no legal authorship needed)

| Item | State |
|---|---|
| Canonical route | `https://banzami.com/termos` — live, returns 200, **noindex** while DRAFT |
| Versioning model | `apps/website/lib/terms.ts` — `status`, `version`, `effectiveDate`, `publishedAt`, `documentHash`, `legalEntity`, `contactEmail` |
| Page metadata scaffold | Version / Em vigor desde / Entidade responsável (shown as "Pendente" until published) |
| All UI Terms references | Wired to `/termos` (see inventory) |
| Guards | `lib/terms-references.test.ts`, `lib/closing-cta.test.ts`, `check-public-site-truth` |

## 2. What is required from legal counsel

1. **The approved Terms of Service body** (PT; EN only if separately approved — never machine-translated as binding, per §18).
2. **A version identifier** (human-readable, immutable, e.g. `2026-10-01`).
3. **An effective date.**
4. Confirmation of the **responsible legal entity** string (currently `BANZAMI – Tecnologia e Serviços, Lda.`).
5. Confirmation of whether **Privacy** requires a consent-based `policy_version` (see §7).

On receipt: install the body in `app/termos/page.tsx` (published branch), set
`TERMS.status='PUBLISHED'` + version/effectiveDate/publishedAt/documentHash in
`lib/terms.ts`, flip the page to indexable, add **Termos** to the footer Legal
links, then run the acceptance E2E and re-run official-readiness.

## 3. Terms-reference inventory (100%)

| Surface | File | Acceptance model | Link target (now) |
|---|---|---|---|
| Public merchant application (candidatura) | `apps/website/app/comerciantes/candidatura/CandidaturaForm.tsx` | **Explicit checkbox** ("Aceito os termos e condições") — required to submit | `/termos` (was `/suporte`) |
| Console business application | `apps/website/components/developers/portal/BusinessApplicationForm.tsx` | **Explicit checkbox** — required to submit | `/termos` (added; was unlinked) |
| Developer sign-in | `apps/website/app/developers/login/page.tsx` | **Implicit** ("Ao continuar, concorda com os Termos…") — no checkbox | `https://banzami.com/termos` (was `/sobre`) |
| Consumer app (mobile) | `apps/mobile/lib/screens/help_screen.dart` | Info link only ("Termos de uso") — **no acceptance gate**; currently shows "brevemente" | Follow-up: open `/termos` on publication (needs a mobile release) |

No other Terms links exist. `terms_accepted` also appears as a data field in
`lib/api.ts`, `lib/developer-api.ts`, `lib/financial-onboarding.ts` (payload
shape, not a link).

## 4. Acceptance recording (current backend truth)

- **Recorded:** `merchant_applications.terms_accepted_at` (timestamptz) — set when a
  business/merchant application is submitted with `terms_accepted: true`
  (`services/api-gateway/internal/service/merchant_applications.go`,
  `business_requirements.go`). Verified in the live Sandbox DB.
- **NOT recorded:** `terms_version`. There is no version column today.
- **Gap / design (blocked on the real version):** add a nullable
  `terms_version text` to `merchant_applications`, populate it at submission from
  `TERMS.version` (the version in effect), and surface it in the admin business
  detail. **Not implemented now** because recording a placeholder version for real
  submissions would fabricate a version (violates §12). Implement together with
  publication of the approved document.
- **Not in the financial ledger.** Terms acceptance creates no financial authority
  (§10). It stays on the application/identity record.

## 5. Identity domains (no authority leakage — §11)

Consumer, Business, and Developer remain distinct authenticated subjects.
Acceptance is recorded against the actual subject of each flow (today: the
merchant application). No shared identity is introduced to centralize acceptance.

## 6. Existing accounts (§12)

Pre-launch, Sandbox-only, fictitious money. No account has a fabricated
`terms_accepted_at`/`terms_version`. Recommended policy once a version is
published: require acceptance on the next relevant submission/login; never
back-fill historical consent. Synthetic/test residue is retired via existing
clean-slate tooling, not by fake consent.

## 7. Privacy implementation facts (for legal review — §14)

Factual data-processing inventory (no legal promises authored here):

- **Marketing website (banzami.com):** no login. Beta-tester registration form
  collects name, email, platform, device/OS (optional), country (optional), with
  an explicit data-use consent checkbox. Merchant application collects business
  name, NIF, address, representative, contact email + KYB documents.
- **App Banzami (consumer):** wallet/account in the public Sandbox; **no KYC in
  Sandbox** (`AppConfig.requiresIdentityVerification` is false in Sandbox).
- **App Banzami Business:** business account, KYB documents, app PIN (bcrypt),
  sessions.
- **Developer Platform:** email + one-time code sign-in (no password); project
  API keys; webhook endpoints.
- **Auth/account data:** email, one-time codes, session cookies (host-only),
  bcrypt PIN for Business.
- **Camera/QR:** camera used on-device to read QR; no image leaves the device.
- **Logs/telemetry:** structured server logs (OpenTelemetry/Prometheus); no
  third-party product analytics.
- **Support/contact:** email to `contact@banzami.com`; security to
  `security@banzami.com`.

Current `/privacidade` is scoped to the beta-tester programme. **Human legal
review** is required to confirm/extend scope to the full ecosystem above. Nothing
in the policy was autonomously rewritten.

## 8. Cookie / tracking facts (§15)

- **No analytics, no marketing tracking, no third-party trackers.**
- Essential cookies only: host-only **session cookie** (developer Console auth).
- `localStorage`/`sessionStorage`: lightweight per-viewer UI state only.
- **No cookie banner** is present; add one only if approved legal requirements
  actually call for it — current implementation does not require consent for
  essential auth cookies.

## 9. Security disclosure (§16) — unchanged, verified

- `security@banzami.com` and `https://banzami.com/.well-known/security.txt`
  (Contact → security@, Policy → /suporte). Live.

## 10. Legal entity (§5 / §26)

- Registered legal identity for legal surfaces: **BANZAMI – Tecnologia e Serviços,
  Lda.** Marketing positioning is unchanged (**Banzami is a startup**);
  `MARKETING_STARTUP_IDENTITY_UNCHANGED=PASS`.

---

## 11. Publication checklist (when approved text arrives)

- [ ] Install approved body in `app/termos/page.tsx` (published branch).
- [ ] Set `TERMS.status='PUBLISHED'` + `version`/`effectiveDate`/`publishedAt`/`documentHash` in `lib/terms.ts`.
- [ ] Page becomes indexable (robots flips automatically via `isTermsPublished()`); set canonical (already `/termos`).
- [ ] Add **Termos** to the footer Legal links (next to Privacidade).
- [ ] Add `/termos` to the sitemap (`lib/public-pages.ts`).
- [ ] Add `terms_version` recording to `merchant_applications` + thread through the application API.
- [ ] Run acceptance E2E: cannot submit when required acceptance is false; can after explicit acceptance; record stores the current version; no duplicate/fake records.
- [ ] Re-run official-readiness gates (edge, founders, naming, claims, boundaries, a11y, responsive, SEO, crawl, truth guards, headers).
- [ ] Then, and only then: `PUBLIC-WEBSITE-OFFICIAL-READINESS-001 = OFFICIAL RELEASE READY`.
