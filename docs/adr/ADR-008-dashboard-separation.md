# ADR-008 — Merchant Dashboard vs Admin Dashboard Separation

**Status:** Accepted  
**Date:** 2026-05-13

---

## Context

Banzami has two distinct classes of web dashboard users:

1. **Merchants** — external customers who need to monitor their transactions, manage API keys, configure webhooks, and initiate payouts.
2. **Banzami Operators** — internal staff who perform compliance actions (KYC approval/rejection/AML flagging), manage the settlement lifecycle, and trigger reconciliation.

The question was whether to build one multi-role dashboard or two separate applications.

---

## Decision

**Build two separate Next.js applications: `apps/dashboard` (merchants) and `apps/admin` (operators).**

Key reasons:

**Security isolation:** Merchant users authenticate via their own API keys, scoped to their merchant account. Operators authenticate via a single shared `ADMIN_API_KEY`. Combining both in one app would require careful permission gating on every route — a class of bugs that is eliminated entirely by physical separation. The admin app is never served to external parties.

**Different APIs:** The merchant dashboard calls the public `api-gateway` (`:8080`, `Authorization: Bearer <merchant_api_key>`). The admin dashboard calls the `admin-api` (`:8082`, `Authorization: Bearer <admin_api_key>`). The endpoints, authentication mechanisms, and response shapes are distinct enough that sharing a single API client would add complexity without benefit.

**Deployment independence:** The admin dashboard can be deployed on a private network or behind a VPN without affecting the merchant-facing app. Both apps use `output: 'standalone'` for Docker-friendly deployment.

**Operational clarity:** Operators see only the screens relevant to their role (compliance, settlement lifecycle, payout management, reconciliation). Merchants see only their business data (transactions, wallet, payouts, webhooks, API keys). Cross-contamination of mental models increases operational error risk.

**Shared design system:** Both apps use identical Tailwind configuration with Banzami brand tokens (`apps/dashboard/tailwind.config.ts` and `apps/admin/tailwind.config.ts` are identical). When the shared TypeScript SDK (`@banza/sdk`) is published, both apps will import from it. The visual differentiation is intentional: the admin app uses a dark (`gray-900`) sidebar and login screen to signal its internal-only nature.

---

## Alternatives Considered

**Single app with role-based access control:** Would require every page to check the user's role before rendering. Route-level protection in Next.js middleware is reliable, but the operational and security argument for keeping internal tooling separate from customer-facing tooling outweighs the convenience of a single deployment. A misconfigured RBAC rule in a combined app could expose admin actions to merchants.

**Admin functionality inside the merchant dashboard:** Rejected on the same grounds as the single-app approach, plus: it would expose the admin API's existence to merchant users, even if behind a route guard.

---

## Consequences

- Two separate `npm install` / build / deploy pipelines. Managed via the root `Makefile`.
- Ports: `apps/dashboard` runs on `:3001`, `apps/admin` runs on `:3002` in development.
- Future: the `docker-compose.full.yml` should be extended to include containerised builds of both dashboard apps when needed for staging.
- If the Banzami team grows, ownership of each app can be assigned to separate teams without merge conflicts.
