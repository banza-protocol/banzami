use chrono::Utc;

use banzami_types::{Currency, ReconciliationRunId, SettlementId};

use crate::{
    repository::ReconciliationRepository,
    ExternalStatementLine, ReconciliationError, ReconciliationRecord, ReconciliationReport,
    ReconciliationStatus,
};

// ---------------------------------------------------------------------------
// Minimal settlement view — avoids a hard dependency on banzami-settlement
// ---------------------------------------------------------------------------

/// Internal settlement record passed to the reconciliation engine by the caller.
/// The caller fetches settlements from the settlement repository; the reconciliation
/// engine is intentionally independent of the settlement crate.
#[derive(Debug, Clone)]
pub struct SettlementView {
    pub settlement_id: SettlementId,
    /// Net amount (after fees) in minor units — what the acquirer should transfer.
    pub net_amount_minor: i64,
    pub currency: Currency,
}

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------

#[allow(async_fn_in_trait)]
pub trait ReconciliationEngine: Send + Sync {
    /// Compare internal settlements against external statement lines.
    ///
    /// Matching strategy: greedy first-match by (amount_minor, currency).
    /// Unmatched internal records → MissingExternal.
    /// Unmatched external lines → MissingInternal.
    /// Amount differs → AmountMismatch.
    ///
    /// The caller is responsible for supplying settlements scoped to the same
    /// period as the external statement.
    async fn run(
        &self,
        external_lines:       Vec<ExternalStatementLine>,
        internal_settlements: Vec<SettlementView>,
    ) -> Result<ReconciliationReport, ReconciliationError>;

    async fn get_report(
        &self,
        run_id: ReconciliationRunId,
    ) -> Result<ReconciliationReport, ReconciliationError>;
}

// ---------------------------------------------------------------------------
// Production implementation
// ---------------------------------------------------------------------------

pub struct StaticReconciliationEngine<R: ReconciliationRepository> {
    repo: R,
}

impl<R: ReconciliationRepository> StaticReconciliationEngine<R> {
    pub fn new(repo: R) -> Self {
        Self { repo }
    }
}

impl<R: ReconciliationRepository> ReconciliationEngine for StaticReconciliationEngine<R> {
    async fn run(
        &self,
        external_lines:       Vec<ExternalStatementLine>,
        internal_settlements: Vec<SettlementView>,
    ) -> Result<ReconciliationReport, ReconciliationError> {
        let run_id    = ReconciliationRunId::new();
        let now       = Utc::now();
        let mut records: Vec<ReconciliationRecord> = Vec::new();

        // Track which external lines have been consumed.
        let mut consumed = vec![false; external_lines.len()];

        // --- Match each internal settlement against an external line ---
        for settlement in &internal_settlements {
            let currency_code = settlement.currency.code();
            let matched_idx = external_lines
                .iter()
                .enumerate()
                .find(|(i, ext)| {
                    !consumed[*i]
                        && ext.currency == currency_code
                        && ext.amount_minor == settlement.net_amount_minor
                });

            if let Some((idx, ext)) = matched_idx {
                consumed[idx] = true;
                records.push(ReconciliationRecord {
                    run_id,
                    settlement_id:     Some(settlement.settlement_id),
                    transaction_id:    None,
                    external_ref:      Some(ext.reference.clone()),
                    internal_minor:    Some(settlement.net_amount_minor),
                    external_minor:    Some(ext.amount_minor),
                    currency:          currency_code.to_owned(),
                    status:            ReconciliationStatus::Matched,
                    discrepancy_minor: 0,
                    reconciled_at:     now,
                });
            } else {
                // Check if there's a mismatched amount (same currency, any amount).
                let mismatch_idx = external_lines.iter().enumerate().find(|(i, ext)| {
                    !consumed[*i] && ext.currency == currency_code
                });

                if let Some((idx, ext)) = mismatch_idx {
                    consumed[idx] = true;
                    let discrepancy = ext.amount_minor - settlement.net_amount_minor;
                    records.push(ReconciliationRecord {
                        run_id,
                        settlement_id:     Some(settlement.settlement_id),
                        transaction_id:    None,
                        external_ref:      Some(ext.reference.clone()),
                        internal_minor:    Some(settlement.net_amount_minor),
                        external_minor:    Some(ext.amount_minor),
                        currency:          currency_code.to_owned(),
                        status:            ReconciliationStatus::AmountMismatch,
                        discrepancy_minor: discrepancy,
                        reconciled_at:     now,
                    });
                } else {
                    // No matching external line at all.
                    records.push(ReconciliationRecord {
                        run_id,
                        settlement_id:     Some(settlement.settlement_id),
                        transaction_id:    None,
                        external_ref:      None,
                        internal_minor:    Some(settlement.net_amount_minor),
                        external_minor:    None,
                        currency:          currency_code.to_owned(),
                        status:            ReconciliationStatus::MissingExternal,
                        discrepancy_minor: -settlement.net_amount_minor,
                        reconciled_at:     now,
                    });
                }
            }
        }

        // --- Remaining unconsumed external lines have no internal match ---
        for (i, ext) in external_lines.iter().enumerate() {
            if !consumed[i] {
                records.push(ReconciliationRecord {
                    run_id,
                    settlement_id:     None,
                    transaction_id:    None,
                    external_ref:      Some(ext.reference.clone()),
                    internal_minor:    None,
                    external_minor:    Some(ext.amount_minor),
                    currency:          ext.currency.clone(),
                    status:            ReconciliationStatus::MissingInternal,
                    discrepancy_minor: ext.amount_minor,
                    reconciled_at:     now,
                });
            }
        }

        // --- Compute summary ---
        let total_checked     = records.len() as u64;
        let matched           = records.iter().filter(|r| r.status == ReconciliationStatus::Matched).count() as u64;
        let missing_external  = records.iter().filter(|r| r.status == ReconciliationStatus::MissingExternal).count() as u64;
        let missing_internal  = records.iter().filter(|r| r.status == ReconciliationStatus::MissingInternal).count() as u64;
        let amount_mismatches = records.iter().filter(|r| r.status == ReconciliationStatus::AmountMismatch).count() as u64;
        let total_discrepancy_minor: i64 = records.iter().map(|r| r.discrepancy_minor.abs()).sum();

        let report = ReconciliationReport {
            run_id,
            total_checked,
            matched,
            missing_external,
            missing_internal,
            amount_mismatches,
            records: records.clone(),
            total_discrepancy_minor,
            generated_at: now,
        };

        self.repo.save_report(&report).await?;
        Ok(report)
    }

