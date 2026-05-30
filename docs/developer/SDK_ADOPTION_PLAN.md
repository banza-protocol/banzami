# BANZA — SDK Adoption Plan

**Mission:** BANZA-FIRST-100-BUILDERS-001  
**Scope:** Everything required to make BANZA SDKs discoverable, installable, and production-ready  
**Date:** 2026-05-30  
**Status:** Official

---

## Current State

| SDK | Language | Location | Published | Status |
|-----|----------|----------|-----------|--------|
| `@banza/sdk` | TypeScript/Node.js | `sdk/typescript/` | Not on npm | Built, dist/ exists, `"license": "UNLICENSED"` |
| `banza_flutter` | Flutter/Dart | `sdk/flutter/` | Not on pub.dev | Implemented, git-path install only |
| `banza/sdk-php` | PHP | `sdk/php/` | Not on Packagist | Implemented |
| `banza-go` | Go | `sdk/go/` | Not on pkg.go.dev | Early form |
| `banza-python` | Python | `sdk/python/` | Not on PyPI | Early form |
| `@banza/checkout-web` | Browser JS | `sdk/checkout-web/` | Not published | Implemented |

---

## Phase 1 — Critical Path SDKs (Required before builder launch)

### 1.1 `@banza/sdk` — npm publication

**Why first:** TypeScript is the primary builder language. Next.js, Node.js, and backend TypeScript are the most common integration environments for Tier 4 (digital business) merchants and all hackathon builders.

#### Pre-publication checklist

```json
// sdk/typescript/package.json — required changes before npm publish

{
  "name": "@banza/sdk",
  "version": "0.1.0",
  "license": "MIT",                              // ← change from "UNLICENSED"
  "description": "Official TypeScript/JavaScript SDK for BANZA payments — Angola's instant payment protocol",
  "repository": {
    "type": "git",
    "url": "https://github.com/banza-protocol/banzami.git",
    "directory": "sdk/typescript"
  },
  "homepage": "https://banzami.org/docs/developer",
  "keywords": ["banza", "payments", "angola", "kwanza", "qr", "fintech", "wallet"],
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  }
}
```

**Required changes:**
1. Change `"license": "UNLICENSED"` → `"license": "MIT"` — an unlicensed package cannot be used
2. Add `publishConfig.access: "public"` — required for scoped packages on npm
3. Add `"repository"`, `"homepage"`, `"keywords"` — npm search discoverability

**Required additions before publish:**
1. `README.md` on npm must start with the builder hook, not the architecture (the current README is thorough but not an npm landing page)
2. Add `"sideEffects": false` to enable tree-shaking

#### Publication command

```bash
cd sdk/typescript
npm run build
npm publish --access public
```

**Post-publish verification:**
```bash
npm install @banza/sdk        # must succeed
node -e "const { BanzaClient } = require('@banza/sdk'); console.log('ok')"
```

#### Missing SDK method for quickstart

The quickstart spec requires `banza.sandbox.simulateQrPayment()`. This method must be added to the SDK before publication:

```typescript
// src/sandbox.ts — new file

export interface SimulateQrPaymentParams {
  qrId:             string;
  consumerWalletId: string;
}

export interface SimulatedPaymentResult {
  status:        'COMPLETED' | 'FAILED';
  transactionId: string;
  amount_minor:  number;
  trace_id:      string;
}
```

The `BanzaClient` exposes a `sandbox` sub-client active only when `environment === 'sandbox'`:

```typescript
// In BanzaClient constructor, when environment === 'sandbox':
this.sandbox = new SandboxClient(this.httpClient);
```

This sandbox-only pattern is explicitly safe — calling `banza.sandbox.*` in production throws `SandboxOnlyError: This method is not available in the live environment`.

---

### 1.2 `banza_flutter` — pub.dev publication

