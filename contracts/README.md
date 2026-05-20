# contracts/

Canonical location for all public protocol contracts — the shared truth between Banzami's infrastructure and the external ecosystem.

## Purpose

A protocol contract is any artifact that defines a formal interface between Banzami's platform and external consumers (SDKs, plugins, merchants, certification tools). Contracts must be versioned, reviewed as breaking changes, and must not live only in prose documentation once implementation begins.

## Subdirectories

| Directory | Contents |
|-----------|----------|
| `openapi/` | OpenAPI 3.x specifications for the public REST API |
| `webhooks/` | JSON Schema definitions for all webhook event payloads |
| `qr/` | QR payload format specification and encoding rules |
| `events/` | Internal and external domain event schemas |
| `sdk-certification/` | Canonical test vectors for SDK compliance certification |

## Migration note

`sdk-certification/` at the repository root is the current physical location of SDK certification vectors (test suites and reference payloads). The canonical target location is here. No physical move has been performed yet — the root `sdk-certification/` is the authoritative source until migration is complete and verified.

## Rules

- Every new public protocol contract must land here first.
- Contracts must be versioned (`v1/`, `v2/`) if they can evolve independently.
- No protocol contract may exist only in prose documentation (`docs/`) once implementation begins.
- Breaking changes to a contract require an ADR.
