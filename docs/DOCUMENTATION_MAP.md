# Banzami Documentation Map

Where everything lives. This is the only meta-document — start here.

| You need… | Go to |
|-----------|-------|
| **What Banzami is / entry point** | [README.md](../README.md) |
| **Engineering rules & conventions** | [CLAUDE.md](../CLAUDE.md) |
| **Current repository state** | [docs/governance/BANZAMI_CURRENT_STATE.md](governance/BANZAMI_CURRENT_STATE.md) |
| **What is available now (Sandbox vs Financial Live)** | Public Sandbox is available (fictitious money, self-service, no consumer KYC); Financial Live is not available / fail-closed. See [ADR-060](adr/ADR-060-self-service-public-sandbox.md) · [ADR-061](adr/ADR-061-wallet-native-rail-decoupled-financial-network.md) · [LIVE_ACTIVATION_GATE](operations/LIVE_ACTIVATION_GATE.md) |
| **App Banzami — the Consumer product (one Flutter app: Web + iOS + Android)** | [docs/architecture/APP_BANZAMI_CLIENTS.md](architecture/APP_BANZAMI_CLIENTS.md) · [ADR-064](adr/ADR-064-app-banzami-web-consumer-client.md) |
| **App Banzami Web — app.banzami.com (hosting / opaque-session BFF)** | [docs/infra/APP_BANZAMI_WEB_HOSTING.md](infra/APP_BANZAMI_WEB_HOSTING.md) · [threat model](security/WEB_APP_001_THREAT_MODEL.md) |
| **Hosted Checkout — pay.banzami.com (payer-facing; not App Banzami)** | [ADR-052](adr/ADR-052-one-hosted-payer-surface.md) · [DOMAIN-CONSOLIDATION](migration/DOMAIN-CONSOLIDATION.md) |
| **Test Payer — deterministic Sandbox scenario tool** | [Sandbox OpenAPI](developer/openapi/banzami-sandbox.openapi.json) · [SANDBOX_SELF_SERVICE_001_CONFORMANCE](quality/SANDBOX_SELF_SERVICE_001_CONFORMANCE.md) |
| **App Web E2E — `make app-web-cleanroom` (Semantics-first Flutter Web runner)** | [tools/e2e/app-web/README.md](../tools/e2e/app-web/README.md) · [E2E_METHODOLOGY](quality/E2E_METHODOLOGY.md) |
| **Operator reference (products, SDKs)** | [BANZAMI_REFERENCIA.md](../BANZAMI_REFERENCIA.md) (canonical mother-doc) · [BANZAMI_REFERENCE.md](../BANZAMI_REFERENCE.md) (superseded, kept for history) |
| **Architecture** | [BANZAMI_ARCHITECTURE.md](../BANZAMI_ARCHITECTURE.md) · [docs/architecture/](architecture/) |
| **Architecture decisions (ADRs)** | [docs/adr/](adr/) |
| **Per-domain docs** | [docs/domains/](domains/) |
| **API reference** | [docs/api/](api/) |
| **Receipt semantics (who was paid, operation, proof snapshot)** | [docs/api/receipt-semantics.md](api/receipt-semantics.md) |
| **Document Engine & official receipt PDFs** | [docs/document-engine.md](document-engine.md) |
| **BANZADMIN sidebar badges (operator attention)** | [docs/admin/OPERATOR_ATTENTION.md](admin/OPERATOR_ATTENTION.md) |
| **Email Design System (Resend)** | [docs/admin/BANZADMIN_RUNBOOK.md](admin/BANZADMIN_RUNBOOK.md) (§Email) |
| **KYB document upload (Cloudflare R2)** | [docs/ops/KYB_R2_SETUP.md](ops/KYB_R2_SETUP.md) |
| **SDKs & integration guides** | [docs/integrations/](integrations/) · [docs/developer/](developer/) |
| **Sandbox** | [docs/sandbox/](sandbox/) |
| **Operations & runbooks** | [BANZAMI_OPERATIONS.md](../BANZAMI_OPERATIONS.md) · [docs/runbooks/](runbooks/) · [docs/playbooks/](playbooks/) · [docs/incident-management/](incident-management/) |
| **Full-system assurance (coverage matrix, defect ledger, residuals)** | [docs/quality/FULL_SYSTEM_ASSURANCE.md](quality/FULL_SYSTEM_ASSURANCE.md) |
| **Log retention & bearer-value redaction (Sandbox host)** | [docs/operations/LOG_RETENTION.md](operations/LOG_RETENTION.md) |
| **Sandbox fixture hygiene — tenants of their own, funds returned, sweeping by canonical API** | [docs/operations/SANDBOX_FIXTURE_HYGIENE.md](operations/SANDBOX_FIXTURE_HYGIENE.md) |
| **Deployment** | [BANZAMI_DEPLOYMENT.md](../BANZAMI_DEPLOYMENT.md) |
| **Security** | [BANZAMI_SECURITY.md](../BANZAMI_SECURITY.md) · [docs/security/](security/) |
| **Compliance** | [docs/compliance/](compliance/) |
| **Operator governance** | [BANZAMI_GOVERNANCE.md](../BANZAMI_GOVERNANCE.md) |
| **Validation / operator readiness** | [docs/validation/](validation/) + the Validation Studio (`apps/validation-studio`) |
| **Wallet-native model — value moves inside the network, external rails are boundaries** | [ADR-061](adr/ADR-061-wallet-native-rail-decoupled-financial-network.md) · [terminology](architecture/WALLET_NATIVE_TERMINOLOGY.md) · [dependency audit](architecture/WALLET_NATIVE_DEPENDENCY_AUDIT.md) · [future Financial Live operating model (internal)](regulatory/FUTURE_FINANCIAL_LIVE_OPERATING_MODEL.md) |
| **Sandbox resources are developer-disposable — delete after activity, cascade, no archive prerequisite** | [ADR-062](adr/ADR-062-sandbox-resources-are-developer-disposable.md) · [conformance](quality/SANDBOX_DELETE_001_CONFORMANCE.md) |
| **Money model — a balance is an obligation, backing is explicit, reconciliation edits nothing** | [ADR-063](adr/ADR-063-customer-liabilities-backing-assets-and-reconciliation.md) · [money model](architecture/MONEY_MODEL.md) · [conformance](quality/MONEY_MODEL_001_CONFORMANCE.md) |
| **The economic model — where Banzami charges** | [docs/architecture/economic-model.md](architecture/economic-model.md) |
| **Audits — what was found, and what it cost** | [docs/audit/](audit/) |
| **Glossary** | [docs/glossary.md](glossary.md) |

> Protocol topics (certification, conformance, federation, governance) live in the
> BANZA protocol repo: [github.com/banza-protocol/banza](https://github.com/banza-protocol/banza).
