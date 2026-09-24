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
| Content hash (sha256 of legal-content.ts) | `dc742559fc276601d7703673e2c9ea2d36e8c87cf0c858dbb6c3706dd6586b40` |
| Immutability guard | `apps/website/lib/legal-content.test.ts` |

## Legal entity (verified from official documents — BLOCKER-1 CLEARED 2026-09-24)

Source: AGT "Comprovativo Fiscal de Registo de Contribuinte" (Registo de Pessoa
Colectiva, emitido 10-06-2026) + company statutes (Contrato de Sociedade por
Quotas). Personal data of the shareholders from those documents is **not** used
in the published legal text or stored in the repo.

| Field | Value | Status |
|-------|-------|--------|
| Legal name | BANZAMI – Tecnologia e Serviços, Lda. (sociedade por quotas) | Verified (AGT + statutes) |
| NIF | 5003208729 | Verified (AGT registration) |
| Registered seat | Rua Avenida 21 de Janeiro, Bairro Morro Bento, Município da Samba, Luanda, Angola | Verified (statutes) |
| Repartição Fiscal | 04.02 — Maianga | AGT |
| General/legal contact | contact@banzami.com | Active |
| Security contact | security@banzami.com | Active |

The published Terms and Privacy Policy now identify the operator by legal name,
form, NIF and registered seat.

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

- **BLOCKER-1 (owner input): CLEARED 2026-09-24** — legal name, NIF and
  registered seat verified from AGT + statutes and published.
- **BLOCKER-2 (human): OPEN** — counsel sign-off on the published Beta documents.

`LEGAL_STATUS = PUBLISHED (Beta), entity identification complete, pending
counsel sign-off` — not `LEGAL FINAL` until BLOCKER-2 clears.
