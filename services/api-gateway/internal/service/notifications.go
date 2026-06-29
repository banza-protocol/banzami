package service

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NotificationSummary holds the per-section pending counts that drive the
// BANZADMIN sidebar badges. Counts only — no PII, no row detail.
type NotificationSummary struct {
	PendingKybDocuments        int `json:"pending_kyb_documents"`
	PendingKycDocuments        int `json:"pending_kyc_documents"`
	PendingBusinessApplications int `json:"pending_business_applications"`
	FailedAppSettlements       int `json:"failed_app_settlements"`
	OpenDisputes               int `json:"open_disputes"`
	PendingReconciliations     int `json:"pending_reconciliations"`
}

// NotificationsService computes the review-queue summary from the gateway's
// database (the same DB the KYB/applications data lives in). The admin-api routes
// to the live or staging gateway per the environment toggle.
type NotificationsService struct {
	pool *pgxpool.Pool
}

func NewNotificationsService(pool *pgxpool.Pool) *NotificationsService {
	return &NotificationsService{pool: pool}
}

// Summary runs one round-trip of independent counts. Predicates are chosen to be
// robust to status-vocabulary differences (e.g. KYC uses "unreviewed" rather than
// a single status value).
func (s *NotificationsService) Summary(ctx context.Context) (NotificationSummary, error) {
	var out NotificationSummary
	err := s.pool.QueryRow(ctx, `
		SELECT
		  (SELECT count(*) FROM merchant_kyb_documents WHERE status = 'PENDING_REVIEW'),
		  (SELECT count(*) FROM kyc_cases
		     WHERE reviewed_at IS NULL
		       AND status NOT IN ('APPROVED','REJECTED','EXPIRED','CANCELLED')),
		  (SELECT count(*) FROM merchant_applications
		     WHERE status IN ('SUBMITTED','UNDER_REVIEW','PENDING','PENDING_REVIEW')),
		  (SELECT count(*) FROM app_settlements WHERE status = 'FAILED'),
		  (SELECT count(*) FROM disputes WHERE status = 'OPEN'),
		  (SELECT count(*) FROM acquiring_reconciliation_runs WHERE status = 'PENDING')
	`).Scan(
		&out.PendingKybDocuments,
		&out.PendingKycDocuments,
		&out.PendingBusinessApplications,
		&out.FailedAppSettlements,
		&out.OpenDisputes,
		&out.PendingReconciliations,
	)
	return out, err
}
