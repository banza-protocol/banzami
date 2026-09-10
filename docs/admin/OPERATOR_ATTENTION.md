# BANZADMIN — operator attention (sidebar badges)

A red number next to a BANZADMIN menu means **items in that queue are waiting
for an operator to act**. It is never a row count: an application waiting for
the applicant, a payout the bank has confirmed, or a reconciliation that
matched are not counted. A menu that is a place to look things up or configure
(Negócios, Consumidores, Comprovativos, Pagamentos recebidos, Operadores, Modo
da plataforma, Finanças › Visão geral / Regras de preço / Perfis de preço /
Políticas de fee / Taxas do operador, Visão geral) never has a badge.

## One source

```
GET /admin/v1/attention-summary?environment=SANDBOX|LIVE      (admin-api, operator JWT, dashboard.view)
  └─ GET /internal/v1/attention-summary                        (api-gateway of that environment, internal key)
       service/attention.go — every category's rule, one SQL round trip
  └─ compliance_cases (Inbox) after a sync, admin_notifications (bell)
```

Response (aggregate counts only — no ids, names, handles or amounts):

```json
{
  "environment": "SANDBOX",
  "generated_at": "2026-09-10T20:15:04Z",
  "total": 49,
  "categories": {
    "business_applications": { "count": 20 },
    "kyb_documents":         { "count": 1, "states": ["PENDING_REVIEW"] },
    "payouts":               { "count": 28, "states": ["PENDING", "PROCESSING", "SENT"] },
    "inbox":                 { "count": 36, "states": ["OPEN"] }
  },
  "unread_notifications": 21
}
```

- `total` adds the categories returned to this operator, **except `inbox`**:
  the Inbox gathers cases from the other queues (applications, KYB, KYC, failed
  settlements), so adding it would count the same work twice.
- `states`, where a rule is a set of states, is what the page filters by in its
  "Requer atenção" view — the page never keeps its own copy of the rule.
- The frontend (`apps/admin/lib/attention.ts`) only formats counts; it holds no
  domain rule.

## Categories

