# 02 — Complete Banzami functional inventory

Version: 1.0
Basis: repository `0cdc05a2`; Sandbox runtime read 2026-09-18.

---

## 1. Deployed topology (read from the runtime, not from deploy.sh)

`docker ps` on `root@217.160.9.248`, 2026-09-18:

| Container | Image revision | Role | In deploy-parity registry |
|---|---|---|---|
| `api-gateway-staging` | `b2bfedb5` | Merchant/developer/public gateway | yes |
| `public-api-staging` | `b2bfedb5` | Consumer API | yes |
| `core-api-staging` | `82283af0` | Rust financial core | yes |
| `developer-api` | `d2098e7b` | Console / Developer Platform | yes |
| `admin-api` | `bc9080ec` | BANZADMIN API | yes |
| `admin-frontend` | `5ce51b5b` | BANZADMIN UI | yes |
| `pay-frontend` | `b2bfedb5` | `pay.banzami.com` payer surface | yes |
| `app-frontend` | `2fbdd20f` | **App Banzami Web (Flutter + BFF)** | **NO** |
| `banzami-website-frontend-1` | (latest) | `banzami.com` + Console + docs | yes |
| `banzami-webhook-sink` | `local` | **Deterministic webhook receiver** | **NO** |
| `bzsbedge-sandbox-edge` | nginx 1.27 | Public edge | n/a |
| `postgres-1`, `redis-1`, `app-session-redis` | — | Data plane | n/a |

Two findings recorded in [19](19-gap-contradiction-report.md):

- **`app-frontend` is absent from `tools/check-deploy-parity.mjs`** although it
  serves `app.banzami.com` — the surface §26/§27 designates as the *primary*
  functional E2E target. A Full Run could test a stale Consumer/Business app and
  the §88 deployment gate would not notice (VL-005).
- `sandbox-operator.banzami.com` resolves and terminates TLS but **no container
  serves it** — 503. A published host with nothing behind it (VL-009).

`make check-deploy-parity` currently reports **3 stale components**
(`developer-api`, `admin-api` on `services/common/documents/receipt.html`;
`website-frontend` on `apps/website/components/site/Footer.tsx`).

## 2. API surfaces

Routes extracted from the chi/axum routers, not probed.

| Service | Total | Externally reachable | Internal (`/internal/**`) | Ops |
|---|---:|---:|---:|---:|
| api-gateway | 168 | 129 | 36 | 3 |
| admin-api | 148 | 146 | 0 | 2 |
| developer-api | 58 | 51 | 7 | 0 |
| public-api | 43 | 35 | 6 | 2 |
| **Total (Go)** | **417** | **361** | **49** | **7** |
| core-api (Rust, axum) | ~150 | 0 | ~150 | 1 |

**361 externally reachable routes.** The assurance manifest's `api_surface`
fields currently reference 216 parsed public routes across 24 capabilities. The
delta is the registry-drift surface the Lab must close.

Authentication groups on the gateway: `DeveloperKeyAuth` (Console project keys),
`DualAuth` (ADR-047 payment surface), merchant JWT, consumer JWT, unauthenticated
public, and `/internal/**` behind `core_internal_key` / `developer_internal_key`.

### Externally reachable surface by domain

