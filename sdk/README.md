# sdk

Client SDKs for integrating with the Banzami public API.

## Contents

- `flutter/` — Flutter SDK for mobile checkout, merchant integrations, and the foundation for future POS systems.
- `typescript/` — TypeScript SDK for web and Node.js.

## Conventions

- SDKs are **thin wrappers over the public API**. No business logic, no monetary calculations, no caching of balance state.
- **API versioning:** SDK major version tracks public API major version.
- All network operations must support retries with caller-supplied **idempotency keys**.
- Error types must be structured and mappable to the public API error schema documented in [`docs/api/`](../docs/api/).
- SDK release process must be reproducible from a tagged commit. No manual artifact construction.
- Every SDK ships with examples covering the golden path and the most common failure modes.
