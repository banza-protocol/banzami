# sdk

Official **Banzami operator integration SDKs** — the developer layer for integrating with the Banzami payment API (`api.banzami.com`).

> These are operator client libraries for the Banzami API, not BANZA protocol SDK standards. Protocol-level SDK standards and certification are owned by the BANZA protocol ([github.com/banza-protocol/banza](https://github.com/banza-protocol/banza)).

The SDKs are not helper libraries. They are the integration surface through which any Angolan application — taxi app, ecommerce site, delivery platform, donation platform — accepts instant Kwanza payments natively. They are the product for developers.

## Contents

- `flutter/` — Flutter SDK for mobile checkout, in-app payments, merchant integrations, and the foundation for future POS systems.
- `typescript/` — TypeScript SDK for web and Node.js applications.

## Conventions

- SDKs are **the payment orchestration layer for external applications**: typed APIs, automatic idempotency, retry handling, webhook signature verification, QR helpers, payment link helpers.
- No business logic, no monetary calculations, no caching of balance state inside SDKs — financial truth lives in the core.
- **API versioning:** SDK major version tracks public API major version.
- All network operations must support retries with caller-supplied **idempotency keys**.
- Error types must be structured and mappable to the public API error schema documented in [`docs/api/`](../docs/api/).
- SDK release process must be reproducible from a tagged commit. No manual artifact construction.
- Every SDK ships with examples covering the golden path and the most common failure modes.
