# Same-VM Sandbox Operations — Operational Adapter Family

**Status:** operational adapters (source + local rehearsal). **Version:** 1.0

> **Scope.** These adapters materialise the declarative Sandbox profile into a concrete
> internal Sandbox and, later, run the controlled migration and deployment **on the VM as a
> separate authorised operational step**. In this repository they are exercised as **local
> disposable rehearsals only** — nothing here contacts, resets or provisions the VM.

## Local rehearsal only vs. VM execution later
- **Local rehearsal (this repo, `make sandbox-bootstrap-*`, etc.):** disposable topology on
  the developer machine; synthetic secrets; guarded teardown; zero residue.
- **VM execution (later, authorised):** the same adapter contracts, applied once to the
  reused VM after the authorised legacy reset. Not performed by these `make` targets here.

## The four adapters
| Adapter | Purpose | Status |
|---|---|---|
| **A. Sandbox bootstrap** | isolated project: internal data+app networks, digest-pinned pg16 + Redis (no host ports), root-protected secret/authorisation/receipt/evidence roots, role model + short-lived migration login | **implemented + rehearsed** |
| **B. Release package** | verified canonical-source transfer artefact + four attested service images + SBOM/provenance + checksums + manifest (secret-free) | subsequent focused increment |
| **C. Controlled `banzami_staging` migration** | operational adapter (separate from the 2E lab) that accepts `banzami_staging` only under the full authorisation/receipt/advisory-lock/file-only contract; never the legacy RT04E path | subsequent focused increment |
| **D. Provenance-first deployment** | one-at-a-time, no-build/no-pull, provenance-before-health deployment of the four approved services | subsequent focused increment |

## A — Sandbox bootstrap (implemented)
Materialises the `profiles/sandbox` profile into one isolated Compose project:
- **two internal networks** (data plane: db+redis+migration; app plane: services) — both
  `internal: true`, no external connectivity;
- **PostgreSQL 16 + Redis**, digest-pinned, **no host-published ports**, `no-new-privileges`,
  no privileged/host-namespace/docker-socket/host mounts;
- **root-protected roots**: secret (`0700`/`0600`, single hard-link, file-only), authorisation,
  receipt, evidence — all outside the repo, guarded scoped deletion;
- **role model**: stable schema owner (`NOLOGIN`) + restricted runtime + control-plane +
  short-lived migration login (`CONNECTION LIMIT`, `VALID UNTIL`, sole owner member),
  parameterised for `banzami_staging`;
- **fail-closed**: profile-gated (must be `sandbox` / `banzami_staging` / no host port),
  generated per-run identity, ambient overrides cleared, no global prune, no VM contact.

`sandbox-bootstrap.sh apply` is the local rehearsal bring-up; it is **not** run against the VM
in the adapter-implementation phase. LIVE remains source-defined and unprovisioned.

## Fail-closed and exclusions
No adapter targets `live`/`prod`/`production`/`banzami_live`, publishes a host DB/Redis port,
uses the legacy hidden-prompt RT04E path, deploys an unapproved service, or enables real-money
rails / external payment providers / customer data / public availability.
