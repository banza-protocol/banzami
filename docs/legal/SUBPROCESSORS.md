# SUBPROCESSORS — Banzami Beta Sandbox

> Derived from the real deployment (infra + service config), not assumptions.
> Only providers with concrete evidence are listed. International transfers are
> flagged for counsel (see BETA-LEGAL-SOURCES.md, open question 3).

| Provider | Category | Purpose | Data seen | Location | Evidence |
|----------|----------|---------|-----------|----------|----------|
| **IONOS** | Hosting / compute | Runs the application servers and PostgreSQL database (VPS) | All service data (Sandbox) | Likely EU (confirm region) | `infra/terraform/ionos/`, `deploy.sh` (root@217.160.9.248) |
| **Cloudflare** | CDN / DNS / TLS / edge | Serves and protects the public sites; TLS termination; edge routing | Request metadata (IP, user-agent) | Global edge | `infra/terraform/cloudflare/`, `infra/docker/docker-compose.sandbox-edge.yml` |
| **Cloudflare R2** | Object storage | Stores uploaded business documents (KYB) — **not used by the minimal Beta Sandbox onboarding** | Uploaded files (LIVE onboarding only) | Cloudflare | env `R2_*`, `services/**` document flow |
| **Resend** | Transactional email | Delivers account, application, activation, contact e-mails | Recipient e-mail, message content | US/EU | `services/api-gateway/internal/config/config.go` (`RESEND_API_KEY`; SMTP fallback) |
| **Google Firebase (FCM)** | Push notifications | Delivers push notifications to the app | Device push token | Google | `services/**` FCM HTTP v1 wiring |

## Not used (explicitly)

- **No analytics or marketing subprocessor** on the public website (no Google
  Analytics, PostHog, Plausible, Segment, Vercel Analytics, Hotjar, etc.).
  Verified: `apps/website/package.json` has no such dependency.
- **No third-party error-monitoring** dependency was found in the website.

## International transfer note

Some subprocessors process data outside Angola. The lawful basis for
international transfer under Lei n.º 22/11 must be confirmed by counsel before
Financial Live (BETA-LEGAL-SOURCES.md, open question 3). For the Beta Sandbox,
data is test/operational data with no real financial value.

## Maintenance

Update this list whenever a provider is added or removed. The Privacy Policy
references "the categories of subprocessors listed in our subprocessor register"
and must stay consistent with this file.