    async fn get_report(
        &self,
        run_id: ReconciliationRunId,
    ) -> Result<ReconciliationReport, ReconciliationError> {
        self.repo.get_report(run_id).await
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use banzami_types::{Currency, ReconciliationRunId, SettlementId};

    use super::*;
    use crate::{ReconciliationError, ReconciliationReport, ReconciliationStatus};

    // -----------------------------------------------------------------------
    // In-memory mock repository
    // -----------------------------------------------------------------------

    struct MockReconRepo {
        reports: Mutex<Vec<ReconciliationReport>>,
    }

    impl MockReconRepo {
        fn new() -> Self { Self { reports: Mutex::new(vec![]) } }
    }

    impl ReconciliationRepository for MockReconRepo {
        async fn save_report(&self, report: &ReconciliationReport) -> Result<(), ReconciliationError> {
            self.reports.lock().unwrap().push(report.clone());
            Ok(())
        }

        async fn get_report(
            &self,
            run_id: ReconciliationRunId,
        ) -> Result<ReconciliationReport, ReconciliationError> {
            self.reports
                .lock()
                .unwrap()
                .iter()
                .find(|r| r.run_id == run_id)
                .cloned()
                .ok_or(ReconciliationError::ParseError("run not found".into()))
        }
    }

    fn engine() -> StaticReconciliationEngine<MockReconRepo> {
        StaticReconciliationEngine::new(MockReconRepo::new())
    }

    fn ext(reference: &str, amount: i64) -> ExternalStatementLine {
        ExternalStatementLine {
            reference:    reference.into(),
            amount_minor: amount,
            currency:     "AOA".into(),
            posted_at:    Utc::now(),
        }
    }

    fn int(amount: i64) -> SettlementView {
        SettlementView {
            settlement_id:   SettlementId::new(),
            net_amount_minor: amount,
            currency:        Currency::AOA,
        }
    }

    #[tokio::test]
    async fn perfect_match_is_reported_as_matched() {
        let report = engine().run(vec![ext("REF-001", 100_000)], vec![int(100_000)]).await.unwrap();
        assert_eq!(report.matched, 1);
        assert_eq!(report.total_checked, 1);
        assert_eq!(report.total_discrepancy_minor, 0);
        assert_eq!(report.records[0].status, ReconciliationStatus::Matched);
    }

    #[tokio::test]
    async fn internal_with_no_external_is_missing_external() {
        let report = engine().run(vec![], vec![int(50_000)]).await.unwrap();
        assert_eq!(report.missing_external, 1);
        assert_eq!(report.total_discrepancy_minor, 50_000);
    }

    #[tokio::test]
    async fn external_with_no_internal_is_missing_internal() {
        let report = engine().run(vec![ext("REF-X", 75_000)], vec![]).await.unwrap();
        assert_eq!(report.missing_internal, 1);
        assert_eq!(report.total_discrepancy_minor, 75_000);
    }

    #[tokio::test]
    async fn amount_mismatch_is_detected() {
        let report = engine()
            .run(vec![ext("REF-M", 90_000)], vec![int(100_000)])
            .await
            .unwrap();
        assert_eq!(report.amount_mismatches, 1);
        assert_eq!(report.records[0].discrepancy_minor, -10_000); // external < internal
        assert_eq!(report.total_discrepancy_minor, 10_000);
    }

    #[tokio::test]
    async fn multiple_settlements_all_matched() {
        let report = engine()
            .run(
                vec![ext("A", 100_000), ext("B", 200_000), ext("C", 50_000)],
                vec![int(200_000), int(100_000), int(50_000)],
            )
            .await
            .unwrap();
        assert_eq!(report.matched, 3);
        assert_eq!(report.total_discrepancy_minor, 0);
    }

    #[tokio::test]
    async fn report_is_persisted_and_retrievable() {
        let eng = engine();
        let report = eng.run(vec![ext("R1", 10_000)], vec![int(10_000)]).await.unwrap();
        let fetched = eng.get_report(report.run_id).await.unwrap();
        assert_eq!(fetched.run_id, report.run_id);
        assert_eq!(fetched.matched, 1);
    }
}
