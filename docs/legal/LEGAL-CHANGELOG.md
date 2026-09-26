# LEGAL CHANGELOG — Banzami Beta Sandbox

Published legal versions are immutable. Each entry records a version, what
changed and why. Content hash = sha256 of `apps/website/lib/legal-content.ts`
(enforced by `lib/legal-content.test.ts`).

## Terms of Service + Privacy Policy

### 2026-09-beta.4 — 2026-09-26 (current)
- **Material (factual parity):** the Sandbox Business application was restored to
  the **full onboarding flow** — business details, **representative details**,
  **NIF**, and a **documents step** — so the Sandbox rehearses the same journey the
  real-money product will use. Terms §10 and Privacy §05 now state that the Sandbox
  records the representative details + NIF the applicant enters and that the
  documents step uses **test document fixtures** (no real file uploads). The
  guidance remains: use test data only; do not enter real personal/third-party data
  or upload real documents. No real KYB verification, no real-money capability.
- Content hash: `e01a1a6f5132b0ad4bf3d153a3cb5351c13c15c2b489599ccab2cda67a1b1dc4`.
- **Counsel sign-off:** PENDING (BLOCKER-2). This version was drafted for factual
  accuracy of what the restored flow collects; a legal review of the expanded
  Sandbox data collection (representative identity + NIF as test fields) is a
  required FOLLOW_UP before any real-data collection or real-money enablement.
- **Reacceptance:** not forced. The Sandbox remains test-only (fictitious money,
  synthetic data, fixture documents); existing acceptances remain valid and new
  applications record beta.4.

### 2026-09-beta.3 — 2026-09-26 (superseded)
- **Editorial / non-material change:** public terminology normalization. The
  internal term **"Financial Live"** was removed from the published legal text and
  replaced by **"operações com dinheiro real"** (PT) / **"real-money operations"**
  (EN). §05 retitled *"Operações com dinheiro real indisponíveis" / "Real-money
  operations unavailable"* (stable anchor `#financial-live` preserved). No change
  to rights, obligations, scope, data processing or the truth stated: real-money
  operations remain unavailable and out of scope; the Sandbox uses fictitious money.
- Content hash: `47d42acd55ac4affa9a997561f7747e7e6cb5bed2fc7c6ff76396a0759ef922a`.
- **Reacceptance:** not forced. The change is editorial (wording only, meaning
  preserved); existing beta.2 acceptances remain valid and new applications record
  beta.3.

### 2026-09-beta.2 — 2026-09-24 (superseded)
- **Material change:** complete legal-entity identification added to §01 of both
  documents — legal name **BANZAMI – Tecnologia e Serviços, Lda.**, **NIF
  5003208729**, registered seat **Rua Avenida 21 de Janeiro, Bairro Morro Bento,
  Samba, Luanda, Angola** (verified from the AGT taxpayer registration and the
  company statutes; shareholders' personal data not included).
- Content hash: `05e2723a80a8b511c5296698a128d2b474aa41f494c6380709d2dc06ab730a79`.
- **Reacceptance:** not forced. Published the same day as beta.1, before any
  acceptance was persisted; no prior acceptances exist to migrate (§19).

### 2026-09-beta.1 — 2026-09-24 (superseded, same day)
- Initial publication of the Beta Sandbox Terms of Service + Privacy Policy
  (operator identified by name + contact; NIF/seat not yet incorporated).
- Superseded within the same day by beta.2 once the official company documents
  were supplied.
