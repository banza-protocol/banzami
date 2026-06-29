# BANZADMIN — Finance dashboard

**ADRs:** Banzami ADR-021 · BANZA ADR-039
**Version:** 1.0
**Scope:** Increment 5.7 — read-only finance dashboards.

**BANZADMIN → Finanças → Visão geral.** Simple, auditable aggregations over the
**existing** immutable `operator_fees` and `app_settlements` tables. No new tables,
no invented data, no writes, no engine involvement. Operator **revenue == the
operator fees applied**.

---

## The chain

```
BANZADMIN /finance ──▶ admin-api GET /admin/v1/finance/dashboard (finance.view)
                  ──▶ core-api GET /internal/v1/finance/dashboard  (read-only aggregates)
```

The core endpoint runs a handful of parameterized `GROUP BY` queries over
`operator_fees` / `app_settlements` (indexed on `(environment, created_at)` /
`(status, environment)`) and returns a single JSON document. No row-level data,
no PII — only counts and minor-unit totals.

---

## Filters

`environment`, `currency`, `from`, `to`. The KPI cards (today / month / pending /
failed) are **absolute** (relative to `now()`, scoped by environment + currency);
the breakdowns and the per-day chart honour the `[from, to]` window (default: last
30 days).

---

## What it shows

**KPI cards**
- Operator Fees **Today** / **This month** — count + total per currency.
- Application Settlements **Today** / **Pending** (CREATED+PENDING) / **Failed**.

**Breakdowns (within the window)**
- Revenue by **business category**, by **currency**, by **pricing profile**
  (horizontal bars sized by total).
- Settlements by **status** (count).
- Operator **fees per day** (vertical bars).

All amounts are integer minor units, formatted client-side. Charts are simple CSS
bars (the admin app ships no charting library); no complex analytics.

---

## Response shape (core-api)

```jsonc
{
  "window": { "from": "...", "to": "..." },
  "environment": "LIVE", "currency": null,
  "operator_fees": {
    "today":  [ { "key": "AOA", "count": 12, "total_minor": 34500 } ],
    "month":  [ ... ],
    "by_currency":          [ { "key": "AOA", "count": ..., "total_minor": ... } ],
    "by_business_category": [ { "key": "DONATION", ... } ],
    "by_pricing_profile":   [ { "key": "STANDARD"|null, ... } ],
    "by_day":               [ { "key": "2026-06-29", ... } ]
  },
  "application_settlements": {
    "today_count": 3, "pending_count": 1, "failed_count": 0,
    "by_status": [ { "key": "COMPLETED", "count": 2, "total_minor": 186200 } ]
  }
}
```

---

## RBAC & security

- `finance.view` (broad read: SUPER_ADMIN, OPERATIONS, COMPLIANCE, SUPPORT,
  READ_ONLY). Read-only — no mutation, no audit row.
- Every filter is a bound parameter; the grouped column dimensions are fixed
  literals (no SQL injection). Per-group result rows are capped (≤100); no PII.
- No percentages on any public surface — this is admin-only and shows totals, not
  rules.

---

## Tests

- **core-api** (real-DB): empty aggregations (zeros/empty arrays); fees +
  settlements aggregated (by currency/category, today KPI, status counts);
  currency + environment filters.
- **admin-api** (Go): dashboard forwards only whitelisted filters and writes **no**
  audit row (GET).
- **BANZADMIN**: `tsc` + `next build` green.

---

## Deferred / limitations

Real data only — empty windows render real empty states. No time-series beyond the
per-day fee bars; no cross-currency total (totals are always per-currency to avoid
mixing). Settlement reprocess, Pricing Profiles / Fee Policies CRUD remain for
later parts; BANZADMIN still has no unit-test runner.
