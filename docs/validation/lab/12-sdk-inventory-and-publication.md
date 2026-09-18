# 12 — SDK inventory, validation and publication plan

Version: 1.0

---

## 1. Inventory (audited, not assumed)

| SDK | Package | Version | Source size | Tests | Release tooling | Registry status |
|---|---|---|---:|---|---|---|
| TypeScript | `@banzami/sdk` | 0.14.1 | 26 files / 4 834 L | 18 | `tools/sdk-release.mjs` + `sdk-publish.yml` | **published (npm)** |
| Dart client | `banzami_client` | 0.1.0 | 11 files / 1 087 L | yes | none | publishable; **publication unverified** |
| Flutter | `banzami_flutter` | 0.1.0 | 93 files / 19 655 L | yes | n/a | `publish_to: none` (ADR-053) — correct |
| Go | `banzami-go` | — | 7 files / 1 192 L | CI job | none | unpublished |
| PHP | `banzami/sdk-php` | — | 11 files / 890 L | CI job | none | unpublished |
| Python | `banzami-python` | 0.1.0 | 59 files | CI job | none | unpublished |
| Checkout web | `@banzami/checkout` | 0.1.0 | 6 files / 460 L | — | none | `UNLICENSED`, unpublished |

Findings:

- **`sdk/README.md` documents only `flutter/` and `typescript/`.** Five SDKs are
  missing from their own index (VL-010).
- **Only TypeScript has a release path.** CLAUDE.md §13 names TypeScript, PHP,
  Python, Go as mandatory server SDKs for v1 and Flutter + browser JS as client
  SDKs. Four of six mandatory SDKs have no release mechanism (VL-012).
- `LICENSE` enumerates `sdk/typescript` and `sdk/dart-client` as the separately
  licensed published packages (both MIT). Go, PHP and Python carry MIT in their
  own manifests but are **not** in that enumeration — a licensing inconsistency
  that must be resolved before they are published (VL-013).

## 2. External-consumer acceptance (§43)

Source-unit tests are not acceptance. For every SDK the operator *publishes*:

```
1. create a clean project outside the repository (temp dir, empty manifest)
2. install the PUBLISHED artifact from the real registry — never a local path,
   never a tarball, never a workspace link
3. configure Sandbox credentials from the secret backend
4. execute every supported operation against the deployed Sandbox
5. assert returned types and the structured error hierarchy
6. execute every example in the package README
7. capture: install log, runtime output, versions resolved → evidence
```

`tools/sdk-public-install-proof.mjs` and `tests/phase0/sdk-types-cleanroom.sh`
already do this for TypeScript and are the template. The Lab generalises them;
it does not rewrite them.

**Registry-lag detection.** Every run compares the published `latest` against
the repository source. A source ahead of the registry means integrators cannot
get the fix; a registry ahead of source means the repository no longer
describes what people install. Both are findings, not commentary.

## 3. Autonomous publication — the honest position

### What exists

`.github/workflows/sdk-publish.yml` is already a **guarded, non-automatic**
publication workflow:

- triggers only on an `sdk-v*` tag or an explicit `workflow_dispatch`;
- runs in the protected `sdk-release` **environment** (required reviewers);
- `permissions: id-token: write` — **OIDC is already requested**;
- `tools/sdk-release.mjs` fail-closes on: dirty tree, contract gate, tarball
  content inspection (no secrets, hosts, `.env`, source maps, internal routes),
  export-surface match, and a clean-install E2E against the deployed Sandbox;
- it publishes **only** with `--publish` *and* registry auth *and* provenance.

Its own header states the blocker plainly:

> *Until the Banzami owner provisions @banzami org publish access (trusted
> publishing or a granular NPM_TOKEN on the sdk-release environment), the
> publish step fails closed and CAP-SDK-001 stays blocked-external.*

### What actually happens today

Publication is performed **by the owner, from the owner's Mac**, because:

1. `npm publish --otp=<code>` is rejected by npm for this account
   (`auth-and-writes` 2FA) — TOTP and recovery codes both fail;
2. what works is npm's **browser auth flow**, which needs a real terminal;
3. `--provenance` is requested only under CI OIDC, so an owner-run release
   carries no attestation, and the release script says so rather than implying
   one.

### The recommendation

**Do not weaken npm account security.** Do not place a long-lived write token
anywhere. The correct mechanism already exists and is the one npm built for
exactly this case:

> **npm Trusted Publishing (OIDC).** Configure `@banzami/sdk` on npmjs.com to
> trust the `banza-protocol/banzami` repository's `sdk-publish.yml` workflow.
> The workflow then publishes with a short-lived OIDC token — **no stored
> secret, no 2FA prompt, and provenance attestation included**, which the
> owner-run path cannot produce.

Owner ceremony, once:

```
npmjs.com → @banzami/sdk → Settings → Trusted Publisher
    repository: banza-protocol/banzami
    workflow:   .github/workflows/sdk-publish.yml
    environment: sdk-release
(optionally relax `sdk-release` required reviewers, or keep them —
 with reviewers, publication is owner-approved but not owner-executed)
```

After that, a Repair Run that must ship an SDK fix does:

```
fix source → SDK tests → contract gate → version per CHANGELOG policy
  → tag sdk-vX.Y.Z → workflow publishes with provenance
  → clean external install of the PUBLISHED artifact
  → rerun affected Sandbox journeys → continue
```

**Publishing is one-way.** A version cannot be republished with different
content, so after the last fix the published versions are frozen as inputs to
the Golden Run, and the repository source must match them exactly.

`CapValidationPublish` is step-up gated ([07](07-banzadmin-validation-lab.md) §8)
for the same reason.

### Other registries

| Registry | Mechanism | Owner ceremony |
|---|---|---|
| pub.dev (`banzami_client`) | GitHub Actions OIDC automated publishing | link the package to the repo + workflow |
| pkg.go.dev (`banzami-go`) | tag-based, no registry account | **none** — a tag is the release |
| Packagist (`banzami/sdk-php`) | webhook from the repository | one-time submit + webhook |
| PyPI (`banzami-python`) | Trusted Publishing (OIDC) | configure the publisher |

Go is the easiest and should be first: publishing is literally a version tag.

**No unofficial registry is created for the Lab.** Acceptance installs from the
real registry or it proves nothing.

## 4. Product ↔ SDK reconciliation

A Full Run detects and reports, as findings:

| Finding | Detection |
|---|---|
| Runtime supports a capability the SDK does not expose | manifest `api_surface` vs SDK method surface |
| SDK exposes a retired API | SDK surface vs mounted routes (`check-sdk-contract`) |
| SDK docs use a wrong route | `check-docs-*` + executable examples |
| Published version lags the source | registry `latest` vs `package.json` |
| A README example fails against Sandbox | external-consumer acceptance §2 step 6 |

`tools/check-sdk-contract.mjs`, `check-sdk-payment-boundary.mjs`,
`check-sdk-dual-package.mjs` and `check-sdk-refund-contract.mjs` already
implement most of this. The Lab runs them and binds their output to
capabilities.

## 5. Scope discipline

Publishing an SDK during a Repair Run does **not** tag a product release.
Release tagging is a separate, owner-initiated action.