| Domain | Representative routes | Owner |
|---|---|---|
| Consumer identity/auth | `POST /v1/auth/register`, `/v1/auth/token`, `/v1/auth/logout` | public-api |
| Consumer wallet | `/v1/me`, `/v1/me/wallet`, `/v1/me/wallet/balance`, `/v1/me/activity` | public-api |
| Consumer P2P | `POST /v1/transfers`, `GET /v1/transfers`, `/v1/transfers/{id}` | public-api |
| Consumer pay links | `POST /v1/consumer-pay-links`, `/{code}/pay` | public-api |
| Consumer QR pay | `POST /v1/qr/pay` | public-api |
| Receive Point (payer) | `GET /v1/receive-points/{slug}`, `POST …/pay` | public-api |
| Consumer KYC | `/v1/kyc/cases*` (5 routes) | public-api |
| Consumer onboarding (phone) | `/v1/consumer/onboarding/{start,verify-otp,complete}` | public-api |
| Consumer realtime | `GET /v1/me/realtime` (JSON **or** SSE), `/v1/me/push-topic` | public-api |
| Consumer receipts | `/v1/consumer/transactions/{id}/receipt[.pdf]` | public-api |
| Business auth | `/v1/merchant/auth/{token,lookup,refresh,logout,claim}` | gateway |
| Business onboarding | `/v1/merchant/applications*`, `/v1/merchant/activation/*` | gateway |
| Business KYB | `/v1/merchant/kyb/*` | gateway |
| Business Receive Point | `GET /v1/business/receive-point[/qr]`, `POST …/disable` | gateway |
| Payment links | `/v1/payment-links*` (5), `/public/pay/{slug}*` (4) | gateway |
| Payment sessions | `/v1/payment-sessions*` (5) | gateway |
| **Collections** | `/v1/collections*` (9), `/v1/collection-shares/{id}/surface` | gateway |
| Refunds | `POST /v1/refunds`, `GET /v1/refunds[/{id}]` | gateway |
| Payouts | `/v1/payouts*` | gateway |
| Wallets / accounts | `/v1/wallets*`, `/v1/wallet-accounts*`, `/v1/wallet-account-transfers` | gateway |
| Application settlements | `POST /v1/application-settlements`, `GET …/{id}` | gateway |
| Webhooks (merchant) | `/v1/webhooks/**` (11) | gateway |
| QR engine | `/v1/qr/{static,dynamic,decode,{id},{id}/use}` | gateway |
| Disputes | `/v1/disputes*` (5) | gateway |
| Team | `/v1/team/{members,access-log}` | gateway |
| Sandbox test payers | `/v1/sandbox/test-payers*` (6) | gateway |
| Sandbox rail simulator | `GET/PUT /v1/sandbox/external-rail`, `/v1/sandbox/scenarios` | gateway |
| Receipt verifier | `GET /v1/public/proofs/{ref}` | gateway |
| Public profiles | `GET /public/profiles/{handle}` | gateway |
| Developer workspaces | `/workspaces*` (14) | developer-api |
| Developer projects | `/projects/{id}*` (26) | developer-api |
| Developer keys | `/projects/{id}/keys`, `/keys/{id}[/rotate]` | developer-api |
| Financial setup | `/projects/{id}/financial-setup*`, `/financial-onboarding/*` | developer-api |
| Developer webhooks | `/projects/{id}/webhooks/**` (7) | developer-api |
| Developer logs/explorer | `/projects/{id}/{logs,explorer/*,transactions,balances,footprint}` | developer-api |
| BANZADMIN | `/admin/v1/**` (146) across 14 domains | admin-api |

## 3. Product applications

| Application | Host | Source | Notes |
|---|---|---|---|
| App Banzami (Consumer) | `app.banzami.com` + iOS/Android | `apps/mobile/lib/screens` (11 screens) | one source tree, three targets |
| App Banzami Business | `app.banzami.com/business` + iOS/Android | `apps/mobile/lib/merchant/screens` (15 screens) | ADR-066 dual context |
| App BFF | `app.banzami.com` | `apps/app-banzami/{server.mjs,lib/bff.mjs}` | session-BFF; Bearer never in JS |
| Pay | `pay.banzami.com` | `apps/pay` (7 routes) | ADR-052 canonical payer surface |
| BANZADMIN | `admin.banzami.com` | `apps/admin` (27 pages, 5 nav sections) | operator portal |
| Website + Console + Docs | `banzami.com`, `developers.banzami.com` | `apps/website` (**85 pages**) | institutional + Developer Console + docs (PT/EN) |
| Validation Studio | local only | `apps/validation-studio` (32 files) | governance workstation, never deployed |

Consumer screens: splash, welcome, create-account, login, setup-pin, pin, main
(tabbed), history, receive-hub, profile, security, notifications, kyc, help.
Business screens: splash, welcome, login, pin, dashboard, charge, qr,
split-track, history, payout, profile, kyb, project-link, campaign-accounts,
main.

## 4. Financial core (Rust)

21 crates under `core/`: `ledger`, `wallets`, `consumer-wallets`, `transactions`,
`transfers`, `settlement`, `app-settlement`, `payouts`, `acquiring`,
`collections`, `payment-links`, `qr`, `pricing`, `reconciliation`, `risk`,
`compliance`, `merchants`, `identity`, `routing`, `types`, `api`.

`core/api/src/routes/` holds **47 route modules**. Core is reachable only over
`/internal/**` with `core_internal_key`; it is the single writer of financial
tables (ADR-061 per-service DB roles: only `bl_core_runtime` writes money).

## 5. Data plane

One database `banzami_staging`, three schemas:

| Schema | Tables | Contents |
|---|---:|---|
| `public` | 107 | all financial and business domain tables |
| `developer` | 9 | workspaces, projects, keys, bindings, request logs |
| `account_identity` | 4 | Console identity, sessions, OTP codes, audit |