| Menu | Key | Waits for an operator when… | Not counted | "Requer atenção" view |
|------|-----|------------------------------|-------------|------------------------|
| Compliance › Inbox | `inbox` | a compliance case is not RESOLVED (UNASSIGNED, ASSIGNED, ESCALATED) | RESOLVED | `/compliance/inbox?attention=1` → status `OPEN` |
| Candidaturas | `business_applications` | SUBMITTED or UNDER_REVIEW (to review); PROVISIONING_FAILED (approve again — it resumes); APPROVED Project application whose Project binding did not complete | INFORMATION_REQUIRED (the applicant's move), APPROVED, REJECTED, CANCELLED, DRAFT | `/merchants?attention=1` → `status=ATTENTION` (same SQL as the count: `AttentionApplicationsSQL`) |
| Documentos KYB | `kyb_documents` | a Business has at least one document PENDING_REVIEW (counted per Business — the page lists Businesses) | VALID, REJECTED, EXPIRED, REPLACED, PENDING_UPLOAD | "Requer atenção" chip (Businesses with pending documents) |
| Documentos KYC | `kyc_documents` | a consumer KYC case is UNDER_REVIEW (the consumer submitted) | WAITING_DOCUMENTS, DOCUMENTS_RECEIVED, NEEDS_MORE_INFO (the consumer's move), terminal states | "Requer atenção" chip → UNDER_REVIEW |
| Liquidações | `settlements` | PENDING (to submit) or SUBMITTED (to confirm) | SETTLED, FAILED | `/settlements?attention=1` |
| Pagamentos | `payouts` | PENDING, PROCESSING or SENT (to confirm or return) | CONFIRMED, FAILED, RETURNED | `/payments?attention=1` |
| Reconciliação | `reconciliation` | the latest finished run FAILED (1), or its items that are not MATCHED (N) | a clean latest run; a run still RUNNING | the page shows the latest run's divergences |
| Disputas | `disputes` | OPEN, or UNDER_REVIEW once evidence arrived — both wait for the operator to resolve | WON_BY_CONSUMER, WON_BY_MERCHANT, CLOSED | `/disputes?attention=1` |
| Risco & Audit | `risk_flags` | a risk flag is unresolved | resolved flags | the page lists unresolved flags |
| Finanças › Liquidações de apps | `application_settlements` | CREATED or PENDING — they complete in the request that creates them, so one still in flight is stuck and waits to be failed or cancelled | COMPLETED, FAILED, CANCELLED | `/application-settlements?attention=1` |
| (bell) | `unread_notifications` | an operator notification is UNREAD | READ, DISMISSED | the bell's list |

Reconciliation items are a run's findings, not a queue: the resolution is to fix
the cause and run it again; a clean run clears the badge.

## Access (RBAC)

The endpoint needs `dashboard.view`. Each category is returned only to a role
holding the capability that opens its page — the same capability the page's
list route requires (`AttentionCategories` in
`services/admin-api/internal/handler/attention.go`). A count of a queue you
cannot open is itself information, so it is left out, not zeroed.

| Category | Capability | OPERATIONS | COMPLIANCE | SUPPORT | READ_ONLY |
|----------|-----------|:-:|:-:|:-:|:-:|
| inbox, business_applications, kyb_documents | application.view | ✓ | ✓ | ✓ | ✓ |
| kyc_documents | consumer.view | ✓ | ✓ | ✓ | ✓ |
| settlements | settlement.view | ✓ | — | ✓ | ✓ |
| payouts | payout.view | ✓ | — | ✓ | ✓ |
| reconciliation, risk_flags | risk.view | ✓ | ✓ | ✓ | ✓ |
| disputes | dispute.view | ✓ | — | ✓ | ✓ |
| application_settlements | finance.view | ✓ | ✓ | ✓ | ✓ |

SUPER_ADMIN sees every category. An unknown role sees none.

## Environments

The console asks for the environment it is showing (SANDBOX by default; LIVE
only when the platform mode is LIVE). admin-api calls that environment's
gateway, which counts only its own environment's rows. If a gateway answers for
the other environment, the request fails (502, `environment_mismatch`) rather
than showing one environment's work under the other's name.

## Freshness

- The console refreshes on start, every 30 s while the tab is visible, when the
  tab regains focus, when the operator switches environment, and immediately
  after any successful change made through the console (`AdminApi.req` fires
  `banzadmin:mutated`). All of these share one request.
- admin-api caches a summary for 10 s per environment, computing it once however
  many operators ask. Any successful mutation through admin-api
  (`middleware.AfterMutation`) drops the cache, so an operator's own action
  shows at once; the 10 s only bounds work arriving from elsewhere (a new
  application, an upload in the Business App).

## Failure

A failure is never shown as zero. If the summary cannot be computed (gateway
down, 5xx, environment mismatch) admin-api answers 502 and the console keeps
the last good summary for up to 2 minutes, then hides the badges. A failed Inbox
sync drops only the Inbox badge.

## Observability

admin-api `/metrics` (low cardinality — no operator, no ids). Read by the scraper on the
Docker network only: the Sandbox edge answers `admin.banzami.com/api/metrics` (and the
gateway's `/metrics`) 404, because these counts are for authenticated operators
(`tests/ops/sandbox-edge-perimeter.test.mjs`).


- `banzadmin_attention_requests_total{outcome,cache}` — outcome
  `ok|unavailable|upstream_error|environment_mismatch`, cache `hit|miss`
- `banzadmin_attention_compute_seconds` — compute time on a cache miss
- `banzadmin_attention_items{environment,category}` — last computed count

Logs: `attention.summary.failed` (environment, outcome), `attention.inbox.sync_failed`.

## Performance

The gateway computes every category in one statement of scalar subqueries, each
served by an existing index on its status/environment columns
(merchant_applications, merchant_kyb_documents, kyc_cases, settlements, payouts,
acquiring_reconciliation_runs/items, disputes, risk_flags, app_settlements). No
migration was needed. A category whose table an environment does not provision
counts 0 instead of failing the statement.

## Adding a category

1. Rule: a new entry in `attentionCategories` (api-gateway
   `internal/service/attention.go`) with a real-database test in
   `attention_test.go` that seeds counted and not-counted rows.
2. Access: a capability in `AttentionCategories` (admin-api
   `internal/handler/attention.go`) — the one the page's list route requires.
3. Menu: `attentionKey` on the nav item (`apps/admin/components/layout/nav-config.ts`)
   and the key in `ATTENTION_KEYS` (`apps/admin/lib/attention.ts`).
4. Page: a "Requer atenção" view filtering by the server's `states` (or a
   server filter, as Candidaturas does).
5. This document.
