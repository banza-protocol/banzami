//! The financial position of the network, and the invariants it must satisfy
//! (MONEY-MODEL-001, ADR-063).
//!
//! A Banzami balance is an obligation: every participant and Business account is
//! a LIABILITY Banzami owes its owner. This module answers, from the ledger
//! alone and at a point in time:
//!
//! * how much Banzami owes — participants, Businesses, withdrawals in flight;
//! * what backs it — external backing positions and value in transit;
//! * what Banzami has earned for itself — never counted as a customer's;
//! * what is pending at the boundary — funding not yet confirmed, withdrawals
//!   not yet executed;
//! * and every condition that must never hold: an unbalanced book, backing
//!   below obligations, a negative obligation or backing position, value in an
//!   account nothing owns, value left on a retired resource, an in-flight
//!   balance that no withdrawal explains.
//!
//! It is READ-ONLY by construction: every statement is a SELECT. It never
//! corrects anything — a discrepancy is reported, and a correction is a new
//! balanced posting through Core's own operations.

use chrono::{DateTime, Utc};
use sqlx::PgPool;

/// One severe condition. `code` is stable and machine-readable; `detail` is for
/// a person. Amounts are minor units.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct IntegrityFinding {
    pub code: &'static str,
    pub currency: String,
    pub amount_minor: i64,
    pub count: i64,
    pub detail: String,
}

