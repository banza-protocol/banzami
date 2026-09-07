# Banzami migration-runner (immutable, ephemeral)

Multi-stage image that carries the migration toolchain so the VM needs **no** global
Rust/Cargo/SQLx/psql/PostgreSQL install. See ADR-BLUEPRINT-003.

- `Dockerfile` — build stage compiles `sqlx-cli` (locked `0.8.6`, matching the repo's
  `sqlx = "0.7"`); runtime carries only the `sqlx` binary + a pinned `postgresql-client`
  + the entrypoint. Non-root, no host port, no secrets in layers/args/labels.
- `entrypoint.sh` — reads the database URL **only** from the read-only mounted file
  `/run/secrets/rt04e_migration_url`; refuses env/argv credentials; never prints it.
- `digests.lock` — base images are pinned by immutable digest at build time; a mutable
  `latest` tag is never used. The build pipeline resolves the version tags in this
  lock to their `sha256` digests and builds digest-pinned.

Not built or run against the VM in Increment 1. Image identity is source-revision +
immutable digest; SBOM/provenance are enabled where the build path supports them.
