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

## Mechanism (image-ID retag of the exact declared reference)
Image-ID retagging of the **exact Compose-declared reference IS sufficient** for
this tag-based compose model — so that is what rollback does. It does **not** use a
generic `banzami/<service>:rollback` tag (Compose resolves the declared tag, not a
generic one, and the service name is not the image namespace).

## Flow
1. **capture** (before any replacement) — records, per service, the **Compose-declared
   image reference**, the current **immutable image ID**, the current revision label,
   timestamp and release id, into a root-owned, restrictive **pre-state manifest
   OUTSIDE the repo** and runtime app dirs (`/root/banzami-forensics/rt04e-rollback/`).
   **No secret/URL/env value is captured or printed.**
2. **restore** — for each eligible service: require **explicit operator confirmation**
   (`RT04E_ROLLBACK_CONFIRMED=yes`); confirm the captured declared reference still
   matches the live contract; **re-point that exact Compose-declared reference to the
   captured image ID**; bring up only that service; then **verify the restored running
   image ID equals the captured ID** (fail otherwise). **Fails closed** if a captured
   image ID is missing. Never targets Live/Production/unspecified services. **Never
   reverses a migration.**
3. **verify** — confirms restored running image IDs against the manifest (PASS/FAIL).

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
