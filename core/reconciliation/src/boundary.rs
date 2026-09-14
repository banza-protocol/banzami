//! Boundary reconciliation (MONEY-MODEL-001, ADR-063).
//!
//! Value enters and leaves Banzami only across an external rail: a funding
//! confirmed by an acquirer, a withdrawal a bank executed, an acquirer settling
//! what it held to the backing account. Each of those has a Banzami operation
//! and, eventually, external evidence — a statement line, a provider report.
//! This module compares the two, by the reference both carry, and classifies
//! every difference:
//!
//! | Outcome              | Banzami says            | Evidence says                    |
//! |----------------------|-------------------------|----------------------------------|
//! | `MATCHED`            | confirmed               | executed, same amount and currency |
//! | `AMOUNT_MISMATCH`    | confirmed               | executed, another amount         |
//! | `CURRENCY_MISMATCH`  | confirmed               | executed, another currency       |
//! | `MISSING_EXTERNAL`   | confirmed               | nothing                          |
//! | `MISSING_INTERNAL`   | nothing                 | executed                         |
//! | `DUPLICATE_EXTERNAL` | —                       | the same reference again         |
//! | `PENDING`            | waiting for the rail    | nothing yet                      |
//! | `REQUIRES_REVIEW`    | waiting, or failed      | executed                         |
//!
//! It never corrects anything. Every statement it runs against financial state
//! is a SELECT; what it writes is its own report. A run over the same period,
//! the same evidence and the same operation states is the same run: its digest
//! is unique, so running it again creates nothing. A correction is always a new balanced operation
//! through Core — a late confirmation through the operation's own lifecycle,
//! never an edit.

use std::collections::{BTreeMap, HashMap};

use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

/// Which way value crossed the boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BoundaryKind {
    /// Value confirmed by an acquirer or provider (hosted payment, deposit).
    CashIn,
    /// A withdrawal executed by a bank.
    CashOut,
    /// An acquirer settling what it held to the backing account.
    AcquirerSettlement,
}

/// What Banzami knows about its side of a boundary operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum InternalState {
    Pending,
    Confirmed,
    Failed,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BoundaryOperation {
    pub kind: BoundaryKind,
    pub operation_id: Uuid,
    /// The reference the rail knows this operation by.
    pub external_ref: String,
    pub amount_minor: i64,
    pub currency: String,
    pub state: InternalState,
}

/// One line of external evidence.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ExternalEvidence {
    /// Who reported it: a bank, an acquirer, a provider. Adapter-level.
    pub source: String,
    pub kind: BoundaryKind,
    pub external_ref: String,
    pub amount_minor: i64,
    pub currency: String,
    pub occurred_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BoundaryOutcome {
    Matched,
    AmountMismatch,
    CurrencyMismatch,
    MissingExternal,
    MissingInternal,
    DuplicateExternal,
    Pending,
    RequiresReview,
}

