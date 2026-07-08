# Banzami Internal Sandbox Rebuild — Evidence Pack

Version: 1.0
Date: 2026-07-08
Classification: Internal — Banzami technical Sandbox file
Scope: Internal technical Sandbox only. Not LIVE, not Production, not public.

---

## 1. Executive summary

A controlled, single-VM rebuild of the Banzami internal technical Sandbox was
executed end-to-end through a gated, source-controlled execution adapter. The
prior legacy environment on the designated VM was deleted from an explicit,
scoped manifest (no global prune, no unscoped deletion), and a fresh internal
Sandbox was rebuilt from canonical source: a fresh isolated project, a controlled
`banzami_staging` migration, and the four approved internal services deployed
non-root and internal-only.

Every irreversible step was gated behind a non-destructive dry-run that first
proved a full rebuild works in a temporary isolated project without touching the
legacy environment. The dry-run surfaced and forced correction of four
environment issues before any deletion occurred. Final verification passed on all
checks. This document is factual evidence of the internal Sandbox rebuild; it does
not assert BNA approval, production readiness, public availability, real payments,
customer data, or a LIVE deployment.

## 2. Canonical revision used

- Operator source of truth: canonical `main`, revision `231e0e00`.
- Deployed service images carry revision `ad4e992e` (the verified release package
  built immediately before an orchestrator-only change that does not affect
  deployed artifacts).
- All operator quality gates (18/18) pass from canonical `main`.

## 3. What was reset

Deletion was executed only from a pre-built, sanitised manifest restricted to the
Banzami / BANZA / BanzAI resource family. Sanitised categories and counts:

| Bucket | Containers | Images | Networks | Volumes |
|--------|-----------:|-------:|---------:|--------:|
| Deleted (authorised teardown scope) | 18 | 19 | 3 | 0 |
| Preserved (not deleted) | 0 | 11 | 0 | 1 |

- Preserved resources were unaffiliated shared base images and one unrelated
  volume — retained by a fail-closed classifier.
- Post-reset re-inventory: 0 legacy Banzami / BANZA / BanzAI containers, images or
  networks remain.
- No global prune, no unscoped Docker deletion, no unscoped filesystem deletion.
- No database dump or backup was taken; recovery model is reconstruction from
  canonical source, canonical migrations and fresh configuration only.

## 4. What was rebuilt

On the same VM, from the verified release package and materialised canonical
source:

1. A fresh, isolated Sandbox project (internal application and data networks).
2. PostgreSQL 16 and Redis, internal-only, with no host-published ports.
3. The role model: stable schema owner (no-login) plus restricted runtime and
   control-plane identities and a short-lived migration login.
4. A controlled `banzami_staging` migration under single-use authorisation,
   single-use receipt and a real advisory lock.
5. The four approved internal services, deployed one at a time from
   provenance-verified images (no build, no pull at deploy time).

## 5. Services now running

Internal-only; no host-published ports; each verified healthy and non-root.

| Service | Health | Non-root | Secret in env | Host port | Image identity |
|---------|:------:|:--------:|:-------------:|:---------:|:--------------:|
| core-api-staging | PASS | PASS | none | none | matches manifest |
| api-gateway-staging | PASS | PASS | none | none | matches manifest |
| developer-api | PASS | PASS | none | none | matches manifest |
| public-api-staging | PASS | PASS | none | none | matches manifest |

Running container footprint on the VM: PostgreSQL, Redis, and the four services
(six containers), all internal-only with zero host-published ports.

## 6. Database / migration status

- Target database: `banzami_staging` (internal Sandbox only).
- Migration applied under single-use authorisation and receipt (each consumed
  once) and a real advisory lock.
- Post-migration verification (all PASS):
  - relations, schemas, routines and metadata owned by the stable schema owner;
  - no foreign role owns application objects;
  - migration login least-privilege, connection-limit bounded, validity-bounded;
  - runtime and control-plane roles are not object owners;
  - stable owner is no-login;
  - short-lived migration login removed after use; its credential is unusable;
  - migration secret absent from image metadata.

## 7. Isolation and security controls

Verified controls (all PASS):

- PostgreSQL and Redis: no host-published ports.
- Separate internal application and data networks (internal-only).
- `no-new-privileges` set; no host namespaces; no privileged containers.
- Service credentials delivered file-only and exported in-process — absent from
  Docker-inspectable environment, config and labels.
- Container-consumed secret files held inside root-only (0700) directories.
- Deployment restricted to the four approved services via an allowlist; forbidden
  services (admin, frontends, dashboard, checkout, pay, reverse proxy, docs,
  BanzAI, payment adapters, LIVE) are rejected.
- All VM actions ran through the gated adapter: plan-by-default, apply requiring an
  explicit flag plus a single-use authorisation file; manifest-scoped deletion
  only; the irreversible reset fail-closed unless a non-destructive dry-run first
  proved a full rebuild.

## 8. What is intentionally not enabled

- No LIVE environment; no Production capability.
- No real-money rails; no external payment provider integration.
- No customer or personal data.
- No public API exposure, public developer access, DNS, TLS certificate or SMTP
  change.
- No new VM was created.
- No BNA Regulatory Sandbox participation is claimed or implied.
- No public availability, real payments, charges, refunds or webhooks are claimed;
  none were exercised.

## 9. Evidence summary

Result markers recorded during execution:

| Stage | Result |
|-------|--------|
| Release package build + verification (digests, SBOM, provenance, secret-free) | PASS |
| Verified transfer + source materialisation + revision match | PASS |
| Non-destructive dry-run (bootstrap → migrate → deploy → verify → teardown → zero residue) | PASS |
| Legacy reset (manifest-scoped) + post-reset legacy-absence | PASS / 0 remain |
| Fresh Sandbox bootstrap | PASS |
| Controlled `banzami_staging` migration + verification | PASS |
| Four approved services deployed, healthy, non-root | PASS |
| Final VM verification (migration + deploy + isolation) | PASS |
| Single-use authorisation file deleted; local residue zero | Confirmed |
| Operator quality gates from canonical `main` | 18 / 18 PASS |

The dry-run gate additionally caught and forced correction of four environment
issues before any deletion (source/state materialisation, Linux tool portability,
build-target architecture, and non-root secret file permissions), each fixed in
canonical source and re-proven by a passing dry-run prior to the reset.

## 10. Next recommended internal tests

Internal, synthetic, non-public only — no external OTP, email, payment rails,
customer accounts or third-party providers:

1. Internal service-to-service reachability across the Sandbox networks
   (gateway → core, developer-api, public-api) using synthetic fixtures.
2. Idempotent re-run of the controlled migration path (confirm no-op, checksums
   stable, ownership unchanged).
3. Synthetic wallet/ledger flow through the internal APIs with test data only;
   assert double-entry invariants against the real Sandbox database.
4. Restart / recovery drill: restart the Sandbox services and confirm they return
   healthy, non-root and internal-only.
5. Observability check: confirm health, metrics and structured logs are emitted
   internally for each service.
6. Reproducibility drill: re-run the full non-destructive dry-run and confirm a
   clean rebuild with zero residue.
7. Secret-boundary re-audit: confirm no credential appears in any
   Docker-inspectable surface after a restart.

---

*Prepared as internal supporting evidence for the Banzami technical Sandbox file.
Factual record of an internal Sandbox rebuild only. No LIVE, Production, public,
real-payment, customer-data or BNA-approval claim is made.*
