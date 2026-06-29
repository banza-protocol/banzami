# ADR-023: Compliance Operations Console — Unified Case Inbox

**Status:** Accepted — implemented (increment 1, closed)
**Date:** 2026-06-29
**Authors:** Banzami Engineering
**Related:** ADR-022 (KYB/KYC review + notifications) · ADR-024 (Platform Status)

---

## Context

Even after ADR-022, the operator still navigated module-by-module (KYB page, KYC
page, applications, settlements). For a daily compliance workflow the unit of work
should be a **case**, not a module.

## Decision

Introduce a unified, case-based **Compliance Inbox** — the central entry point for
the operations team. Operator/admin-api only; no protocol/engine changes.

### ComplianceCase — a thin operational index
- Migration 0075: `compliance_cases` (case_type, entity, status, priority,
  risk_level, assigned_operator, last_activity, `source_key`, metadata) +
  `compliance_case_notes`. It **indexes** existing entities — it never duplicates
  financial or document data.
- `Sync()` materializes active cases idempotently from `merchant_applications`
  (under review), merchants with pending KYB docs, consumers with non-terminal KYC
  cases, and failed settlements; **auto-resolves** when the source clears.

### Inbox + drawer + triage
- List with filters (type/status/priority/risk/operator), free-text search
  (name/handle/id/email/NIF via denormalized fields), pagination, SLA/priority/risk
  badges. Unified drawer: Resumo + Dados + Notas internas + triage actions, with a
  deep-link to the full module review.
- Assignment (assume/release/transfer/escalate/resolve), priority/risk overrides,
  internal notes — all audited.

### Deep links
Notifications point at `/compliance/inbox?focus=<entity_id>` — they open the
**case**, never a loose document.

## Security
Operational state only — no financial truth, no storage_key, no signed URLs in the
index. Read = `application.view`; triage = `compliance.review`. Every action audited.

## Consequences
The Inbox is the operator's central console. Closed scope (no further structural
change). Deferred to a future increment: inline documents/timeline/approve *inside*
the unified drawer (today it deep-links to the module), the operational-metrics
dashboard, and a dedicated global activity page. Dispute/Fraud/Risk/AML case types
are modeled and appear once their source tables exist.