**Why second:** Flutter is the primary mobile SDK. Banzami Business (merchant app) and the consumer wallet are Flutter applications. External builders building merchant apps or consumer wallet clones will use this SDK.

#### pub.dev publication checklist

The Flutter SDK currently installs via git path:
```yaml
dependencies:
  banzami_sdk:
    path: ../  # local path during development
```

This is not usable by external builders. Required changes:

**`sdk/flutter/pubspec.yaml` — required:**

```yaml
name: banza_flutter
description: Official Flutter SDK for BANZA payments — Angola's instant payment protocol
version: 0.1.0
homepage: https://banzami.org/docs/developer

environment:
  sdk: '>=3.3.0 <4.0.0'
  flutter: '>=3.19.0'

repository: https://github.com/banza-protocol/banzami
issue_tracker: https://github.com/banza-protocol/banzami/issues
```

**Publication command:**
```bash
cd sdk/flutter
flutter pub publish --dry-run  # verify no issues
flutter pub publish
```

**Post-publish verification:**
```yaml
# Any Flutter project pubspec.yaml
dependencies:
  banza_flutter: ^0.1.0
```

```bash
flutter pub get   # must resolve
```

---

## Phase 2 — Secondary SDKs (Required for PHP/Laravel ecosystem)

### 2.1 `banza/sdk-php` — Packagist

**Why:** PHP powers the majority of Angolan business websites (WordPress, WooCommerce, Laravel). A PHP SDK is required for the ecommerce plugin strategy.

#### Packagist publication checklist

**`sdk/php/composer.json` — must exist and be correct:**

```json
{
  "name": "banza/sdk-php",
  "description": "Official PHP SDK for BANZA payments",
  "type": "library",
  "license": "MIT",
  "minimum-stability": "stable",
  "require": {
    "php": ">=8.1",
    "ext-json": "*"
  },
  "autoload": {
    "psr-4": {
      "Banza\\": "src/"
    }
  },
  "homepage": "https://banzami.org/docs/developer",
  "keywords": ["banza", "payments", "angola", "kwanza"]
}
```

**Publication:** Submit `github.com/banza-protocol/banzami` to packagist.org under the `banza` namespace. Packagist auto-syncs from GitHub tags.

---

### 2.2 `banza-go` — Go modules

Go modules are served directly from GitHub — no registry submission required. The package becomes importable as:

```go
import "github.com/banza-protocol/banzami/sdk/go"
```

**Requirements:**
- Module path must be `github.com/banza-protocol/banzami/sdk/go`
- `go.mod` must declare this path
- A `v1.0.0` git tag makes it a stable module

---

### 2.3 `banza-python` — PyPI

```bash
cd sdk/python
python -m build
twine upload dist/*
```

**`pyproject.toml` — required name:** `banza-python`

---

## SDK Feature Parity Matrix

All SDKs that are published must implement the Level 1 feature set before any Phase 2 SDK is published. A PHP SDK that is missing core features is worse than no PHP SDK — it creates confusion.

| Feature | TypeScript | Flutter | PHP | Go | Python |
|---------|-----------|---------|-----|-----|--------|
| `getWalletBalance` | ✓ | ✓ | ? | ? | ? |
| `createDynamicQr` | ✓ | ✓ | ? | ? | ? |
| `createStaticQr` | ✓ | ✓ | ? | ? | ? |
| `sendTransfer` | ✓ | ✓ | ? | ? | ? |
| `createPaymentLink` | ✓ | ✓ | ? | ? | ? |
| `getPublicPaymentLink` | ✓ | ✓ | ? | ? | ? |
| `listTransactions` | ✓ | ✓ | ? | ? | ? |
| `webhooks.constructEvent` | ✓ | — | ? | ? | ? |
| `sandbox.simulateQrPayment` | Needed | Needed | — | — | — |
| `formatMinor` | ✓ | ✓ | ? | ? | ? |
| Environment isolation | ✓ | ✓ | ? | ? | ? |
| Auto-retry with backoff | ✓ | ? | ? | ? | ? |
| Observability hooks | ✓ | — | — | — | — |

