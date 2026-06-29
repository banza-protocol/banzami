# ADR-022: Compliance Operations Console — KYB/KYC review, Notification Center, Activity Feed

**Status:** Accepted — implemented (closed)
**Date:** 2026-06-29
**Authors:** Banzami Engineering
**Related:** ADR-020 (Consumer KYC) · ADR-023 (Unified Compliance Inbox) · ADR-024 (Platform Status)

---

## Context

The operator review surface had grown into several disconnected pages (loose KYB
documents, per-case KYC, applications) with no persistent operator awareness layer.
Reviewers lost the entity context and had to poll each page to discover new work.

## Decision

Build a production-grade compliance review layer in the **operator** stack only
(admin-api + BANZADMIN + the gateway's internal endpoints). No protocol/ledger/
pricing/settlement changes.

### KYB — review a *merchant*, not loose documents
- Gateway `AdminListMerchants` (one row per merchant with per-status document
  aggregates, orphan-safe) + `AdminMerchantDocuments`. admin-api proxies; signed
  read URLs are minted **on demand** and never stored; `storage_key` never leaves.
- BANZADMIN merchant-centric list + drawer (Resumo, Dados da candidatura, all
  documents grouped, Histórico, per-document Ver/Download/Copiar + Aprovar/Rejeitar).

### KYC — review a *consumer*, not loose evidence
- admin-api (ADR-020-owned) `ListCases` groups by consumer (latest case). Drawer:
  Consumidor + Caso + evidências (on-demand signed URLs) + Histórico + decisões.
- Per-environment storage: SANDBOX evidence is signed against `banzami-kyc-sandbox`,
  LIVE against `banzami-kyc-live` — never crossed.

### Notification Center + Activity Feed
- `admin_notifications` (migration 0074): generated **idempotently** from existing
  source events (`merchant_kyb_events`, `kyc_events`, `merchant_applications`,
  `app_settlements`, `admin_audit_log`) via a unique `source_key` — never invented.
- Bell (unread counter, mark read / mark all / dismiss, deep-link), dashboard
  Activity Feed, per-environment. Sidebar badges count **entities**, not documents.

## Security
storage_key never exposed; signed URLs on demand only, never persisted or logged;
every decision/access audited (VIEW/DOWNLOAD/COPY/APPROVE/REJECT/REQUEST_INFO);
internal notes never reach the audit snapshot.

## Consequences
The operator works on entities with full context and a persistent awareness layer.
Superseded in navigation by ADR-023 (the unified inbox becomes the central entry
point) — the KYB/KYC drawers and notification layer remain the underlying surface.
