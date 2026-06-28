package service

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// seedUnderReviewCase inserts a minimal UNDER_REVIEW case for a subject and
// returns its id. The caller is responsible for cleanup by subject id.
func seedUnderReviewCase(ctx context.Context, t *testing.T, pool *pgxpool.Pool, subjectID string) string {
	t.Helper()
	caseID := uuid.New().String()
	if _, err := pool.Exec(ctx,
		`INSERT INTO kyc_cases (id, operator_id, subject_type, subject_id, status, environment, submitted_at)
		 VALUES ($1, 'banzami', 'CONSUMER', $2, 'UNDER_REVIEW', 'SANDBOX', NOW())`, caseID, subjectID); err != nil {
		t.Fatalf("seed case: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO kyc_documents (id, case_id, document_type, status) VALUES ($1, $2, 'IDENTITY_CARD', 'COMPLETE')`,
		uuid.New().String(), caseID); err != nil {
		t.Fatalf("seed doc: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO customer_compliance (customer_id, kyc_level, status) VALUES ($1, 'NONE', 'UNDER_REVIEW')
		 ON CONFLICT (customer_id) DO UPDATE SET status='UNDER_REVIEW'`, subjectID); err != nil {
		t.Fatalf("seed compliance: %v", err)
	}
	return caseID
}

func TestKycReviewDecisions_RealDB(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed KYC review test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	var reg *string
	_ = pool.QueryRow(ctx, `SELECT to_regclass('public.kyc_cases')::text`).Scan(&reg)
	if reg == nil {
		t.Skip("kyc_cases not migrated — skipping")
	}

	svc := NewKycReviewService(pool, nil) // nil storage: no download URLs needed here

	subA := uuid.NewString()
	subB := uuid.NewString()
	subC := uuid.NewString()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM kyc_cases WHERE subject_id = ANY($1)`, []string{subA, subB, subC})
		_, _ = pool.Exec(ctx, `DELETE FROM customer_compliance WHERE customer_id = ANY($1)`, []string{subA, subB, subC})
	})

	// Approve grants the operator-decided level on customer_compliance.
	caseA := seedUnderReviewCase(ctx, t, pool, subA)
	d, err := svc.Approve(ctx, caseA, "admin-1", "ENHANCED", "looks good")
	if err != nil || d.Status != "APPROVED" {
		t.Fatalf("approve: status=%v err=%v", d, err)
	}
	var level, status string
	if err := pool.QueryRow(ctx, `SELECT kyc_level, status FROM customer_compliance WHERE customer_id=$1`, subA).Scan(&level, &status); err != nil {
		t.Fatalf("compliance read: %v", err)
	}
	if level != "ENHANCED" || status != "APPROVED" {
		t.Fatalf("after approve: level=%s status=%s, want ENHANCED/APPROVED", level, status)
	}

	// A second decision on a terminal case is rejected.
	if _, err := svc.Reject(ctx, caseA, "admin-1", "DUP", ""); !errors.Is(err, ErrKycInvalidState) {
		t.Fatalf("decision on terminal case should be ErrKycInvalidState, got %v", err)
	}

	// Invalid level is refused before any write.
	caseB := seedUnderReviewCase(ctx, t, pool, subB)
	if _, err := svc.Approve(ctx, caseB, "admin-1", "PLATINUM", ""); !errors.Is(err, ErrKycInvalidLevel) {
		t.Fatalf("invalid level should be ErrKycInvalidLevel, got %v", err)
	}
	// Reject without reason is refused.
	if _, err := svc.Reject(ctx, caseB, "admin-1", "", ""); !errors.Is(err, ErrKycReasonRequired) {
		t.Fatalf("reject w/o reason should be ErrKycReasonRequired, got %v", err)
	}
	// Reject with reason moves to REJECTED, no level granted.
	if _, err := svc.Reject(ctx, caseB, "admin-1", "DOC_UNREADABLE", "blurry"); err != nil {
		t.Fatalf("reject: %v", err)
	}
	if err := pool.QueryRow(ctx, `SELECT kyc_level, status FROM customer_compliance WHERE customer_id=$1`, subB).Scan(&level, &status); err != nil {
		t.Fatalf("compliance read B: %v", err)
	}
	if level != "NONE" || status != "REJECTED" {
		t.Fatalf("after reject: level=%s status=%s, want NONE/REJECTED", level, status)
	}

	// Request-more-info returns the case to WAITING_DOCUMENTS.
	caseC := seedUnderReviewCase(ctx, t, pool, subC)
	dc, err := svc.RequestMoreInfo(ctx, caseC, "admin-1", "SELFIE_MISMATCH", "")
	if err != nil || dc.Status != "WAITING_DOCUMENTS" {
		t.Fatalf("request-more-info: status=%v err=%v, want WAITING_DOCUMENTS", dc, err)
	}

	// Unknown case id → not found.
	if _, err := svc.Approve(ctx, uuid.NewString(), "admin-1", "BASIC", ""); !errors.Is(err, ErrKycCaseNotFound) {
		t.Fatalf("unknown case should be ErrKycCaseNotFound, got %v", err)
	}
}
