# TypeScript SDK — Registry Ownership & Release

Programme: BANZAMI-SANDBOX-RELEASE-ASSURANCE-001 / Release Train 02.1
Status: **CAP-SDK-001 is `blocked-external`** — the SDK is code-ready and
install-verified; the ONE remaining blocker is registry ownership/access, which
only the Banzami owner can provision. This document is the exact owner action
package. **Do not publish under an unofficial or misleading package name.**

> No npm token is stored in this repo, `.env`, evidence, logs, or Git history.
> CI must use a short-lived/granular credential or trusted publishing — never a
> personal long-lived credential.

## Official package identity

- **Public external package:** `@banzami/sdk` — the ONLY official name. The
  external Sandbox surface is the subpath export `@banzami/sdk/sandbox`.
- **Optional internal/private package:** if a broader internal surface is ever
  needed, publish it privately (e.g. `@banzami/sdk-internal`, `private: true`),
  never as the public `@banzami/sdk`.
- **Vendored distributions** (e.g. DOA's `vendor/banzami-sdk`) are copies for a
  specific consumer and are NOT a registry distribution; they do not satisfy
  "installable by external developers".

## npm organization ownership model

1. **Create/confirm the `@banzami` org on npm** owned by a Banzami-controlled
   account (not a personal individual account). Verify at
   `https://www.npmjs.com/org/banzami`.
2. **Roles:**
   - *Owners* (2 humans minimum): manage members, billing, org settings. Human
     maintainers only.
   - *Publisher* (CI identity): a member with publish rights to `@banzami/sdk`
     only — least privilege, not an org owner.
3. **Publishing credential — choose ONE:**
   - **Trusted publishing (preferred):** configure npm trusted publishing (OIDC)
     for the GitHub repo + release workflow, so no long-lived token exists.
   - **Granular access token:** a token scoped to *publish* for `@banzami/sdk`
     only, with an expiry, stored solely as a GitHub Actions secret
     (`NPM_TOKEN`) — never in the repo.
4. **2FA:** require 2FA for all org owners and for publish (`auth-and-writes`).
5. **Provenance/integrity:** publish with `--provenance` (npm provenance via
   GitHub OIDC) so consumers can verify the build origin.

## Policies

- **Versioning/tagging:** semver; a release is cut from a signed Git tag
  `sdk-v<semver>` on protected `main`. The tag revision is recorded in evidence.
- **Deprecation:** deprecate a version with `npm deprecate @banzami/sdk@<range>
  "<reason>"`; never silently remove.
- **Emergency unpublish/deprecate:** prefer `npm deprecate`; `npm unpublish` only
  within npm's 72h window and only for a secret-leak/critical incident, followed
  by a patched republish. Record the incident.
- **Ownership transfer/recovery:** keep ≥2 org owners; document the npm account
  recovery contacts; store recovery in the Banzami secrets vault (not here).

## Exact steps the Banzami owner performs (in npm)

1. Log in to npm with a Banzami-controlled account; enable 2FA.
2. Create the `banzami` org (or confirm ownership); add a second owner.
3. Reserve/confirm the `@banzami/sdk` package name (publish an initial `0.0.0`
   placeholder from a laptop ONLY if needed to claim the name, then let CI take
   over — or skip and let the first CI release create it).
4. Configure **trusted publishing** for `github.com/banza-protocol/banzami`
   (repo) + the release workflow `.github/workflows/sdk-publish.yml`
   (environment `sdk-release`). If trusted publishing is unavailable, create a
   **granular publish token** for `@banzami/sdk` and add it as the GitHub Actions
   secret `NPM_TOKEN` on the `sdk-release` environment.
5. Protect the `sdk-release` GitHub environment with required reviewers.

## Least-privilege the release workflow needs

- GitHub: `contents: read`, `id-token: write` (for npm provenance/OIDC).
- npm: publish rights to `@banzami/sdk` ONLY (via trusted publishing or a
  granular token) — no org-admin, no other packages.

## Verification after access is granted

1. Cut tag `sdk-v<semver>` on `main`; run `.github/workflows/sdk-publish.yml`.
2. The workflow runs the contract gate, tarball inspection, and a deployed-
   Sandbox `me()` E2E BEFORE publishing; publishes with provenance; then does a
   FRESH external install from npm and re-runs the `me()` E2E.
3. Confirm `npm view @banzami/sdk` shows the version + provenance.
4. Confirm `npm install @banzami/sdk` in a clean project, then
   `import { BanzamiClient } from '@banzami/sdk/sandbox'` → `.me()` resolves
   against the deployed Sandbox with a fresh Console key.
5. Register the sanitised evidence in the manifest and flip `CAP-SDK-001` to
   `released` (only then).

Until steps 1–5 complete, `CAP-SDK-001` stays `blocked-external` and Docs must
not present external `npm install` as available.
