# ADR-024: Platform Status — LIVE vs SANDBOX

**Status:** Accepted — implemented (closed)
**Date:** 2026-06-29
**Authors:** Banzami Engineering
**Related:** ADR-022 · ADR-023

---

## Context

The platform needed one unambiguous, centrally-controlled state so users,
merchants and operators always know whether they are in production or testing —
without hidden per-deployment env flags.

## Decision

A single audited source of truth, `platform_settings.platform_mode`, with exactly
two states: **LIVE** and **SANDBOX**. No MAINTENANCE/BETA/INCIDENT (those are
infrastructure concerns, not product state).

### Official philosophy — production is silent
- **LIVE** is the normal state and is **never announced**: no banner, no badge, no
  "LIVE" text anywhere public.
- **SANDBOX** is the exception and is **always communicated**: a yellow banner on
  the public website (every page) and a `🟨 SANDBOX` badge in the Merchant Portal,
  Consumer Portal and BANZADMIN top bar.

### Persistence + audit (migration 0076)
- `platform_settings` (key/value/environment/reason/updated_by/version) seeded
  `platform_mode=SANDBOX`; immutable `platform_settings_history` (never deleted).

### Control (BANZADMIN → Administração → Plataforma)
- Read: any operator. Change: **SUPER_ADMIN only**.
- A switch requires a mandatory reason **and** the exact typed confirmation —
  `CONFIRMO ATIVAR LIVE` / `CONFIRMO ATIVAR SANDBOX`. Wrong text → 400, nothing
  changes. Audited as `PLATFORM_MODE_CHANGED` (operator, IP, before/after, reason).

### Public endpoint (api-gateway, no rebuild to flip)
`GET /v1/platform-mode` →
- SANDBOX: `{ "mode":"SANDBOX", "public_banner":true, "message":"Esta plataforma encontra-se em ambiente de testes." }`
- LIVE: `{ "mode":"LIVE", "public_banner":false }`

Never returns operator/history/audit/internal config. 30s cache.

### Fail-safe
Any read error (DB down, missing/garbage value) resolves to **SANDBOX**. The
platform is never assumed LIVE on failure.

## Consequences
Flipping the whole ecosystem between testing and production is a single audited,
SUPER_ADMIN action that reflects everywhere within ~30s, no redeploy. Production
behaves like any professional financial product — silent. Known limitation: the
merchant onboarding *submission target* remains build-time (`NEXT_PUBLIC_BANZAMI_API_URL`);
only the visible banners are runtime-driven.
