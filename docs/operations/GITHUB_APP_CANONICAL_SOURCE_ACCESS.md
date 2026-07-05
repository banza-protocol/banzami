# GitHub App — Canonical Source Read-Only Access (plan)

**Status:** prepared, reviewed — **not created/installed**. Planning only. **Version:** 1.0

The Sandbox server needs to `clone`/`fetch` the **private** canonical operator
repository `banza-protocol/banzami`. The organization **disables deploy keys**, and
personal SSH keys / personal access tokens are **not** permitted. The sanctioned
mechanism is a **least-privilege, organization-owned GitHub App** installed on that
one repository, granting **Contents: Read-only** — used to mint **short-lived
installation tokens** for HTTPS Git source access. This document is the design,
trust boundary, manual operator steps, and the templates/checker that enforce it.

Nothing here creates an App, key, token, remote, or clone. See:
- `infra/deployment/github-app-token-helper.sh` — root-owned token-helper **template**.
- `infra/deployment/github-app-source-clone.sh` — clone/fetch **wrapper template**.
- `tools/check-github-app-source-access.mjs` — static gate (`make check-github-app-source-access`).

---

## 1. GitHub App permission matrix

| Setting | Value |
|---|---|
| App name | `Banzami Sandbox Source Readonly` |
| App owner | `banza-protocol` (organization-owned) |
| Installation scope | **Only selected repositories** |
| Selected repository | **`banza-protocol/banzami`** (exactly one) |
| Webhook | **None** (unchecked) |
| User OAuth flow | **None** |
| Callback URL | **None** (if App creation forces a field, use a harmless placeholder — see §4) |

**Repository permissions — the ONLY two granted:**

<!-- app-permissions:begin
{"Contents":"read","Metadata":"read"}
app-permissions:end -->

| Permission | Access |
|---|---|
| Contents | **Read-only** |
| Metadata | **Read-only** (mandatory, auto-selected) |

**Explicitly NOT granted (no access):** Actions, Workflows, Administration, Checks,
Commit statuses, Deployments, Environments, Issues, Pull requests, Secrets,
Variables, Webhooks, Packages, Pages, Custom properties, Dependabot/secret-scanning
alerts, Organization members, Organization administration, and **any write
capability whatsoever**. No account/organization permissions are requested.

This grants **read + clone of one repo** and nothing else — no write, no admin, no
org-wide reach.

---

## 2. Server-side credential trust boundary

```
GitHub App private key (.pem)
  → stored ONLY in the approved root-owned server secret mechanism
    (e.g. /root/banzami-secrets/github-app/private-key.pem, root:root 0600)
  → NEVER in the repo, /srv/banzami/.env, Docker Compose, containers, SDK,
    frontend, DOA/BanzAI, shell history, logs or command arguments

GitHub App JWT (RS256, ≤10 min)
  → generated transiently by the root-owned token helper
  → the private key is read by openssl from its file; the JWT is passed to the
    GitHub API via curl's stdin config (--config -), NEVER as an argv/URL/log

Installation access token (≤1 h, auto-expiring)
  → minted transiently per clone/fetch
  → supplied to git ONLY via GIT_ASKPASS (username x-access-token)
  → NEVER written to .git/config, a remote URL, argv, env files, Compose,
    containers, runtime apps, logs or shell history
  → cleared from the process on exit; the wrapper verifies no token persisted
```

**Credential separation.** This source-access credential (App key + minted tokens)
is **distinct** from, and must never be reused as: migration credentials, Core
credentials (`CORE_INTERNAL_KEY`, `CORE_PAYEE_VALIDATION_KEY`), Developer API
credentials, Gateway credentials, runtime application secrets, browser/frontend
configuration, SDK configuration, or DOA/BanzAI credentials. It authorizes only
read/clone of the canonical source repository.

---

## 3. Manual operator setup steps (performed by the operator, in GitHub + on the server)

1. **Create an organization-owned GitHub App** under `banza-protocol`, named
   `Banzami Sandbox Source Readonly`. No webhook; no callback URL (or a harmless
   placeholder per §4); no user OAuth.
2. **Repository permissions:** set **Contents = Read-only** (Metadata Read-only is
   auto-included). Grant nothing else.
3. **Restrict installation** to **only** `banza-protocol/banzami`.
4. **Generate one private key** (`.pem`) for the App.
5. **Store the private key only** in the approved root-owned server secret mechanism
   (`root:root`, `0600`), outside the repository and outside any app runtime env.
   Record the non-secret **App ID** and **Installation ID** in root-owned config
   (these two ids are not secrets).
6. **Install the App** on the canonical repository only.
7. **Use the wrapper** (`github-app-source-clone.sh`) — which calls the token helper
   — to create **short-lived installation tokens** for HTTPS clone/fetch of
   `banza-protocol/banzami` into `/srv/banzami/canonical-src`. Never deploy from a
   token-bearing URL; the remote stays a tokenless HTTPS URL.

The agent does none of the above; it only prepared this plan + templates + checker.

---

## 4. Callback-URL placeholder policy

A callback URL is **not required** (no user OAuth). If the App-creation form forces
a value, use a **non-sensitive, non-functional placeholder** on the canonical
public site domain (e.g. `https://banza.network/unused-github-app-callback`) — never
an internal host, private URL, tunnel, or anything secret-bearing. It is never
exercised because no OAuth flow is used.

---

## 5. Enforcement

`make check-github-app-source-access` statically rejects: personal access tokens;
deploy-key use; SSH aliases pointing at the stale `banzami/banzami` redirect; App
token persistence in Git remotes; App credentials in Docker Compose / runtime
services; and any **write** permission in the documented App permission set.

This plan does not itself grant access — it is ready for operator approval and
manual execution of §3.