**Minimum for publication:**
- Core payment methods (first 8 rows)
- Environment isolation
- `formatMinor` / equivalent locale-aware formatter
- Webhook verification for server-side SDKs

---

## SDK Documentation Requirements

Every published SDK must have:

| Document | Location | Content |
|----------|----------|---------|
| **README** (npm/pub.dev landing page) | `sdk/<lang>/README.md` | Builder hook (1 sentence), install command, 15-line example showing complete QR payment, link to quickstart |
| **CHANGELOG** | `sdk/<lang>/CHANGELOG.md` | Semver, date, changes per version |
| **Error reference** | README or inline | Every error class, what triggers it, how to handle it |
| **Webhook guide** | README section | Signature verification code, replay protection, event types |

**README length cap for npm/pub.dev:** 500 words + code blocks. The full reference is on banzami.org.

---

## Versioning Policy

| Phase | Version range | Stability promise |
|-------|--------------|------------------|
| Builder preview (now) | `0.1.x` | Breaking changes possible with notice |
| First 100 builders | `0.x.x` | Minor breaking changes with migration guide |
| First external operator certified | `1.0.0` | Semver strict. Deprecation with 90-day notice before removal |

**`0.1.0` means:** We are gathering feedback. The API surface can change. Builders who use it in production accept this.

**`1.0.0` means:** Stable contract. BANZA protocol-level SDK.

The SDK version and the BANZA protocol version are independent. SDK `1.0.0` implements BANZA protocol `1.x`.

---

## GitHub Repository Structure

All SDKs live in `banzami/sdk/<lang>/`. Each directory is independently buildable and publishable.

The GitHub release process for each SDK:

```bash
# TypeScript example
git tag sdk/typescript/v0.1.0
git push origin sdk/typescript/v0.1.0
# CI pipeline triggers npm publish
```

A GitHub Actions workflow per SDK handles:
1. `npm run build` (TypeScript) or equivalent
2. Run tests
3. Publish to registry if tag matches `sdk/<lang>/v*`

---

## Discovery Channels

After publication, builders discover the SDK via:

1. **npm/pub.dev search** — keywords "angola payments", "kwanza", "banza", "banzami"
2. **GitHub trending** — if the repo has activity and stars
3. **README on github.com/banza-protocol/banzami** — the main repo README must have `npm install @banza/sdk` visible above the fold
4. **BanzAI** — `POST /ask "how do I accept payments in TypeScript?"` returns `npm install @banza/sdk` as the first line of the answer

---

## Pre-Launch SDK Checklist

Before announcing to the first 100 builders:

- [ ] `@banza/sdk` published on npm, `npm install @banza/sdk` works
- [ ] `@banza/sdk` version `0.1.0` or higher
- [ ] License changed to MIT
- [ ] `banza.sandbox.simulateQrPayment` method exists and works
- [ ] TypeScript SDK README starts with builder hook and install command
- [ ] `banza_flutter` published on pub.dev, `flutter pub add banza_flutter` works
- [ ] Flutter SDK pubspec.yaml has correct name, version, and repository
- [ ] Both SDKs pass their own test suites at time of publish
- [ ] `@banza/sdk` CHANGELOG exists with `0.1.0` entry
- [ ] SDK README links to quickstart at banzami.org/docs/quickstart

---

*Part of BANZA-FIRST-100-BUILDERS-001 — 2026-05-30*  
*Related: [15_MINUTE_QUICKSTART_SPEC.md](15_MINUTE_QUICKSTART_SPEC.md) · [SANDBOX_REQUIREMENTS.md](SANDBOX_REQUIREMENTS.md) · [FIRST_100_BUILDERS_ROADMAP.md](FIRST_100_BUILDERS_ROADMAP.md)*
