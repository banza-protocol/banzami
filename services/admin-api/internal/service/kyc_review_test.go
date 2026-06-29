package service

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/banzami/banzami/services/admin-api/internal/kycstorage"
)

func kycPoolOrSkip(ctx context.Context, t *testing.T) *pgxpool.Pool {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping DB-backed KYC test")
	}
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	var reg *string
	_ = pool.QueryRow(ctx, `SELECT to_regclass('public.kyc_cases')::text`).Scan(&reg)
	if reg == nil {
		pool.Close()
		t.Skip("kyc_cases not migrated — skipping")
	}
	return pool
}

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

// List/Get enrich the case with consumer identity + compliance, and the timeline
// surfaces the immutable kyc_events newest-first.
func TestKycReview_EnrichmentAndTimeline(t *testing.T) {
	ctx := context.Background()
	pool := kycPoolOrSkip(ctx, t)
	defer pool.Close()
	svc := NewKycReviewService(pool, nil)

	sub := uuid.NewString()
	if _, err := pool.Exec(ctx,
		`INSERT INTO consumers (id, handle, display_name, status, phone_number)
		 VALUES ($1, $2, 'Fidel Teste', 'ACTIVE', $3)`, sub, "kyctest"+sub[:6], "+2449"+sub[:8]); err != nil {
		t.Fatalf("seed consumer: %v", err)
	}
	caseID := seedUnderReviewCase(ctx, t, pool, sub)
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM kyc_events WHERE case_id=$1`, caseID)
		_, _ = pool.Exec(ctx, `DELETE FROM kyc_cases WHERE subject_id=$1`, sub)
		_, _ = pool.Exec(ctx, `DELETE FROM customer_compliance WHERE customer_id=$1`, sub)
		_, _ = pool.Exec(ctx, `DELETE FROM consumers WHERE id=$1`, sub)
	})

	// List enriches with consumer handle/name + document type/country.
	cases, err := svc.ListCases(ctx, "UNDER_REVIEW", "SANDBOX", 50)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	var found *KycCaseSummary
	for i := range cases {
		if cases[i].ID == caseID {
			found = &cases[i]
		}
	}
	if found == nil {
		t.Fatalf("seeded case not in list")
	}
	if !found.ConsumerExists || found.ConsumerName != "Fidel Teste" || found.DocumentType != "IDENTITY_CARD" {
		t.Fatalf("list not enriched: %+v", found)
	}

	// Decide → events appear in the timeline, newest-first.
	if _, err := svc.Approve(ctx, caseID, "op-1", "BASIC", "ok"); err != nil {
		t.Fatalf("approve: %v", err)
	}
	ev, err := svc.Timeline(ctx, caseID)
	if err != nil {
		t.Fatalf("timeline: %v", err)
	}
	if len(ev) < 2 {
		t.Fatalf("expected >=2 events (review.completed + approved), got %d", len(ev))
	}
	// Newest-first: the terminal kyc.approved must precede the older kyc.case.created.
	if ev[0].CreatedAt.Before(ev[len(ev)-1].CreatedAt) {
		t.Fatalf("timeline not newest-first")
	}
	var sawApproved bool
	for _, e := range ev {
		if e.EventType == "kyc.approved" {
			sawApproved = true
		}
	}
	if !sawApproved {
		t.Fatalf("expected a kyc.approved event in timeline")
	}

	// Get enriches the detail too.
	d, err := svc.GetCase(ctx, caseID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if d.ConsumerHandle == "" || d.KycLevel != "BASIC" || d.ComplianceStatus != "APPROVED" {
		t.Fatalf("detail not enriched: handle=%q level=%q comp=%q", d.ConsumerHandle, d.KycLevel, d.ComplianceStatus)
	}
}

// ReadEvidenceURL mints a signed URL only for an UPLOADED object, never returns
// the storage_key, and reports precise errors otherwise.
func TestKycReview_ReadEvidenceURL(t *testing.T) {
	ctx := context.Background()
	pool := kycPoolOrSkip(ctx, t)
	defer pool.Close()

	sub := uuid.NewString()
	caseID := seedUnderReviewCase(ctx, t, pool, sub)
	upID := uuid.NewString()
	pendingID := uuid.NewString()
	key := "kyc/consumer/" + caseID + "/document-front"
	if _, err := pool.Exec(ctx,
		`INSERT INTO kyc_evidence (id, case_id, evidence_type, side, storage_bucket, storage_key, mime_type, status, environment, uploaded_at)
		 VALUES ($1,$2,'DOCUMENT_IMAGE','FRONT','banzami-kyc-sandbox',$3,'image/jpeg','UPLOADED','SANDBOX',NOW()),
		        ($4,$2,'SELFIE','SELFIE','banzami-kyc-sandbox',$5,'image/jpeg','PENDING','SANDBOX',NULL)`,
		upID, caseID, key, pendingID, key+"-selfie"); err != nil {
		t.Fatalf("seed evidence: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM kyc_evidence WHERE case_id=$1`, caseID)
		_, _ = pool.Exec(ctx, `DELETE FROM kyc_cases WHERE subject_id=$1`, sub)
		_, _ = pool.Exec(ctx, `DELETE FROM customer_compliance WHERE customer_id=$1`, sub)
	})

	// No storage configured → disabled.
	if _, err := NewKycReviewService(pool, nil).ReadEvidenceURL(ctx, upID); !errors.Is(err, ErrKycStorageDisabled) {
		t.Fatalf("nil storage: want ErrKycStorageDisabled, got %v", err)
	}

	svc := NewKycReviewService(pool, kycstorage.NewFake())
	// UPLOADED evidence → a non-empty signed URL.
	url, err := svc.ReadEvidenceURL(ctx, upID)
	if err != nil || url == "" {
		t.Fatalf("read url: url=%q err=%v", url, err)
	}
	// PENDING evidence → no object yet.
	if _, err := svc.ReadEvidenceURL(ctx, pendingID); !errors.Is(err, ErrKycEvidenceNotStored) {
		t.Fatalf("pending evidence: want ErrKycEvidenceNotStored, got %v", err)
	}
	// Unknown evidence → not found.
	if _, err := svc.ReadEvidenceURL(ctx, uuid.NewString()); !errors.Is(err, ErrKycEvidenceNotFound) {
		t.Fatalf("unknown evidence: want ErrKycEvidenceNotFound, got %v", err)
	}
}
