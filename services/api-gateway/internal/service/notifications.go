package service

import (
	"context"
	"fmt"
	"strings"

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

// summaryCount pairs a review-queue metric with the table + count expression that
// computes it. The table is named separately so Summary can skip any metric whose
// table is not present in this database (counting it as 0) — different operator
// environments provision different subsets (e.g. live has no `disputes` table),
// and Postgres parses every relation referenced in a query even inside an untaken
// branch, so a missing table must be excluded from the SQL text, not guarded with
// CASE. Predicates are chosen to be robust to status-vocabulary differences.
var summaryCounts = []struct {
	table string
	expr  string
}{
	{"merchant_kyb_documents", "(SELECT count(*) FROM merchant_kyb_documents WHERE status = 'PENDING_REVIEW')"},
	{"kyc_cases", "(SELECT count(*) FROM kyc_cases WHERE reviewed_at IS NULL AND status NOT IN ('APPROVED','REJECTED','EXPIRED','CANCELLED'))"},
	{"merchant_applications", "(SELECT count(*) FROM merchant_applications WHERE status IN ('SUBMITTED','UNDER_REVIEW','PENDING','PENDING_REVIEW'))"},
	{"app_settlements", "(SELECT count(*) FROM app_settlements WHERE status = 'FAILED')"},
	{"disputes", "(SELECT count(*) FROM disputes WHERE status = 'OPEN')"},
	{"acquiring_reconciliation_runs", "(SELECT count(*) FROM acquiring_reconciliation_runs WHERE status = 'PENDING')"},
}

// Summary runs one round-trip of independent counts, after a cheap probe that
// drops any metric whose backing table is absent in this environment (counted as
// 0) so the endpoint never 500s on a partially-provisioned database.
func (s *NotificationsService) Summary(ctx context.Context) (NotificationSummary, error) {
	var out NotificationSummary

	// Probe which optional tables exist (one round-trip, no row scan of the tables).
	regsel := make([]string, len(summaryCounts))
	for i, c := range summaryCounts {
		regsel[i] = fmt.Sprintf("to_regclass('public.%s') IS NOT NULL", c.table)
	}
	exists := make([]bool, len(summaryCounts))
	dst := make([]any, len(summaryCounts))
	for i := range exists {
		dst[i] = &exists[i]
	}
	if err := s.pool.QueryRow(ctx, "SELECT "+strings.Join(regsel, ", ")).Scan(dst...); err != nil {
		return out, err
	}

	exprs := make([]string, len(summaryCounts))
	for i, c := range summaryCounts {
		if exists[i] {
			exprs[i] = c.expr
		} else {
			exprs[i] = "0"
		}
	}
	err := s.pool.QueryRow(ctx, "SELECT "+strings.Join(exprs, ", ")).Scan(
		&out.PendingKybDocuments,
		&out.PendingKycDocuments,
		&out.PendingBusinessApplications,
		&out.FailedAppSettlements,
		&out.OpenDisputes,
		&out.PendingReconciliations,
	)
	return out, err
}
