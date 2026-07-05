# RT04E Sandbox Rollback

**Status:** design; **not executed**. Sandbox-only. **Version:** 1.0

Application-image rollback for the RT04E Sandbox service set, implemented by
`infra/deployment/rt04e-sandbox-rollback.sh`.

## Irreversible boundary (read first)
```
Application image rollback may restore the previous Sandbox service set.
Database migrations are forward-only and are NOT automatically reversed.
```

## Eligible services (only these four)
`core-api-staging` · `api-gateway-staging` · `developer-api` · `public-api-staging`.
Rollback **refuses** any other service and anything matching `prod`/`production`/`live`
or the non-staging `core-api`/`api-gateway`/`public-api`/`admin-api`.

## Flow
1. **capture** (before any replacement) — records each eligible service's current
   image ID into a root-owned, restrictive **pre-state manifest OUTSIDE the repo**
   and runtime app directories (`/root/banzami-forensics/rt04e-rollback/`), with a
   release id, timestamp, service name and prior image identity. **No secret value
   is captured or printed.**
2. **restore** — restores the captured images for the eligible Sandbox services
   only. Requires **explicit operator confirmation** (`RT04E_ROLLBACK_CONFIRMED=yes`).
   **Fails closed** if a required pre-state image reference is missing. Never
   targets Live/Production/unspecified services. **Never reverses a migration.**
3. **verify** — confirms restored image identities against the manifest.

## Rules
- Only the four allowlisted Sandbox services may be restored.
- Explicit operator confirmation is required before any restore.
- A missing pre-state reference is a hard stop (no blind rollback).
- Database migrations are **forward-only**; recovery from a bad migration is a
  separate, explicit, human-decided procedure — never automated here.
- Rollback evidence is kept **outside** `/srv/banzami/src`.

## When to roll back
If the RT04E provenance gate (revision-label mismatch / unlabelled image) or the
unauthenticated liveness checks fail, the runner stops before declaring success and
points to the operator-confirmed rollback. The migration already applied is **not**
reversed — only the application images are restored to their pre-state.
