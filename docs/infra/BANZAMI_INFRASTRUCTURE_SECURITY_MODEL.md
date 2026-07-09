# Banzami — Infrastructure Security Model (Sandbox)

Version: 1.0

> **Scope note.** Describes the security model of the internal **Sandbox** used for
> Phase 0 and proposed for the Phase 1 pilot. Sanitised: no IPs, hostnames, SSH users,
> paths, database URLs, tokens or secrets. Synthetic data only — no LIVE, no Production,
> no public availability, no real payments, no real customer data. Phase 0 status:
> **PASS 29 · FAIL 0 · SIMULATED 6 · DEFERRED 0 · BLOCKED 0**. This is not a claim of BNA
> approval/admission, production readiness or external-provider activation.

## 1. Trust boundaries

- The Sandbox runs on internal-only Docker networks with **no published host ports**.
- Only an administrative SSH channel reaches the host; nothing is exposed publicly.
- Trust decreases outward: the financial core (ledger authority) is most trusted; the API
  gateway mediates; the developer service holds platform-key identity; platforms/
  integrators are least trusted and **hold no funds, compute no balances, issue no
  receipts**.

## 2. Service-to-service communication

- Services communicate over the internal networks by in-cluster name/alias.
- Privileged internal routes are guarded by shared, file-only service keys sent as request
  headers and validated fail-closed (unset key ⇒ the route is disabled, never open).
- The gateway reaches the developer service only via its canonical in-cluster alias
  (host allow-list; SSRF-guarded).

## 3. Database roles

- **Schema owner** — non-login, owns migrated objects.
- **Application runtime** — login, least privilege: DML only (SELECT/INSERT/UPDATE/DELETE)
  + USAGE, **no** DDL/ownership/superuser, scoped to the intended schemas.
- **Migration login** — short-lived, time-bounded, connection-limited; created/refreshed
  only for a migration and used only by the gated adapter.
- No service operates as superuser.

## 4. Developer schema permissions

- The `developer.*` schema (workspaces, projects, API keys, bindings, audit) is owned by
  the schema owner; the runtime role holds **least-privilege DML only**, granted explicitly
  per-schema (no blanket cross-schema grant). Verified post-migration (USAGE + INSERT +
  SELECT present; no DDL/ownership).

## 5. API key handling

- Platform API keys are prefixed, environment-scoped (Sandbox), and stored only as a
  salted hash (peppered) — never in plaintext. A raw secret is shown once at creation.
- Keys carry minimal scopes; an active key authenticates, an invalid/revoked key is
  rejected (neutral 401), and a wrong-scope request is rejected (403) — all at the auth
  layer, with **no balance/ledger mutation** on rejection. A platform never supplies the
  payee (derived from the project binding).

## 6. JWT / internal-key handling

- Merchant/consumer JWTs are signed with the Sandbox signing secret (file-only,
  in-process). Service-to-service internal keys (gateway↔core, core↔developer) are
  file-only, in-process, matched only where a pair requires it, and **never** present in
  Docker-inspectable environment/config or logs.

## 7. Webhook signing model

- Events carry an event id and are signed HMAC-SHA256 with a per-endpoint secret; the
  signature header includes a timestamp for replay protection. Receivers verify the
  signature and deduplicate by event id. Delivery uses exponential backoff with a bounded
  attempt count and a terminal failed state.
- **Limitation:** a live 2xx outbound delivery requires a public HTTPS sink (SSRF-enforced);
  in the Sandbox this is **not** exercised — emission + signing + the retry/idempotency
  contract are verified internally, and outbound delivery is recorded as a limited
  simulation.

## 8. Logging minimisation

- Operational logs are minimised and must not contain secrets, credentials, tokens or
  unnecessary personal data. Request logs record method/path/status, not credential values.

## 9. Evidence sanitisation

- All retained evidence passes a sanitiser that fails closed on any secret, token, id,
  hostname, IP, path or raw output. Evidence uses only the approved status tokens.

## 10. Emergency suspension

- Participants can be suspended and platform keys revoked (fail-closed). Affected services
  can be stopped to halt new operations while preserving the database and evidence. Data is
  never wiped as a suspension measure; material incidents are reported to the BNA (Annex F).

## 10a. Deploy model (source-bundle, Git-on-Mac-only)

- **Git stays only on the Mac/operator machine.** The Sandbox server receives **source
  bundles only** — no `.git`, no repository history, no GitHub credentials and no deploy
  keys ever reside on the server.
- `./deploy.sh <service>` creates a source bundle from the exact commit (`git archive`,
  no secrets), transfers only the bundle + manifest + SHA256 checksum, and the **amd64
  server builds the selected service natively** (BuildKit cache) and redeploys only that
  service. The checksum is verified before unpacking; a versioned release directory is
  kept for rollback.
- Selected-service deploy is the default; `--all` must be explicit. Local Mac
  `linux/amd64` QEMU image builds are **removed / unsupported** (no fallback flag, no local
  image build/export/transfer/load path); any such request is refused, and all Sandbox
  builds run natively on the amd64 server from a verified source bundle. Deploy runs **no
  migration**, **no VM reset** and **no destructive prune**, and changes no
  DNS/certificate/SMTP. Secrets stay
  file-only/in-process and never appear in the Docker-inspectable environment. Rollback
  uses the previous validated release/image. No ad-hoc SQL for state changes.

## 11. Future production hardening still required

Before any production/LIVE use (subject to BNA approval/non-objection):

- External settlement rails and the acquiring/EMIS callback path (currently out of scope).
- Live webhook outbound delivery against real receiver endpoints.
- Live restart/recovery and incident-classification drills (currently tabletop).
- Production-grade secret management (e.g. managed secret store, rotation), key management
  and certificate/transport hardening.
- Production observability, alerting and reconciliation against external statements.
- The safeguarding structure and approvals required for real customer funds.

None of the above is claimed as complete; the Sandbox is preparatory internal evidence
only.
