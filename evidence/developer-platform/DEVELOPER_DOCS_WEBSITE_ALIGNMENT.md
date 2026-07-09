# Developer Docs & Website — Evidence Alignment

Version: 1.0

> **Scope note.** Sanitised: no secrets, tokens, JWTs, API keys, DB URLs, IPs, hostnames,
> SSH users, private paths, raw logs, private endpoints or provider details. This maps the
> meaningful public developer/website claims to the internal Sandbox evidence and records
> the action taken. Source evidence:
> [DEVELOPER_PLATFORM_E2E_RESULTS.md](DEVELOPER_PLATFORM_E2E_RESULTS.md),
> [DEVELOPER_PLATFORM_E2E_RESULTS.json](DEVELOPER_PLATFORM_E2E_RESULTS.json),
> [DEVELOPER_PLATFORM_E2E_GAP_MATRIX.md](DEVELOPER_PLATFORM_E2E_GAP_MATRIX.md),
> [PHASE0_CLOSURE_NOTE.md](../phase0/PHASE0_CLOSURE_NOTE.md).
>
> Current Developer Platform E2E status: **PASS 15 · FAIL 0 · SIMULATED 1 · DEFERRED 0 ·
> BLOCKED 1 · total 17.**

## Status legend

- **SUPPORTED** — proven by the Developer Platform E2E or Phase 0 evidence.
- **LIMITED** — true only in the Sandbox / regulatory-preparation context.
- **NOT_PUBLIC** — internal-only; must not appear in public docs.
- **REMOVED** — unsupported claim removed or rewritten.

## Paths inspected

| Path | Role | Touched |
|---|---|---|
| `docs/developer/` | Operator developer documentation (markdown) | Yes — added `BANZAMI_DEVELOPERS.md` |
| `docs/api/` | API docs placeholder (`README.md`, `.gitkeep`) | No (no claims) |
| `apps/website/app/developers/` | Public developer pages (landing, docs, portal routes) | Yes — landing page |
| `apps/website/components/developers/` | Developer page components | No |
| `apps/website/lib/site.ts` | Site config / nav | No (behaviour unchanged) |
| `apps/website/app/page.tsx` | Homepage | No developer/API claims present |
| `evidence/developer-platform/` | E2E evidence (source of truth) | Yes — added this file |

## Claim → evidence map

| Claim | Location | Source evidence | Status | Action taken |
|---|---|---|---|---|
| Integrate payments by QR / link / intent / API-SDK, with verifiable receipts, signed events and reconciliation | `docs/developer/BANZAMI_DEVELOPERS.md` §1; developers page hero | F0-DP-006/007/008/009/010/011 | SUPPORTED | Stated as the positioning; grounded per-capability |
| Platforms do not hold money / calculate balances / issue receipts / execute settlement; rely on Banzami for ledger, state, receipts, reconciliation | Doc §1, §15 | RESULTS.md "What this pass proves"; F0-DP-009/010; double-entry ledger | SUPPORTED | Stated explicitly as platform responsibilities |
| Workspace + project available under the platform context | Doc §3, §4 | F0-DP-002, F0-DP-003 | SUPPORTED | Documented at capability level |
| API keys with scopes; active accepted, wrong scope → 403 INSUFFICIENT_SCOPE | Doc §5, §13; developers page | F0-DP-004, F0-DP-005 | SUPPORTED | Documented with placeholder examples |
| Payment link from platform context | Doc §6 | F0-DP-006 | SUPPORTED | Placeholder example only |
| Payment intent from platform context | Doc §7 | F0-DP-007 | SUPPORTED | Placeholder example only |
| Online checkout completes; correct ledger; idempotent retry does not double-charge | Doc §8 | F0-DP-008 | SUPPORTED | Documented; wait-for-confirmed guidance |
| Verifiable, privacy-respecting, non-fabricable receipt | Doc §9 | F0-DP-009 | SUPPORTED | Documented; forged reference → `exists=false` |
| Reconciliation with zero discrepancy; ledger is source of truth | Doc §10 | F0-DP-010 | SUPPORTED | Documented |
| Webhooks signed (`banza-signature` HMAC), retry/backoff, idempotency | Doc §11; developers page | F0-DP-011 (contract verified in code/unit tests) | SUPPORTED | Signing/retry/idempotency stated as verified |
| Webhook **outbound delivery** to a public HTTPS endpoint works | Doc §11, §16; developers page "Simulado" card | F0-DP-011 = SIMULATED (public HTTPS sink excluded from Phase 0) | LIMITED | Marked SIMULATED / excluded; not claimed as delivered |
| API key revocation → revoked key rejected (401) | Doc §12, §13 | F0-DP-012 | SUPPORTED | Documented |
| Invalid / unauthorised access rejected (401); no ledger/balance mutation; no receipt fabricated | Doc §13 | F0-DP-013/014/015 | SUPPORTED | Documented |
| Structured error codes (INSUFFICIENT_SCOPE, UNAUTHORIZED, PAYMENTS_UNAVAILABLE, NOT_FOUND, idempotency_conflict) | Doc §14 | F0-DP-005/006/012/013/014, harness observed responses | SUPPORTED | Documented |
| **Visual Developer Console available** (log in / open dashboard / manage keys in console) | Website portal routes exist as mocked/demo (`app/developers/*`, `Stub.tsx`, dashboard "mocked") | F0-DP-UI = BLOCKED (no Developer Console frontend in tested scope) | LIMITED | New docs + website "Availability & status" section state the Console is **not yet part of the tested scope**, planned separately, **not claimed as available**; no new "log in to the console" claim added |
| Sandbox available for technical integration; production depends on rail activation | Developers page hero + API notes (pre-existing) | Phase 0 / RESULTS.md non-claims | LIMITED | Retained; reinforced with the availability disclaimer |
| Production / LIVE / real money active | (none introduced) | RESULTS.md Non-claims | REMOVED | Not asserted anywhere; "Production Activation" shown as PENDENTE |
| BNA approval / admission to a BNA sandbox | (none introduced) | RESULTS.md Non-claims | REMOVED | Explicitly disclaimed in doc §17 |
| Internal-only detail (server address, secret files, container names, DB, raw logs) | — | Sanitiser rules | NOT_PUBLIC | Never placed in public docs; placeholders only |

## Website changes

- `apps/website/app/developers/page.tsx` — added a **"Disponibilidade & estado"** section
  (before the final CTA) with three status cards (validated in Sandbox / simulated / not yet
  in tested scope) and the availability-and-regulatory disclaimer. Uses the allowed
  Developer Console wording; adds no "log in to the console" / "open your dashboard" claim.
- No change to `site.ts` behaviour, routing, middleware or the mocked portal routes (out of
  scope for a docs/copy alignment PR).

## Non-usage confirmation

No Production, LIVE, real money, real customers/customer data, external payment providers,
DNS/certificate/SMTP change, database migration, VM reset, destructive Docker prune, website
publish/deploy or local Mac QEMU build was used. No secrets, tokens, JWTs, API keys, DB
URLs, IPs, hostnames, SSH users, private paths, raw logs, private endpoints or provider
details appear. Phase 0 consolidated counts are unchanged
(**PASS 29 · FAIL 0 · SIMULATED 6 · DEFERRED 0 · BLOCKED 0**).
