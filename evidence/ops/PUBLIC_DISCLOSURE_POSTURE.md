# Public-repository disclosure posture

- **Recorded:** 2026-09-01
- **Context:** the repository was made public temporarily to restore GitHub-hosted CI after Actions billing blocked runner allocation for ~8 hours. The blocked release was the fix for three confirmed cross-tenant defects.

## Assumption

**Everything present in this repository while it was public is treated as
disclosed.** That includes the origin IP, route names, architecture, historical
findings, evidence documents and the containment design.

No attempt is made to restore secrecy. Git history is **not** rewritten: the
content is already distributed, rewriting would break every existing clone and
reference, and it would trade a real, checkable property for the appearance of
one.

The security posture does not depend on any of these values being unknown. If it
did, that would itself be the defect.

## Origin IP — `217.160.9.248`

**Classified as a publicly disclosed infrastructure identifier.** It appears in 15
tracked files (`CLAUDE.md`, `deploy.sh`, `infra/`, evidence docs).

Disclosure removes an obscurity layer. It does not remove a control — and the
controls were verified after disclosure, not assumed:

| Control | Verified 2026-09-01 |
|---|---|
| Cloudflare proxy path | `sandbox-api.banzami.com/readyz` → **200** |
| Full (strict) origin TLS | **200**, no 526 |
| Direct origin `:2053` from a non-Cloudflare address | **blocked** (`000`) |
| `DOCKER-USER` Cloudflare-only policy | active — Cloudflare ranges `RETURN`, default `DROP`, 9183 packets matched |
| Public `/internal/*` | **404** on both public hosts |

**IP rotation is optional future hardening, not a current incident blocker.** It
is not performed in this task. Should it ever happen, it must be because the
address is inconvenient, never because a control depends on it being secret.

## Vulnerability detail

The repository documents RA-056, RA-057 and RA-058 in full, including routes and
exploitation method. Those defects are **CLOSED and deployed** (runtime
`866c1cfe9b2c`), proven with the temporary edge containment removed — so the
documentation describes behaviour the system no longer has.

The window that mattered was the period when the details were public *and* the
vulnerable build was still live. During that window the routes were contained at
the edge, so they were not reachable. That containment is now gone because it is
no longer needed.

## Secret material

`make security-check` (gitleaks) **PASSES** — no tracked credentials, keys,
tokens or connection strings. Verified again before handing back the visibility
decision.

Repository visibility is the owner's decision and is **not** changed here. The
security reason for staying public has ended: CI is restored and the fixes are
merged and deployed.