/// The network's position in one currency.
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct CurrencyPosition {
    pub currency: String,
    /// Obligations to consumers: spendable, and reserved for a pending operation.
    pub participant_available_minor: i64,
    pub participant_reserved_minor: i64,
    /// Obligations to Businesses (their wallets and wallet accounts).
    pub business_available_minor: i64,
    pub business_reserved_minor: i64,
    /// Obligations reserved for withdrawals no rail has confirmed.
    pub withdrawals_in_flight_minor: i64,
    /// Everything above: what the backing must cover.
    pub covered_obligations_minor: i64,
    /// Fees Banzami earned — Banzami's own position, not a customer obligation.
    pub operator_revenue_minor: i64,
    /// What acquirers kept when they settled — Banzami's own cost.
    pub external_costs_minor: i64,
    /// Bank or custodian positions.
    pub external_backing_minor: i64,
    /// Value confirmed at an acquirer/provider, not yet settled to backing.
    pub external_transit_minor: i64,
    /// Backing + transit.
    pub backing_total_minor: i64,
    /// backing_total − covered_obligations. Negative is a shortfall.
    pub coverage_difference_minor: i64,
    /// Whether every backing and transit account is synthetic (the Sandbox).
    pub backing_is_synthetic: bool,
    /// Boundary operations not yet resolved by a rail.
    pub pending_funding_minor: i64,
    pub pending_funding_count: i64,
    pub pending_withdrawal_minor: i64,
    pub pending_withdrawal_count: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct FinancialPosition {
    pub as_of: DateTime<Utc>,
    pub currencies: Vec<CurrencyPosition>,
    /// Accounts by economic class, for the operator: how many exist and how
    /// many hold value.
    pub classes: Vec<ClassCount>,
    pub findings: Vec<IntegrityFinding>,
    /// The most recent boundary reconciliation: what external evidence has not
    /// yet explained.
    pub latest_boundary_reconciliation: Option<ReconciliationSummary>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ReconciliationSummary {
    pub run_id: uuid::Uuid,
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
    pub counts: serde_json::Value,
    pub unreconciled_amount_minor: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ClassCount {
    pub economic_class: String,
    pub currency: String,
    pub accounts: i64,
    pub accounts_with_value: i64,
}

impl FinancialPosition {
    pub fn is_healthy(&self) -> bool {
        self.findings.is_empty()
    }

    pub fn currency(&self, code: &str) -> Option<&CurrencyPosition> {
        self.currencies.iter().find(|c| c.currency == code)
    }
}

#[derive(sqlx::FromRow)]
struct ClassRow {
    economic_class: String,
    currency: String,
    balance_minor: i64,
    negative_accounts: i64,
    negative_minor: i64,
    accounts_with_value: i64,
    accounts: i64,
    all_synthetic: bool,
}

/// Compute the position and check every invariant. Read-only.
pub async fn financial_position(pool: &PgPool) -> Result<FinancialPosition, sqlx::Error> {
    // Each account's balance in its NORMAL direction: debits − credits for an
    // ASSET or EXPENSE, credits − debits for a LIABILITY, EQUITY or REVENUE.
    let rows: Vec<ClassRow> = sqlx::query_as(
        r#"
        WITH bal AS (
            SELECT c.account_id, c.economic_class, c.account_type, c.currency, c.synthetic,
                   CASE WHEN c.account_type IN ('ASSET', 'EXPENSE') THEN 1 ELSE -1 END
                 * COALESCE(SUM(CASE e.entry_type WHEN 'DEBIT' THEN e.amount_minor ELSE -e.amount_minor END), 0)
                   AS balance
              FROM ledger_account_economic_classes c
              LEFT JOIN ledger_entries e ON e.account_id = c.account_id
             GROUP BY c.account_id, c.economic_class, c.account_type, c.currency, c.synthetic
        )
        SELECT economic_class,
               currency::text AS currency,
               COALESCE(SUM(balance), 0)::bigint                         AS balance_minor,
               COUNT(*) FILTER (WHERE balance < 0)::bigint               AS negative_accounts,
               COALESCE(SUM(balance) FILTER (WHERE balance < 0), 0)::bigint AS negative_minor,
               COUNT(*) FILTER (WHERE balance <> 0)::bigint              AS accounts_with_value,
               COUNT(*)::bigint                                          AS accounts,
               BOOL_AND(synthetic)                                       AS all_synthetic
          FROM bal
         GROUP BY economic_class, currency
         ORDER BY currency, economic_class
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut findings = Vec::new();
    let mut currencies: Vec<CurrencyPosition> = Vec::new();
    let mut classes = Vec::new();
    let mut backing_synthetic: std::collections::HashMap<String, bool> = Default::default();

    for r in &rows {
        classes.push(ClassCount {
            economic_class: r.economic_class.clone(),
            currency: r.currency.clone(),
            accounts: r.accounts,
            accounts_with_value: r.accounts_with_value,
        });
        let pos = match currencies.iter_mut().find(|c| c.currency == r.currency) {
            Some(p) => p,
            None => {
                currencies.push(CurrencyPosition {
                    currency: r.currency.clone(),
                    backing_is_synthetic: true,
                    ..Default::default()
                });
                currencies.last_mut().unwrap()
            }
        };
        match r.economic_class.as_str() {
            "PARTICIPANT_AVAILABLE" => pos.participant_available_minor = r.balance_minor,
            "PARTICIPANT_RESERVED" => pos.participant_reserved_minor = r.balance_minor,
            "BUSINESS_AVAILABLE" => pos.business_available_minor = r.balance_minor,
            "BUSINESS_RESERVED" => pos.business_reserved_minor = r.balance_minor,
            "WITHDRAWALS_IN_FLIGHT" => pos.withdrawals_in_flight_minor = r.balance_minor,
            "OPERATOR_REVENUE" => pos.operator_revenue_minor = r.balance_minor,
            "EXTERNAL_COSTS" => pos.external_costs_minor = r.balance_minor,
            "EXTERNAL_BACKING" | "EXTERNAL_TRANSIT" => {
                if r.economic_class == "EXTERNAL_BACKING" {
                    pos.external_backing_minor = r.balance_minor;
                } else {
                    pos.external_transit_minor = r.balance_minor;
                }
                let e = backing_synthetic.entry(r.currency.clone()).or_insert(true);
                *e = *e && r.all_synthetic;
            }
            "UNOWNED_EMPTY" => {}
            _ => {
                // UNCLASSIFIED: an account nothing owns that has entries. Value
                // that belongs to no one cannot be owed to anyone.
                findings.push(IntegrityFinding {
                    code: "UNCLASSIFIED_ACCOUNT_WITH_ENTRIES",
                    currency: r.currency.clone(),
                    amount_minor: r.balance_minor,
                    count: r.accounts,
                    detail: format!(
                        "{} account(s) with entries and no owner or system role",
                        r.accounts
                    ),
                });
            }
        }
        // No obligation is negative (a participant who owes Banzami is credit,
        // a separate risk product, not a wallet), no backing position is below
        // zero, and in-flight and revenue never go negative.
        if r.negative_accounts > 0
            && r.economic_class != "UNCLASSIFIED"
            && r.economic_class != "UNOWNED_EMPTY"
        {
            let code = match r.economic_class.as_str() {
                "EXTERNAL_BACKING" | "EXTERNAL_TRANSIT" => "NEGATIVE_BACKING_POSITION",
                "OPERATOR_REVENUE" => "NEGATIVE_OPERATOR_REVENUE",
                "EXTERNAL_COSTS" => "NEGATIVE_EXTERNAL_COSTS",
                "WITHDRAWALS_IN_FLIGHT" => "NEGATIVE_WITHDRAWALS_IN_FLIGHT",
                _ => "NEGATIVE_OBLIGATION",
            };
            findings.push(IntegrityFinding {
                code,
                currency: r.currency.clone(),
                amount_minor: r.negative_minor,
                count: r.negative_accounts,
                detail: format!(
                    "{} {} account(s) below zero",
                    r.negative_accounts, r.economic_class
                ),
            });
        }
    }

    for pos in currencies.iter_mut() {
        pos.covered_obligations_minor = pos.participant_available_minor
            + pos.participant_reserved_minor
            + pos.business_available_minor
            + pos.business_reserved_minor
            + pos.withdrawals_in_flight_minor;
        pos.backing_total_minor = pos.external_backing_minor + pos.external_transit_minor;
        pos.coverage_difference_minor = pos.backing_total_minor - pos.covered_obligations_minor;
        pos.backing_is_synthetic = *backing_synthetic.get(&pos.currency).unwrap_or(&false);
        if pos.coverage_difference_minor < 0 {
            findings.push(IntegrityFinding {
                code: "BACKING_BELOW_OBLIGATIONS",
                currency: pos.currency.clone(),
                amount_minor: pos.coverage_difference_minor,
                count: 1,
                detail: format!(
                    "backing {} < covered obligations {}",
                    pos.backing_total_minor, pos.covered_obligations_minor
                ),
            });
        }
    }

    boundary_pending(pool, &mut currencies).await?;
    book_invariants(pool, &mut findings).await?;
    in_flight_is_explained(pool, &currencies, &mut findings).await?;
    retired_resources_hold_nothing(pool, &mut findings).await?;
    let latest_boundary_reconciliation = latest_reconciliation(pool, &mut findings).await?;

    Ok(FinancialPosition {
        as_of: Utc::now(),
        currencies,
        classes,
        findings,
        latest_boundary_reconciliation,
    })
}

/// Funding and withdrawals a rail has not resolved. Informational: pending is
/// not a defect, it is the boundary being honest about what it does not know.
async fn boundary_pending(
    pool: &PgPool,
    currencies: &mut [CurrencyPosition],
) -> Result<(), sqlx::Error> {
    let rows: Vec<(String, String, i64, i64)> = sqlx::query_as(
        r#"
        SELECT 'FUNDING', currency::text, COALESCE(SUM(amount_minor), 0)::bigint, COUNT(*)::bigint
          FROM acquiring_payments WHERE status = 'PENDING' GROUP BY currency
        UNION ALL
        SELECT 'FUNDING', currency::text, COALESCE(SUM(amount_minor), 0)::bigint, COUNT(*)::bigint
          FROM consumer_deposits WHERE status = 'PENDING' GROUP BY currency
        UNION ALL
        SELECT 'WITHDRAWAL', currency::text, COALESCE(SUM(amount_minor), 0)::bigint, COUNT(*)::bigint
          FROM payouts WHERE status IN ('PENDING', 'PROCESSING', 'SENT') GROUP BY currency
        "#,
    )
    .fetch_all(pool)
    .await?;
    for (kind, currency, amount, count) in rows {
        if let Some(p) = currencies.iter_mut().find(|c| c.currency == currency) {
            if kind == "FUNDING" {
                p.pending_funding_minor += amount;
                p.pending_funding_count += count;
            } else {
                p.pending_withdrawal_minor += amount;
                p.pending_withdrawal_count += count;
            }
        }
    }
    Ok(())
}

/// The book balances, posting by posting, and no entry disagrees with the
/// currency of its account.
async fn book_invariants(
    pool: &PgPool,
    findings: &mut Vec<IntegrityFinding>,
) -> Result<(), sqlx::Error> {
    let (unbalanced, net): (i64, i64) = sqlx::query_as(
        r#"
        SELECT COUNT(*)::bigint, COALESCE(SUM(ABS(net)), 0)::bigint FROM (
            SELECT posting_id,
                   SUM(CASE entry_type WHEN 'DEBIT' THEN amount_minor ELSE -amount_minor END) AS net
              FROM ledger_entries GROUP BY posting_id
            HAVING SUM(CASE entry_type WHEN 'DEBIT' THEN amount_minor ELSE -amount_minor END) <> 0) u
        "#,
    )
    .fetch_one(pool)
    .await?;
    if unbalanced > 0 {
        findings.push(IntegrityFinding {
            code: "BOOK_UNBALANCED",
            currency: String::new(),
            amount_minor: net,
            count: unbalanced,
            detail: format!("{unbalanced} posting(s) whose debits and credits differ"),
        });
    }
    let (mismatched,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*)::bigint FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id WHERE e.currency <> a.currency",
    )
    .fetch_one(pool)
    .await?;
    if mismatched > 0 {
        findings.push(IntegrityFinding {
            code: "ENTRY_CURRENCY_MISMATCH",
            currency: String::new(),
            amount_minor: 0,
            count: mismatched,
            detail: format!("{mismatched} entr(ies) in a currency other than their account's"),
        });
    }
    Ok(())
}

/// Withdrawals in flight holds exactly what the payouts a rail has not resolved
/// reserved there. A CONFIRMED payout whose obligation was never extinguished,
/// or a FAILED one never restored, shows up as a difference.
async fn in_flight_is_explained(
    pool: &PgPool,
    currencies: &[CurrencyPosition],
    findings: &mut Vec<IntegrityFinding>,
) -> Result<(), sqlx::Error> {
    let expected: Vec<(String, i64)> = sqlx::query_as(
        r#"
        SELECT a.currency::text,
               COALESCE(SUM(e.amount_minor) FILTER (WHERE e.entry_type = 'CREDIT'), 0)::bigint
          FROM payouts p
          JOIN ledger_postings lp ON lp.idempotency_key = p.idempotency_key || ':process'
          JOIN ledger_entries e   ON e.posting_id = lp.id
          JOIN ledger_accounts a  ON a.id = e.account_id AND a.system_role = 'WITHDRAWALS_IN_FLIGHT'
         WHERE p.status IN ('PROCESSING', 'SENT')
         GROUP BY a.currency
        "#,
    )
    .fetch_all(pool)
    .await?;
    for pos in currencies {
        let want = expected
            .iter()
            .find(|(c, _)| *c == pos.currency)
            .map(|(_, v)| *v)
            .unwrap_or(0);
        if pos.withdrawals_in_flight_minor != want {
            findings.push(IntegrityFinding {
                code: "WITHDRAWALS_IN_FLIGHT_UNEXPLAINED",
                currency: pos.currency.clone(),
                amount_minor: pos.withdrawals_in_flight_minor - want,
                count: 1,
                detail: format!(
                    "in flight {} but unresolved payouts reserved {}",
                    pos.withdrawals_in_flight_minor, want
                ),
            });
        }
    }
    Ok(())
}

/// Retiring a resource never hides what is owed on it: a retired test payer, a
/// retired Project's Business and a closed wallet account hold nothing.
async fn retired_resources_hold_nothing(
    pool: &PgPool,
    findings: &mut Vec<IntegrityFinding>,
) -> Result<(), sqlx::Error> {
    let rows: Vec<(String, String, i64, i64)> = sqlx::query_as(
        r#"
        WITH bal AS (
            SELECT e.account_id,
                   SUM(CASE e.entry_type WHEN 'CREDIT' THEN e.amount_minor ELSE -e.amount_minor END) AS owed
              FROM ledger_entries e GROUP BY e.account_id
        ),
        retired AS (
            SELECT 'RETIRED_TEST_PAYER' AS kind, a.id AS account_id
              FROM sandbox_test_payers t
              JOIN consumer_wallets w ON w.consumer_id = t.consumer_id
              JOIN ledger_accounts a  ON a.id IN (w.available_account_id, w.reserved_account_id)
             WHERE t.retired_at IS NOT NULL
            UNION
            -- A retired Project's Business is retired only when nothing else still
            -- uses it (SANDBOX-DELETE-001): a shared Business stays ACTIVE.
            SELECT 'RETIRED_PROJECT_BUSINESS', a.id
              FROM sandbox_retired_projects r
              JOIN merchants m       ON m.id = r.merchant_id AND m.status <> 'ACTIVE'
              JOIN wallets w         ON w.merchant_id = r.merchant_id
              JOIN ledger_accounts a ON a.id IN (w.available_account_id, w.reserved_account_id)
            UNION
            SELECT 'RETIRED_PROJECT_BUSINESS', wa.account_id
              FROM sandbox_retired_projects r
              JOIN merchants m        ON m.id = r.merchant_id AND m.status <> 'ACTIVE'
              JOIN wallet_accounts wa ON wa.merchant_id = r.merchant_id
            UNION
            SELECT 'CLOSED_WALLET_ACCOUNT', wa.account_id
              FROM wallet_accounts wa WHERE wa.status = 'CLOSED'
        )
        SELECT r.kind, a.currency::text, COALESCE(SUM(b.owed), 0)::bigint, COUNT(*)::bigint
          FROM retired r
          JOIN bal b             ON b.account_id = r.account_id AND b.owed <> 0
          JOIN ledger_accounts a ON a.id = r.account_id
         GROUP BY r.kind, a.currency
        "#,
    )
    .fetch_all(pool)
    .await?;
    for (kind, currency, amount, count) in rows {
        findings.push(IntegrityFinding {
            code: "RETIRED_RESOURCE_HOLDS_VALUE",
            currency,
            amount_minor: amount,
            count,
            detail: format!("{count} {kind} account(s) still hold value"),
        });
    }
    Ok(())
}

/// The latest boundary reconciliation, and what in it is severe: evidence of a
/// movement Banzami did not make, a provider executing the same reference twice,
/// an executed operation Banzami still holds as pending or failed, or amounts
/// that disagree.
/// id, period_start, period_end, counts, unreconciled amount, created_at.
type RunRow = (
    uuid::Uuid,
    DateTime<Utc>,
    DateTime<Utc>,
    serde_json::Value,
    i64,
    DateTime<Utc>,
);

async fn latest_reconciliation(
    pool: &PgPool,
    findings: &mut Vec<IntegrityFinding>,
) -> Result<Option<ReconciliationSummary>, sqlx::Error> {
    let run: Option<RunRow> = sqlx::query_as(
        "SELECT id, period_start, period_end, counts, unreconciled_amount_minor, created_at
           FROM boundary_reconciliation_runs ORDER BY created_at DESC LIMIT 1",
    )
    .fetch_optional(pool)
    .await?;
    let Some((run_id, period_start, period_end, counts, unreconciled, created_at)) = run else {
        return Ok(None);
    };
    let severe: Vec<(String, String, i64, i64)> = sqlx::query_as(
        r#"
        SELECT outcome, currency,
               COALESCE(SUM(ABS(COALESCE(NULLIF(difference_amount_minor, 0), internal_amount_minor, external_amount_minor))), 0)::bigint,
               COUNT(*)::bigint
          FROM boundary_reconciliation_items
         WHERE run_id = $1 AND outcome NOT IN ('MATCHED', 'PENDING')
         GROUP BY outcome, currency
        "#,
    )
    .bind(run_id)
    .fetch_all(pool)
    .await?;
    for (outcome, currency, amount, count) in severe {
        let code: &'static str = match outcome.as_str() {
            "DUPLICATE_EXTERNAL" => "BOUNDARY_DUPLICATE_EXTERNAL",
            "MISSING_INTERNAL" => "BOUNDARY_EXTERNAL_WITHOUT_OPERATION",
            "MISSING_EXTERNAL" => "BOUNDARY_OPERATION_WITHOUT_EVIDENCE",
            "REQUIRES_REVIEW" => "BOUNDARY_REQUIRES_REVIEW",
            "CURRENCY_MISMATCH" => "BOUNDARY_CURRENCY_MISMATCH",
            _ => "BOUNDARY_AMOUNT_MISMATCH",
        };
        findings.push(IntegrityFinding {
            code,
            currency,
            amount_minor: amount,
            count,
            detail: format!("{count} {outcome} item(s) in reconciliation run {run_id}"),
        });
    }
    Ok(Some(ReconciliationSummary {
        run_id,
        period_start,
        period_end,
        counts,
        unreconciled_amount_minor: unreconciled,
        created_at,
    }))
}
