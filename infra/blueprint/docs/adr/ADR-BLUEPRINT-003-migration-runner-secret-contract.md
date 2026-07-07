# ADR-BLUEPRINT-003 — Immutable migration runner and read-only file secret contract

**Status:** Accepted (Increment 1). **Version:** 1.0

## Context
The VM must not become a Rust/Cargo/SQLx/psql/PostgreSQL workstation, and database
credentials must never appear in environment variables, image layers, Compose, argv
or logs. Both properties must hold identically in Sandbox and Live.

## Decision
Ship a source-controlled, immutable **migration-runner image**
(`infra/blueprint/migration-runner/`):

- multi-stage build; the SQLx CLI (locked to the repo's `sqlx = "0.7"` line, pinned
  `0.7.4`) and Rust tooling exist only in the build stage;
- runtime carries only the `sqlx` binary, a pinned PostgreSQL client and the
  entrypoint; no application runtime, no secrets, no host port;
- base images pinned by immutable digest (`digests.lock`); mutable `latest` forbidden;
- image identity = source revision + immutable digest; SBOM/provenance where supported;
- ephemeral, one-purpose, removed after each operation.

**Secret contract:** the entrypoint reads the database URL **only** from a read-only
mounted file (`/run/secrets/rt04e_migration_url`). It refuses a credential supplied
via environment variable, argv or build arg, and never prints it. A future Live
deployment swaps the host file backend for an external secret manager **without
changing** the application or migration contracts (`base/contracts/secret-interface`).

## Rationale
- Containerising the migration toolchain removes the host-tooling gap without turning
  the VM into a build workstation.
- A file-only credential interface keeps secrets out of every inspectable surface.

## Consequences
- `docker inspect` never reveals a credential (no env injection).
- Digests are resolved and pinned by the build pipeline; the repo forbids mutable tags.
