# ADR-008 — Merchant Dashboard vs Admin Dashboard Separation

**Status:** Superseded (merchant half) — 2026-09-12  
**Date:** 2026-05-13

> The separation decided here still holds for the operator side: `apps/admin` is
> BANZADMIN and is deployed. The merchant half is gone. `apps/dashboard` was
> **retired and deleted on 2026-09-12** (CAP-APP-002): it was never routed,
> `dashboard.banzami.com` has never resolved, it ran in no container, no CI job
> named it, nothing imported it, and it implemented no capability that lived only
> there. What settled it is the authentication model this ADR did not anticipate
> — it kept a **secret API key in `localStorage`** and called the Gateway from
> the browser, which CLAUDE.md §13 forbids outright.
>
> What merchants and developers actually use is the Developers Console in
> `apps/website/app/developers`, which has a real server-side session. When a
> merchant surface returns, it starts from that session model, not from this one.
> The text below is the 2026-05-13 decision, kept as the record of what was
> decided then.

---

## Context

Banza has two distinct classes of web dashboard users:

1. **Merchants** — external customers who need to monitor their transactions, manage API keys, configure webhooks, and initiate payouts.
2. **Banza Operators** — internal staff who perform compliance actions (KYC approval/rejection/AML flagging), manage the settlement lifecycle, and trigger reconciliation.

The question was whether to build one multi-role dashboard or two separate applications.

---

## Decision

**Build two separate Next.js applications: `apps/dashboard` (merchants) and `apps/admin` (operators).**

Key reasons:

**Security isolation:** Merchant users authenticate via their own API keys, scoped to their merchant account. Operators authenticate via a single shared `ADMIN_API_KEY`. Combining both in one app would require careful permission gating on every route — a class of bugs that is eliminated entirely by physical separation. The admin app is never served to external parties.

**Different APIs:** The merchant dashboard calls the public `api-gateway` (`:8080`, `Authorization: Bearer <merchant_api_key>`). The admin dashboard calls the `admin-api` (`:8082`, `Authorization: Bearer <admin_api_key>`). The endpoints, authentication mechanisms, and response shapes are distinct enough that sharing a single API client would add complexity without benefit.

**Deployment independence:** The admin dashboard can be deployed on a private network or behind a VPN without affecting the merchant-facing app. Both apps use `output: 'standalone'` for Docker-friendly deployment.

**Operational clarity:** Operators see only the screens relevant to their role (compliance, settlement lifecycle, payout management, reconciliation). Merchants see only their business data (transactions, wallet, payouts, webhooks, API keys). Cross-contamination of mental models increases operational error risk.

**Shared design system:** Both apps use identical Tailwind configuration with Banza brand tokens (`apps/dashboard/tailwind.config.ts` and `apps/admin/tailwind.config.ts` are identical). When the shared TypeScript SDK (`@banza/sdk`) is published, both apps will import from it. The visual differentiation is intentional: the admin app uses a dark (`gray-900`) sidebar and login screen to signal its internal-only nature.

---

## Alternatives Considered

**Single app with role-based access control:** Would require every page to check the user's role before rendering. Route-level protection in Next.js middleware is reliable, but the operational and security argument for keeping internal tooling separate from customer-facing tooling outweighs the convenience of a single deployment. A misconfigured RBAC rule in a combined app could expose admin actions to merchants.

**Admin functionality inside the merchant dashboard:** Rejected on the same grounds as the single-app approach, plus: it would expose the admin API's existence to merchant users, even if behind a route guard.

---

## Consequences

- Two separate `npm install` / build / deploy pipelines. Managed via the root `Makefile`.
- Ports: `apps/dashboard` runs on `:3001`, `apps/admin` runs on `:3002` in development.
- Future: the `docker-compose.full.yml` should be extended to include containerised builds of both dashboard apps when needed for staging.
- If the Banza team grows, ownership of each app can be assigned to separate teams without merge conflicts.
