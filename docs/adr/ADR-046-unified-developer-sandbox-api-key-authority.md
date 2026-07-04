# ADR-046 — Unified Developer Sandbox API-Key Authority

- **Status:** Accepted (operator ADR — Banzami implementation detail; NOT BANZA protocol)
- **Date:** 2026-07-04
- **Programme:** BANZAMI-SANDBOX-RELEASE-ASSURANCE-001 / Release Train 02
- **Layer:** Banzami operator. This defines operator behaviour only. It is not a
  BANZA protocol contract and must never be presented as BANZA-normative.

## Context

Release Train 01 confirmed an architectural defect in the external developer
integration path: the Developer Console issues Sandbox API keys
(`developer.dev_api_keys`, `bz_test_sk_`/`bz_test_pk_`, HMAC-SHA256 under
`API_KEY_PEPPER`, workspace/project/scope-bound), but the deployed public
Gateway authenticated a *separate* merchant-key mechanism
(`StubMerchantService`, in-memory). A Console-created key therefore could not be
used by a developer to call the public Sandbox API. Two key notions existed with
no single authority.

## Decision

### Canonical authority

The **Developer Console key authority** (`developer-api`, table
`developer.dev_api_keys`) is the **single source of truth** for externally
issued Sandbox API keys. The Gateway does **not** store or copy keys; it
**delegates** verification to `developer-api` via an internal introspection
endpoint. There is exactly one issuance path for external developer keys (the
Console) and one verification authority (`developer-api`).

```
Developer Console → Workspace → Project → Sandbox API key (bz_test_sk_/pk_)
  → developer-api key authority (dev_api_keys, HMAC, scopes)
  → Gateway delegates verification (POST /internal/v1/keys/authorize)
  → resolved context {environment, workspace, project, scopes}
  → Gateway authorization on public Sandbox routes (scope + env enforced)
  → official TypeScript SDK
```

### Key → context mapping

A verified key resolves to: `environment` (SANDBOX only in Slice 1),
`workspace_id`, `project_id`, and `scopes[]`. There is **no merchant/tenant
binding** for the released consumption surface — the resolved identity is
workspace+project. A Project→Merchant binding for merchant-scoped payment routes
is deferred to the release train that releases those routes (they are all
`pending-e2e` today and MUST NOT be authorised by a developer key until then).

### Released consumption surface (Slice 1)

`GET /v1/me` on the Gateway, authenticated by a Console key, returns the resolved
`{environment, workspace_id, project_id, scopes}` and nothing else (no financial
state). This is the minimal released capability that proves the end-to-end path.
Scope required: `identity:read` (implicitly granted to every issued key).

### Scopes / least privilege

Keys carry explicit scopes. Only scopes for **released** capabilities may be
enforced by a public route. Scopes for pending capabilities
(`payments:*`, `refunds:*`, `payouts:*`, `webhooks:*`, `transfers:*`) may be
*recorded* on a key but MUST NOT authorise any public route until that
capability is released and its route wired. `GET /v1/me` requires only identity
resolution.

### Storage / secrets

- Raw secret: one-time reveal at create/rotate only.
- Storage: `HMAC-SHA256(raw, API_KEY_PEPPER)` — non-reversible.
- The Gateway forwards the raw key to `developer-api` over the internal Docker
  network only (guarded by `DEVELOPER_INTERNAL_KEY`), never logs/echoes it, and
  returns neutral errors. `developer-api` hashes and looks up; the raw key is
  never persisted or logged.

### Revocation / rotation

Revoked and rotated-away keys are rejected by `AuthorizeKey`
(`status != ACTIVE`) — the same authority the Gateway delegates to, so
revocation/rotation is effective at the Gateway **immediately** (no cache;
bounded only by the single introspection round-trip).

### Environment isolation

`developer-api` issues SANDBOX (`bz_test_`) keys only and `AuthorizeKey` rejects
`bz_live_*` outright. The Gateway dev-key path additionally enforces
`environment == SANDBOX` and is only mounted on the sandbox stack
(`ENVIRONMENT=SANDBOX`). A `bz_live_*` key fails closed before any business
logic. No dev-key path exists in a Live-mode gateway.

### Rate-limit identity

Requests authenticated by a developer key are rate-limited on the **key id**
(non-secret), not the raw key.

### Separation of credential types (must never be interchangeable)

| Credential | Authority | Purpose |
|---|---|---|
| External developer key (`bz_test_sk_/pk_`) | developer-api `dev_api_keys` | external Sandbox API integration |
| Merchant/operator key (`bz_test_` plain) | gateway merchant service (legacy) | existing merchant/operator identity (e.g. DOA) — see legacy disposition |
| Internal service credential (`X-Internal-Key`, `CORE_INTERNAL_KEY`, `DEVELOPER_INTERNAL_KEY`) | per-service config | service-to-service only; never issued to developers |
| Webhook signing secret (`banza-signature`) | per-endpoint HMAC | verify webhook authenticity; never an API credential |
| Consumer session/JWT | public-api / developer session | consumer-user auth; never an API key |

A developer key MUST NOT authenticate an internal route, be usable as a webhook
secret, or substitute for a consumer JWT. Distinct code paths enforce this.

## Legacy merchant-key disposition

The merchant-key mechanism is **retained as a narrowly-scoped internal
compatibility identity** for existing consumers (DOA authenticates the deployed
sandbox gateway with a `bz_test_` key today; removing it would break a live
sandbox consumer). It is **not** the external-developer path and gets **no new
public issuance marketing**. Rules:

- The canonical, documented external-developer issuance path is the Console.
- Merchant self-service key issuance (`POST /v1/merchant/{id}/api-keys`) remains
  for operator/merchant account management only, classified as merchant
  identity, not external-developer integration.
- A CI guard (`tools/check-sdk-contract.mjs` + docs-claims) ensures public docs
  and the SDK direct external developers to the Console key path only.
- Removal/migration of the merchant self-service issuance into the canonical
  authority is a tracked follow-up (owner: developer-platform), not completed in
  this train because DOA is an active consumer.

## Consequences

- One authority, no duplicate key truth. The Gateway holds no key material.
- A Console key now works against the public Sandbox API (`GET /v1/me`).
- The dev-key path is additive and feature-flagged (`DEVELOPER_API_URL` unset →
  path disabled), so existing merchant/JWT flows are unaffected.
- Merchant-scoped payment routes remain unreachable by developer keys until they
  are released with a defined Project→Merchant binding.

## Alternatives considered

- *Gateway stores/verifies dev keys directly*: rejected — duplicates key truth.
- *Migrate merchant keys into dev authority now*: rejected for this train —
  DOA is an active consumer; unsafe to migrate without a separate train.
- *Add a third key system*: explicitly rejected.
