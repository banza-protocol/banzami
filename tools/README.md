# tools

Internal developer tooling, scripts, and utilities.

## Scope

Anything that supports development, testing, or operations but is **not** part of a deployed service belongs here. Examples:

- code generators,
- migration helpers,
- local reconciliation simulators,
- load-test harnesses,
- one-off data inspection scripts.

## Conventions

- Tools must not be required for production runtime. If something is needed at runtime, it belongs in `services/` or `core/`.
- Each tool lives in its own subdirectory with a `README.md` documenting purpose, usage, dependencies, and safety notes.
- Tools that touch production data must be reviewed and require explicit operator confirmation at runtime. No silent destructive actions.
- Language choice is pragmatic (Go, Rust, TypeScript, Python, shell), but production languages are preferred when the tool may evolve into a service.
