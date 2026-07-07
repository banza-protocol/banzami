# Autonomous migration controller — `sandbox-autonomous-migration-only`

Contract + validation layer for a separately-governed autonomous Sandbox migration
mode. See ADR-BLUEPRINT-004.

- `rt04e-autonomous-migration-controller.sh` — pure `amc_*` precondition validators
  (target, pinned full-SHA revision, migration-directory digest, single-use
  revision/target/digest-bound authorisation record with atomic consume + expiry),
  plus a hard **DISABLED** guard: executed directly it refuses (exit 40) and performs
  **no** migration. Sourceable for unit tests.
- `authorisation-record.schema.json` — the single-use, root-protected, credential-free
  authorisation record (KEY=VALUE; no host JSON dependency).

**Increment 1 is non-deploying.** No fake TTY, PTY injection, `expect`, keyboard
simulation or hidden-input automation is used or permitted. The existing manual RT04E
`migration-only` path is retained and unchanged. Wiring the controller to the
migration-runner image is a later, separately-reviewed increment gated by an explicit
approved Sandbox runtime boundary.