impl BoundaryOutcome {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Matched => "MATCHED",
            Self::AmountMismatch => "AMOUNT_MISMATCH",
            Self::CurrencyMismatch => "CURRENCY_MISMATCH",
            Self::MissingExternal => "MISSING_EXTERNAL",
            Self::MissingInternal => "MISSING_INTERNAL",
            Self::DuplicateExternal => "DUPLICATE_EXTERNAL",
            Self::Pending => "PENDING",
            Self::RequiresReview => "REQUIRES_REVIEW",
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BoundaryItem {
    pub outcome: BoundaryOutcome,
    pub kind: BoundaryKind,
    pub operation_id: Option<Uuid>,
    pub external_ref: String,
    pub internal_minor: Option<i64>,
    pub external_minor: Option<i64>,
    pub currency: String,
    /// external − internal, where both exist.
    pub difference_minor: i64,
}

/// Compare operations and evidence. Pure: the same inputs give the same items,
/// in the same order.
pub fn reconcile(
    operations: &[BoundaryOperation],
    evidence: &[ExternalEvidence],
) -> Vec<BoundaryItem> {
    let key = |k: BoundaryKind, r: &str| (k as u8, r.to_owned());
    // Evidence grouped by (kind, reference), in a stable order.
    let mut by_ref: BTreeMap<(u8, String), Vec<&ExternalEvidence>> = BTreeMap::new();
    for e in evidence {
        by_ref
            .entry(key(e.kind, &e.external_ref))
            .or_default()
            .push(e);
    }
    let mut items = Vec::new();
    let mut seen: HashMap<(u8, String), ()> = HashMap::new();

    let mut ops: Vec<&BoundaryOperation> = operations.iter().collect();
    ops.sort_by(|a, b| {
        (a.kind as u8, &a.external_ref, a.operation_id).cmp(&(
            b.kind as u8,
            &b.external_ref,
            b.operation_id,
        ))
    });

    for op in ops {
        let k = key(op.kind, &op.external_ref);
        let lines = by_ref.get(&k);
        let first = lines.and_then(|l| l.first()).copied();
        seen.insert(k, ());
        let item = |outcome, external: Option<&ExternalEvidence>| BoundaryItem {
            outcome,
            kind: op.kind,
            operation_id: Some(op.operation_id),
            external_ref: op.external_ref.clone(),
            internal_minor: Some(op.amount_minor),
            external_minor: external.map(|e| e.amount_minor),
            currency: op.currency.clone(),
            difference_minor: external
                .map(|e| e.amount_minor - op.amount_minor)
                .unwrap_or(0),
        };
        let outcome = match (op.state, first) {
            (InternalState::Confirmed, Some(e)) if e.currency != op.currency => {
                BoundaryOutcome::CurrencyMismatch
            }
            (InternalState::Confirmed, Some(e)) if e.amount_minor != op.amount_minor => {
                BoundaryOutcome::AmountMismatch
            }
            (InternalState::Confirmed, Some(_)) => BoundaryOutcome::Matched,
            (InternalState::Confirmed, None) => BoundaryOutcome::MissingExternal,
            // The rail says it executed and Banzami has not confirmed it — or
            // failed it. Either is resolved through the operation's own
            // lifecycle by a person, never automatically here.
            (InternalState::Pending | InternalState::Failed, Some(_)) => {
                BoundaryOutcome::RequiresReview
            }
            (InternalState::Pending, None) => BoundaryOutcome::Pending,
            (InternalState::Failed, None) => continue,
        };
        items.push(item(outcome, first));
        if let Some(lines) = lines {
            for dup in lines.iter().skip(1) {
                items.push(BoundaryItem {
                    outcome: BoundaryOutcome::DuplicateExternal,
                    kind: dup.kind,
                    operation_id: Some(op.operation_id),
                    external_ref: dup.external_ref.clone(),
                    internal_minor: Some(op.amount_minor),
                    external_minor: Some(dup.amount_minor),
                    currency: dup.currency.clone(),
                    difference_minor: dup.amount_minor,
                });
            }
        }
    }

    for (k, lines) in &by_ref {
        if seen.contains_key(k) {
            continue;
        }
        for (i, e) in lines.iter().enumerate() {
            items.push(BoundaryItem {
                outcome: if i == 0 {
                    BoundaryOutcome::MissingInternal
                } else {
                    BoundaryOutcome::DuplicateExternal
                },
                kind: e.kind,
                operation_id: None,
                external_ref: e.external_ref.clone(),
                internal_minor: None,
                external_minor: Some(e.amount_minor),
                currency: e.currency.clone(),
                difference_minor: e.amount_minor,
            });
        }
    }
    items
}

/// A stable digest of a run's inputs: the period, the evidence and the state of
/// the operations it is compared with, each in a canonical order. The same inputs
/// are the same run; a late confirmation changes an operation, and so the run.
pub fn inputs_digest(
    period_start: DateTime<Utc>,
    period_end: DateTime<Utc>,
    operations: &[BoundaryOperation],
    evidence: &[ExternalEvidence],
) -> String {
    let mut ops: Vec<String> = operations
        .iter()
        .map(|o| {
            format!(
                "op|{:?}|{}|{}|{}|{}|{:?}",
                o.kind, o.operation_id, o.external_ref, o.amount_minor, o.currency, o.state
            )
        })
        .collect();
    ops.sort();
    let mut lines: Vec<String> = evidence
        .iter()
        .map(|e| {
            format!(
                "{}|{:?}|{}|{}|{}|{}",
                e.source,
                e.kind,
                e.external_ref,
                e.amount_minor,
                e.currency,
                e.occurred_at.timestamp_micros()
            )
        })
        .collect();
    lines.sort();
    let mut h = Sha256::new();
    h.update(period_start.timestamp_micros().to_string());
    h.update("|");
    h.update(period_end.timestamp_micros().to_string());
    for l in lines.into_iter().chain(ops) {
        h.update("\n");
        h.update(l);
    }
    hex::encode(h.finalize())
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BoundaryRun {
    pub run_id: Uuid,
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
    pub inputs_digest: String,
    /// False when this exact run already existed and was returned as it was.
    pub created: bool,
    pub counts: BTreeMap<String, i64>,
    /// Σ |difference| over every item that is not MATCHED or PENDING.
    pub unreconciled_minor: i64,
    pub items: Vec<BoundaryItem>,
}

/// The boundary operations Banzami recorded in a period — read-only.
///
/// References: a hosted payment and a deposit by the provider's `external_ref`;
/// a withdrawal and an acquirer settlement by their Banzami id, which is the
/// reference they are submitted under.
pub async fn load_operations(
    pool: &PgPool,
    period_start: DateTime<Utc>,
    period_end: DateTime<Utc>,
) -> Result<Vec<BoundaryOperation>, sqlx::Error> {
    let rows: Vec<(String, Uuid, String, i64, String, String)> = sqlx::query_as(
        r#"
        SELECT 'CASH_IN', id, external_ref, amount_minor, currency::text, status
          FROM acquiring_payments WHERE created_at >= $1 AND created_at < $2
        UNION ALL
        SELECT 'CASH_IN', id, external_ref, amount_minor, currency::text, status
          FROM consumer_deposits WHERE created_at >= $1 AND created_at < $2 AND external_ref IS NOT NULL
        UNION ALL
        SELECT 'CASH_OUT', id, id::text, COALESCE(net_minor, amount_minor), currency::text, status
          FROM payouts WHERE created_at >= $1 AND created_at < $2
        UNION ALL
        SELECT 'ACQUIRER_SETTLEMENT', id, id::text, net_amount_minor, currency::text, status
          FROM settlements WHERE created_at >= $1 AND created_at < $2
        "#,
    )
    .bind(period_start)
    .bind(period_end)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(
            |(kind, id, external_ref, amount, currency, status)| BoundaryOperation {
                kind: match kind.as_str() {
                    "CASH_IN" => BoundaryKind::CashIn,
                    "CASH_OUT" => BoundaryKind::CashOut,
                    _ => BoundaryKind::AcquirerSettlement,
                },
                operation_id: id,
                external_ref,
                amount_minor: amount,
                currency,
                state: match status.as_str() {
                    "CONFIRMED" | "COMPLETED" | "SETTLED" => InternalState::Confirmed,
                    "FAILED" | "EXPIRED" | "RETURNED" | "CANCELLED" => InternalState::Failed,
                    _ => InternalState::Pending,
                },
            },
        )
        .collect())
}

/// Reconcile a period against the evidence and record the report. Idempotent:
/// the same period and evidence return the run already recorded.
pub async fn run_boundary_reconciliation(
    pool: &PgPool,
    period_start: DateTime<Utc>,
    period_end: DateTime<Utc>,
    evidence: &[ExternalEvidence],
) -> Result<BoundaryRun, sqlx::Error> {
    let operations = load_operations(pool, period_start, period_end).await?;
    let digest = inputs_digest(period_start, period_end, &operations, evidence);
    let items = reconcile(&operations, evidence);
    let mut counts: BTreeMap<String, i64> = BTreeMap::new();
    let mut unreconciled = 0i64;
    for i in &items {
        *counts.entry(i.outcome.as_str().to_owned()).or_default() += 1;
        if !matches!(
            i.outcome,
            BoundaryOutcome::Matched | BoundaryOutcome::Pending
        ) {
            unreconciled += at_stake(i);
        }
    }

    let mut tx = pool.begin().await?;
    let inserted: Option<(Uuid,)> = sqlx::query_as(
        r#"
        INSERT INTO boundary_reconciliation_runs
               (id, period_start, period_end, inputs_digest, evidence_lines, counts, unreconciled_amount_minor)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
        ON CONFLICT (period_start, period_end, inputs_digest) DO NOTHING
        RETURNING id
        "#,
    )
    .bind(period_start)
    .bind(period_end)
    .bind(&digest)
    .bind(evidence.len() as i64)
    .bind(serde_json::to_value(&counts).unwrap_or_default())
    .bind(unreconciled)
    .fetch_optional(&mut *tx)
    .await?;

    let Some((run_id,)) = inserted else {
        tx.rollback().await?;
        return existing_run(pool, period_start, period_end, &digest).await;
    };
    for i in &items {
        sqlx::query(
            r#"
            INSERT INTO boundary_reconciliation_items
                   (run_id, outcome, kind, operation_id, external_ref, internal_amount_minor, external_amount_minor, currency, difference_amount_minor)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            "#,
        )
        .bind(run_id)
        .bind(i.outcome.as_str())
        .bind(kind_str(i.kind))
        .bind(i.operation_id)
        .bind(&i.external_ref)
        .bind(i.internal_minor)
        .bind(i.external_minor)
        .bind(&i.currency)
        .bind(i.difference_minor)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(BoundaryRun {
        run_id,
        period_start,
        period_end,
        inputs_digest: digest,
        created: true,
        counts,
        unreconciled_minor: unreconciled,
        items,
    })
}

/// How much an unreconciled item puts in question: the difference when both
/// sides disagree on the amount, otherwise the whole amount on either side.
fn at_stake(i: &BoundaryItem) -> i64 {
    match (i.internal_minor, i.external_minor) {
        (Some(a), Some(b)) if a != b && i.outcome == BoundaryOutcome::AmountMismatch => {
            (b - a).abs()
        }
        (_, Some(b)) if i.outcome == BoundaryOutcome::DuplicateExternal => b.abs(),
        (Some(a), _) => a.abs(),
        (None, Some(b)) => b.abs(),
        (None, None) => 0,
    }
}

fn kind_str(k: BoundaryKind) -> &'static str {
    match k {
        BoundaryKind::CashIn => "CASH_IN",
        BoundaryKind::CashOut => "CASH_OUT",
        BoundaryKind::AcquirerSettlement => "ACQUIRER_SETTLEMENT",
    }
}

/// outcome, kind, operation_id, external_ref, internal, external, currency, difference.
type ItemRow = (
    String,
    String,
    Option<Uuid>,
    String,
    Option<i64>,
    Option<i64>,
    String,
    i64,
);

async fn existing_run(
    pool: &PgPool,
    period_start: DateTime<Utc>,
    period_end: DateTime<Utc>,
    digest: &str,
) -> Result<BoundaryRun, sqlx::Error> {
    let (run_id, counts, unreconciled): (Uuid, serde_json::Value, i64) = sqlx::query_as(
        "SELECT id, counts, unreconciled_amount_minor FROM boundary_reconciliation_runs
          WHERE period_start = $1 AND period_end = $2 AND inputs_digest = $3",
    )
    .bind(period_start)
    .bind(period_end)
    .bind(digest)
    .fetch_one(pool)
    .await?;
    let rows: Vec<ItemRow> = sqlx::query_as(
        "SELECT outcome, kind, operation_id, external_ref, internal_amount_minor, external_amount_minor, currency, difference_amount_minor
           FROM boundary_reconciliation_items WHERE run_id = $1 ORDER BY id",
    )
    .bind(run_id)
    .fetch_all(pool)
    .await?;
    let items = rows
        .into_iter()
        .map(
            |(
                outcome,
                kind,
                operation_id,
                external_ref,
                internal_minor,
                external_minor,
                currency,
                difference_minor,
            )| BoundaryItem {
                outcome: match outcome.as_str() {
                    "MATCHED" => BoundaryOutcome::Matched,
                    "AMOUNT_MISMATCH" => BoundaryOutcome::AmountMismatch,
                    "CURRENCY_MISMATCH" => BoundaryOutcome::CurrencyMismatch,
                    "MISSING_EXTERNAL" => BoundaryOutcome::MissingExternal,
                    "MISSING_INTERNAL" => BoundaryOutcome::MissingInternal,
                    "DUPLICATE_EXTERNAL" => BoundaryOutcome::DuplicateExternal,
                    "PENDING" => BoundaryOutcome::Pending,
                    _ => BoundaryOutcome::RequiresReview,
                },
                kind: match kind.as_str() {
                    "CASH_IN" => BoundaryKind::CashIn,
                    "CASH_OUT" => BoundaryKind::CashOut,
                    _ => BoundaryKind::AcquirerSettlement,
                },
                operation_id,
                external_ref,
                internal_minor,
                external_minor,
                currency,
                difference_minor,
            },
        )
        .collect();
    Ok(BoundaryRun {
        run_id,
        period_start,
        period_end,
        inputs_digest: digest.to_owned(),
        created: false,
        counts: serde_json::from_value(counts).unwrap_or_default(),
        unreconciled_minor: unreconciled,
        items,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn op(kind: BoundaryKind, r: &str, amount: i64, state: InternalState) -> BoundaryOperation {
        BoundaryOperation {
            kind,
            operation_id: Uuid::new_v4(),
            external_ref: r.into(),
            amount_minor: amount,
            currency: "AOA".into(),
            state,
        }
    }

    fn ev(kind: BoundaryKind, r: &str, amount: i64, currency: &str) -> ExternalEvidence {
        ExternalEvidence {
            source: "SANDBOX_SYNTHETIC_BANK".into(),
            kind,
            external_ref: r.into(),
            amount_minor: amount,
            currency: currency.into(),
            occurred_at: DateTime::<Utc>::from_timestamp(1_789_000_000, 0).unwrap(),
        }
    }

    fn outcome(items: &[BoundaryItem], r: &str) -> Vec<BoundaryOutcome> {
        items
            .iter()
            .filter(|i| i.external_ref == r)
            .map(|i| i.outcome)
            .collect()
    }

    use BoundaryKind::*;
    use BoundaryOutcome as O;
    use InternalState::*;

    #[test]
    fn every_outcome_for_the_difference_it_names() {
        let ops = [
            op(CashIn, "match", 1_000, Confirmed),
            op(CashIn, "amount", 1_000, Confirmed),
            op(CashIn, "currency", 1_000, Confirmed),
            op(CashOut, "missing-ext", 2_000, Confirmed),
            op(CashOut, "pending", 2_000, Pending),
            op(CashOut, "late", 2_000, Pending),
            op(CashOut, "failed-but-executed", 2_000, Failed),
            op(CashOut, "failed", 2_000, Failed),
            op(CashIn, "dup", 500, Confirmed),
        ];
        let evidence = [
            ev(CashIn, "match", 1_000, "AOA"),
            ev(CashIn, "amount", 900, "AOA"),
            ev(CashIn, "currency", 1_000, "USD"),
            ev(CashOut, "late", 2_000, "AOA"),
            ev(CashOut, "failed-but-executed", 2_000, "AOA"),
            ev(CashIn, "unknown", 700, "AOA"),
            ev(CashIn, "dup", 500, "AOA"),
            ev(CashIn, "dup", 500, "AOA"),
        ];
        let items = reconcile(&ops, &evidence);
        assert_eq!(outcome(&items, "match"), [O::Matched]);
        assert_eq!(outcome(&items, "amount"), [O::AmountMismatch]);
        assert_eq!(
            items
                .iter()
                .find(|i| i.external_ref == "amount")
                .unwrap()
                .difference_minor,
            -100
        );
        assert_eq!(outcome(&items, "currency"), [O::CurrencyMismatch]);
        assert_eq!(outcome(&items, "missing-ext"), [O::MissingExternal]);
        assert_eq!(outcome(&items, "pending"), [O::Pending]);
        assert_eq!(outcome(&items, "late"), [O::RequiresReview]);
        assert_eq!(outcome(&items, "failed-but-executed"), [O::RequiresReview]);
        assert!(
            outcome(&items, "failed").is_empty(),
            "a failure the rail agrees with is not a difference"
        );
        assert_eq!(outcome(&items, "unknown"), [O::MissingInternal]);
        assert_eq!(outcome(&items, "dup"), [O::Matched, O::DuplicateExternal]);
    }

    #[test]
    fn the_same_inputs_in_another_order_are_the_same_run() {
        let a = ev(CashIn, "a", 1, "AOA");
        let b = ev(CashOut, "b", 2, "AOA");
        let s = DateTime::<Utc>::from_timestamp(0, 0).unwrap();
        let e = DateTime::<Utc>::from_timestamp(86_400, 0).unwrap();
        let mut pending = op(CashOut, "b", 2, Pending);
        let x = op(CashIn, "a", 1, Confirmed);
        assert_eq!(
            inputs_digest(s, e, &[x.clone(), pending.clone()], &[a.clone(), b.clone()]),
            inputs_digest(s, e, &[pending.clone(), x.clone()], &[b.clone(), a.clone()])
        );
        assert_ne!(
            inputs_digest(s, e, &[], std::slice::from_ref(&a)),
            inputs_digest(s, e, &[], &[a.clone(), b.clone()])
        );
        // A late confirmation changes the operation, and so the run.
        let before = inputs_digest(
            s,
            e,
            std::slice::from_ref(&pending),
            std::slice::from_ref(&b),
        );
        pending.state = Confirmed;
        assert_ne!(before, inputs_digest(s, e, &[pending], &[b]));
    }

    #[test]
    fn a_reference_is_matched_within_its_kind() {
        // A cash-out and a cash-in may share a reference string; they are not
        // evidence for each other.
        let items = reconcile(
            &[op(CashOut, "r1", 1_000, Confirmed)],
            &[ev(CashIn, "r1", 1_000, "AOA")],
        );
        let got: Vec<_> = items.iter().map(|i| (i.kind, i.outcome)).collect();
        assert_eq!(
            got,
            [(CashOut, O::MissingExternal), (CashIn, O::MissingInternal)]
        );
    }
}
