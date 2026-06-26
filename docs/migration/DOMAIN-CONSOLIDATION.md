# Domain Consolidation & `.com` Canonicalization

Status: **approved** (PR #4) and **complete**. This is the binding domain
architecture for Banzami. Everything Banzami payment/product/runtime is `.com`,
kept intentionally small.

> **Legacy `.org` domains fully removed (2026-06-26).** The former operator/
> protocol `.org` domain and all of its subdomains (api / admin / business / pay /
> sandbox / www) no longer exist in the ecosystem — **no nginx block, no redirect,
> no fallback, no certificate, no service, and no runtime/docs/test/tooling
> reference**. Official domains:
> - Banzami platform → `banzami.com`
> - BANZA protocol → `banza.network` (governed independently; not a Banzami host)
> - Banzami sandbox gateway → `sandbox-api.banzami.com`
> - Banzami sandbox operator → `sandbox-operator.banzami.com`

## 1. Final domain architecture

The **complete** set of Banzami hosts — nothing else exists:

| Host | Purpose |
|------|---------|
| `banzami.com`, `www.banzami.com` | Public website (`www` → 301 → apex) |
| `api.banzami.com` | **Single** public API (live) |
| `sandbox-api.banzami.com` | Sandbox API / gateway (`/v1/...`, `/consumer/...`) |
| `sandbox-operator.banzami.com` | Sandbox **operator** identity — only `/health` + `/.well-known/banza/operator.json` |
| `pay.banzami.com` | Payments / hosted checkout |
| `admin.banzami.com` | Admin portal (BANZADMIN) |

The BANZA protocol site `banza.network` is **not** a Banzami-operated host.

### No new subdomains

Do **not** create any other subdomain without a separate architecture review **and**
explicit approval. Separate audiences via **scopes, permissions, authentication and
routing — not DNS**. Before proposing any new subdomain, produce a justification
report (why an existing host/path can't solve it; DNS/TLS/deep-link/ops cost).

## 2. Single public API

`api.banzami.com` is the **single** public API endpoint — no separate API hosts
for consumer / business / merchant / admin audiences. The legacy `.org` API host
has been fully removed (clients migrated to `api.banzami.com`; the host no longer
exists in nginx or DNS).

## 3. Canonical payment link

**Approved canonical:** `https://pay.banzami.com/pay/<slug>`
Supported routes on `pay.banzami.com`: `/pay/<slug>`, `/r/<code>`, `/u/<handle>`.

Payment/product/runtime code (SDK, mobile, generated share links, AASA/App Links)
emits **only** `.com` canonical hosts. The SDK (`paymentLinkQr`) is the single
owner of the pay URL → `pay.banzami.com/pay/<slug>`; consumers read `qrValue`/
`paymentUrl` and never construct it. (Guarded by SDK + mobile tests.)

## 4. Sandbox operator (BANZA L0) — separate host, no hybrid

The operator identity and the sandbox API are on **separate hosts**:

- **`sandbox-operator.banzami.com`** is the official Banzami sandbox **operator**
  host for BANZA L0. It serves **only** `/.well-known/banza/operator.json` and
  `/health` (sandbox-invariant manifest + health required by L0 `MAN-*` /
  `HEALTH-002`) from the `sandbox-operator` service; every other path returns 404.
  The manifest declares `operator_url: https://sandbox-operator.banzami.com`.
- **`sandbox-api.banzami.com`** is the sandbox **API/gateway** only (`/v1/...`,
  `/consumer/...`) and no longer serves any operator endpoint.

Latest L0 run against `sandbox-operator.banzami.com`: 5/5 PASS (see
`evidence/banza-conformance/l0/`).