Migration head **0159** (`collections idempotency`), matching the repository's
`db/migrations/` chain. `db/migrations.phase2/` is a separate frozen chain.

Live population, 2026-09-18:

| Entity | Count | Note |
|---|---:|---|
| merchants | 1 159 | **1 158 SUSPENDED, 1 ACTIVE** |
| consumers | 785 | synthetic handle prefixes throughout |
| dev_projects | 839 | 625 ARCHIVED, 213 DELETED, **1 ACTIVE** |
| dev_api_keys | 1 278 | |
| merchant_applications | 137 | |
| payment_links | 1 295 | |
| transfers / wallet_payments | 831 / 748 | |
| transaction_proofs | 799 | |
| ledger_entries | 8 482 | |
| identity_users | 70 | Console identities |
| admin_users | 5 | operators |
| collections / shares / intents | 15 / 33 / 23 | **live, contradicting the manifest** |

The single ACTIVE merchant is `Sandbox · Doa-Sandbox`
(`255afb6c-0f19-4867-9b96-28108ce416c9`, `business_account_type = APPLICATION`,
handle `@doa`). The single ACTIVE project is its Developer Project.

**This is the empirical case for persistent actors.** Today a Full Validation
Run would have to create every Business and Project from scratch, against a
per-IP application-submit quota of 30/24h, and then suspend them — the
`create → test → suspend` pattern that produced the 1 158 terminally suspended
merchants already present.

## 6. SDKs

| SDK | Package | Version | Source | Publication |
|---|---|---|---|---|
| TypeScript | `@banzami/sdk` | 0.14.1 | 26 files / 4 834 lines | **published to npm** |
| Dart client | `banzami_client` | 0.1.0 | 11 files / 1 087 lines | publishable, **not confirmed published** |
| Flutter (internal) | `banzami_flutter` | 0.1.0 | 93 files / 19 655 lines | `publish_to: none` (ADR-053) |
| Go | `banzami-go` | — | 7 files / 1 192 lines | no release tooling |
| PHP | `banzami/sdk-php` | — | 11 files / 890 lines | no release tooling |
| Python | `banzami-python` | 0.1.0 | 59 files | no release tooling |
| Checkout web | `@banzami/checkout` | 0.1.0 | 6 files / 460 lines | `UNLICENSED` |

`sdk/README.md` lists only `flutter/` and `typescript/` under Contents — five
SDKs are undocumented in their own index (VL-010). Detail in
[12](12-sdk-inventory-and-publication.md).

## 7. Feature flags in effect (Sandbox, read from container env)

Identical across gateway, public-api, developer-api and core:

```
ENVIRONMENT=sandbox
BANZAMI_PILOT_LIMITS=1          ← see doc 16; the binding constraint
PAYMENT_CAPABILITY_RELEASED=true
DEVELOPER_KEY_AUTH_ENABLED=true
KYB_STORAGE_BUCKET=banzami-kyb-sandbox   (gateway only)
```

Service defaults not expressed in env but externally material:
`FIXTURE_EMAIL_DAILY_BUDGET` (default **40/day**), `FixturesEnabled`,
`CredentialPerMinute = 15`, `DefaultRateLimits{authenticated 1000/min,
anonymous 60/min}`, per-IP windows `application-submit 30/24h` and
`beta-register 20/24h`, realtime `120/min/IP`.

Every one of these belongs in the Run Manifest (§89) because each can turn a
product PASS into a FAIL without any product change.

## 8. Hidden, stale and undocumented surfaces found

| Surface | State | Classification |
|---|---|---|
| `POST /v1/consumer/onboarding/*` | Phone/SMS onboarding; **no SMS layer exists**; `otp_plaintext_for_test` is the only way through | partially implemented; not the app's path |
| `split_sessions`, `split_contributions` tables | Present and empty; `core/api/src/routes/splits.rs` states they are "absent by design" | contradiction, harmless |
| `/v1/splits*` | Mounted, returns **410 SPLIT_SESSIONS_SUPERSEDED** after auth | correctly deprecated |
| `POST /v1/debug/push-test` | Live on public-api | undocumented debug surface |
| `banzami-webhook-sink` | Running 6 days, `/admin/configure`, `/admin/requests`, `/admin/reset`, `/receive/{run}` | **existing §45 infrastructure, in no registry** |
| `sandbox-operator.banzami.com` | DNS + TLS, no backend | published host, 503 |
| 5 `buildx_buildkit_bzrunnerlab-*` containers | Up 4–6 hours from prior lab runs | build residue |
| `consumer_deposits` + boundary `CASH_IN` | Ledger machinery exists; **no public route** | see doc 16 |
