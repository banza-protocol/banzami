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

## Mechanism (prune-proof retained tag + image-ID retag of the exact declared ref)
Capture pins each pre-state image ID under a **retained, prune-proof rollback tag**
`banzami/<repo>:rt04e-prestate-<rev>-<service>` (`rt04e_prestate_tag`), so the
pre-state image cannot be lost to pruning before the window closes. Restore then
re-points the **exact immutable Compose-declared reference** (`rt04e_release_ref`,
`banzami/<repo>:rt04e-<rev>`) to that captured image ID. It does **not** use a
generic `banzami/<service>:rollback` tag, nor any service-name-derived repo (Compose
resolves the declared reference, and the service name is not the image namespace).
RT04E never prunes/`rmi` anywhere.

## Flow
1. **capture** (before any replacement) — for each service: create the **retained
   prune-proof pre-state tag** pinning the current **immutable image ID**, and record
   the release id, service, **declared immutable reference**, prestate tag, image ID,
   revision label and timestamp into a root-owned, restrictive **pre-state manifest
   OUTSIDE the repo** and runtime app dirs (`/root/banzami-forensics/rt04e-rollback/`).
   **No secret/URL/env value is captured or printed.**
2. **restore** — for each eligible service: require **explicit operator confirmation**
   (`RT04E_ROLLBACK_CONFIRMED=yes`) and the generated `RT04E_OVERRIDE`; confirm the
   captured declared reference still equals `rt04e_release_ref` for the release;
   confirm the **retained prestate tag still resolves to the captured image ID**;
   **re-point that exact immutable declared reference to the captured image ID**; bring
   up only that service through the **central hermetic Compose wrapper** (`rt04e_compose`
   — fixed file set/order, fixed project scope, inherited `COMPOSE_*` rejected) with the
   **full isolation flags** (`--no-build --pull never --force-recreate --no-deps`); then
   **verify the restored running image ID equals the captured ID** (fail otherwise).
   The release identifier is the **full 40-hex canonical SHA**. **Fails closed** if a captured
   image ID or retained pin is missing. Never targets Live/Production/unspecified
   services. **Never reverses a migration.**
3. **verify** — confirms restored running image IDs against the manifest (PASS/FAIL).

## Rules
- Only the four allowlisted Sandbox services may be restored.
- Explicit operator confirmation is required before any restore.
- A missing pre-state reference **or** a retained tag that no longer resolves to the
  captured image ID is a hard stop (no blind rollback).
- RT04E performs **no** prune/`rmi`; retained pre-state tags persist until the
  approved rollback window closes (manual).
- Database migrations are **forward-only**; recovery from a bad migration is a
  separate, explicit, human-decided procedure — never automated here.
- Rollback evidence is kept **outside** `/srv/banzami/src`.

## When to roll back
If the RT04E provenance gate (revision-label mismatch / unlabelled image) or the
unauthenticated liveness checks fail, the runner stops before declaring success and
points to the operator-confirmed rollback. The migration already applied is **not**
reversed — only the application images are restored to their pre-state.
