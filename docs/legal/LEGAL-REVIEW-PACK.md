# LEGAL REVIEW PACK — Banzami Public Beta Sandbox

> For review by qualified Angolan counsel before the documents are relied upon as
> final. The Beta Sandbox documents are **published** (versioned, content-hashed,
> indexable) and make **no** false regulatory or financial claims, but they are
> **not** a substitute for legal review. Open items below are named, not hidden.

## Scope

- Product: **Banzami — Public Beta Sandbox** (test money; no settlement; no
  Financial Live). No claim of being a licensed/regulated financial institution.
- Documents: Terms of Service (`/termos`) and Privacy Policy (`/privacidade`),
  PT + EN, rendered from `apps/website/lib/legal-content.ts`.

## Versions & integrity

| Item | Value |
|------|-------|
| Terms version | `2026-09-beta.1` |
| Privacy version | `2026-09-beta.1` |
| Effective / published | `2026-09-24` |
| Content hash (sha256 of legal-content.ts) | `0b8fac2e8ffe34081c09899b3c0d707000a59050a4f595c520ff82dd15e842c5` |
| Immutability guard | `apps/website/lib/legal-content.test.ts` |

## Legal entity (as stated by the company)

| Field | Value | Status |
|-------|-------|--------|
| Name | BANZAMI – Tecnologia e Serviços, Lda. | Self-asserted (lib/terms.ts / legal-content.ts) |
| Form / seat | Sociedade de direito angolano; opera a partir de Angola | Stated |
| General/legal contact | contact@banzami.com | Active |
| Security contact | security@banzami.com | Active |
| **Registered address** | **NOT SUPPLIED** | **BLOCKER-1 (owner)** |
| **NIF** | **NOT SUPPLIED** | **BLOCKER-1 (owner)** |

The documents identify the operator by name, form, jurisdiction and contact,
which is accurate and invents no registration. Complete the address + NIF (and
confirm the exact registered name) to finalise the entity identification.

## Sources cited

See `docs/legal/BETA-LEGAL-SOURCES.md`:
- **Lei n.º 22/11, de 17 de junho** — Lei da Protecção de Dados Pessoais.
- **APD — Agência de Protecção de Dados** (Decreto Presidencial n.º 214/16).

## Data map & subprocessors

- `docs/legal/BETA-DATA-MAP.md` — data, purpose, legal basis, retention,
  deletion path, data-subject right (must match the Privacy Policy; guard test
  asserts core claims).
- `docs/legal/SUBPROCESSORS.md` — IONOS, Cloudflare, Resend, Firebase, R2
  (LIVE only). No analytics/marketing subprocessor on the public site.

## Open legal questions for counsel (do not resolve technically)

1. **Financial licensing.** Confirm a non-monetary Sandbox (no e-money, no
   settlement, no withdrawals) is outside BNA licensing. The docs make no
   licensing claim.
2. **APD registration/notification** of the Beta processing operation, if any.
3. **International transfers** legal basis (subprocessors abroad).
4. **Retention periods** — set concrete durations (currently "Beta window").
5. **Legal-basis wording** per Lei n.º 22/11 for each data-map row.
6. **Governing law / jurisdiction** clause adequacy and any mandatory
   consumer-protection carve-outs.
7. **Limitation of liability** — confirm the exclusions are admissible under
   Angolan law.

## Named blockers to "LEGAL FINAL"

- **BLOCKER-1 (owner input):** registered address + NIF + confirmation of the
  exact registered legal name.
- **BLOCKER-2 (human):** counsel sign-off on the published Beta documents.

Until BLOCKER-1 and BLOCKER-2 are cleared, `LEGAL_STATUS = PUBLISHED (Beta),
pending counsel + entity details` — not `LEGAL FINAL`.
