# apps

User-facing TypeScript / Next.js applications.

## Contents

- `checkout/` — Hosted checkout page (`pay.banzami.com`): QR-first payment page for Banza payment links.
- `dashboard/` — Merchant dashboard (analytics, transactions, settlements, payouts).
- `admin/` — Internal admin console (operations, disputes, compliance review).
- `docs/` — Public developer documentation site.

## Stack

TypeScript · Next.js · React

## Conventions

- Each app is an independent Next.js project with its own `package.json`.
- Shared UI components and design tokens belong in a future workspace package — do not duplicate across apps.
- All apps must integrate with the observability stack (OpenTelemetry browser SDK + structured logging).
- Authentication and all data access flow through `services/api-gateway`. Apps never speak to `core/` directly and never hold credentials for downstream systems.
- No financial calculations in app code. Display values returned by the API; never derive monetary state client-side.
