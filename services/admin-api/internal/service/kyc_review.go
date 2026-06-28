package service

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/banzami/banzami/services/admin-api/internal/kycstorage"
)

// KYC operator review (Banzami ADR-020). The operator decides the granted KYC
// level here — it is an OUTCOME of review, never chosen by the consumer. A real
// decision is required to lift any wallet limit (customer_compliance). KYC is
// operator policy (BANZA ADR-038); none of this is protocol.

var (
	ErrKycCaseNotFound   = errors.New("kyc case not found")
	ErrKycInvalidState   = errors.New("kyc case is not under review")
	ErrKycInvalidLevel   = errors.New("granted_level must be BASIC, ENHANCED or FULL")
	ErrKycReasonRequired = errors.New("reason_code is required")
)

func validGrantedLevel(l string) bool {
	return l == "BASIC" || l == "ENHANCED" || l == "FULL"
}

// KycReviewService owns operator decisions over the kyc_* tables. Storage may be
// nil (no signed download URLs are then returned).
type KycReviewService struct {
	pool    *pgxpool.Pool
	storage kycstorage.KycEvidenceStorage
}

func NewKycReviewService(pool *pgxpool.Pool, storage kycstorage.KycEvidenceStorage) *KycReviewService {
	return &KycReviewService{pool: pool, storage: storage}
}

// ── Projections ─────────────────────────────────────────────────────────────

type KycCaseSummary struct {
	ID           string     `json:"id"`
	SubjectID    string     `json:"subject_id"`
	Status       string     `json:"status"`
	DocumentType string     `json:"document_type,omitempty"`
	ReasonCode   string     `json:"reason_code,omitempty"`
	Environment  string     `json:"environment"`
	CreatedAt    time.Time  `json:"created_at"`
	SubmittedAt  *time.Time `json:"submitted_at,omitempty"`
	ReviewedAt   *time.Time `json:"reviewed_at,omitempty"`
}

type KycEvidenceDetail struct {
	ID           string     `json:"id"`
	EvidenceType string     `json:"evidence_type"`
	Side         string     `json:"side,omitempty"`
	Status       string     `json:"status"`
	MimeType     string     `json:"mime_type,omitempty"`
	SizeBytes    int64      `json:"size_bytes,omitempty"`
	UploadedAt   *time.Time `json:"uploaded_at,omitempty"`
	// DownloadURL is a short-lived signed GET (admin only). The storage_key is
	// never returned.
	DownloadURL string `json:"download_url,omitempty"`
}

type KycReviewRecord struct {
	ReviewerType string    `json:"reviewer_type"`
	ReviewerID   string    `json:"reviewer_id,omitempty"`
	Decision     string    `json:"decision"`
	ReasonCode   string    `json:"reason_code,omitempty"`
	GrantedLevel string    `json:"granted_level,omitempty"`
	Notes        string    `json:"notes,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

type KycCaseDetail struct {
	KycCaseSummary
	Evidence []KycEvidenceDetail `json:"evidence"`
	Reviews  []KycReviewRecord   `json:"reviews"`
}

// ── Reads ───────────────────────────────────────────────────────────────────

// ListCases returns cases filtered by status/environment (most recent first).
func (s *KycReviewService) ListCases(ctx context.Context, status, environment string, limit int) ([]KycCaseSummary, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		SELECT c.id, c.subject_id, c.status, COALESCE(d.document_type,''),
		       COALESCE(c.reason_code,''), c.environment, c.created_at, c.submitted_at, c.reviewed_at
		  FROM kyc_cases c
		  LEFT JOIN LATERAL (
		      SELECT document_type FROM kyc_documents WHERE case_id = c.id ORDER BY created_at LIMIT 1
		  ) d ON true
		 WHERE ($1 = '' OR c.status = $1)
		   AND ($2 = '' OR c.environment = $2)
		 ORDER BY c.submitted_at DESC NULLS LAST, c.created_at DESC
		 LIMIT $3`, status, environment, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []KycCaseSummary
	for rows.Next() {
		var c KycCaseSummary
		if err := rows.Scan(&c.ID, &c.SubjectID, &c.Status, &c.DocumentType, &c.ReasonCode,
			&c.Environment, &c.CreatedAt, &c.SubmittedAt, &c.ReviewedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// GetCase returns a case with its evidence (signed short-TTL download URLs) and
// review history.
func (s *KycReviewService) GetCase(ctx context.Context, caseID string) (*KycCaseDetail, error) {
	if _, err := uuid.Parse(caseID); err != nil {
		return nil, ErrKycCaseNotFound
	}
	var d KycCaseDetail
	err := s.pool.QueryRow(ctx, `
		SELECT c.id, c.subject_id, c.status, COALESCE(dd.document_type,''),
		       COALESCE(c.reason_code,''), c.environment, c.created_at, c.submitted_at, c.reviewed_at
		  FROM kyc_cases c
		  LEFT JOIN LATERAL (
		      SELECT document_type FROM kyc_documents WHERE case_id = c.id ORDER BY created_at LIMIT 1
		  ) dd ON true
		 WHERE c.id = $1`, caseID).
		Scan(&d.ID, &d.SubjectID, &d.Status, &d.DocumentType, &d.ReasonCode,
			&d.Environment, &d.CreatedAt, &d.SubmittedAt, &d.ReviewedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrKycCaseNotFound
		}
		return nil, err
	}

	evRows, err := s.pool.Query(ctx, `
		SELECT id, evidence_type, COALESCE(side,''), status, mime_type, COALESCE(size_bytes,0), uploaded_at, storage_key
		  FROM kyc_evidence WHERE case_id = $1 ORDER BY created_at`, caseID)
	if err != nil {
		return nil, err
	}
	defer evRows.Close()
	for evRows.Next() {
		var e KycEvidenceDetail
		var storageKey string
		if err := evRows.Scan(&e.ID, &e.EvidenceType, &e.Side, &e.Status, &e.MimeType,
			&e.SizeBytes, &e.UploadedAt, &storageKey); err != nil {
			return nil, err
		}
		// Mint a signed download only for uploaded objects; never expose the key.
		if s.storage != nil && e.Status == "UPLOADED" {
			if rd, rerr := s.storage.CreateReadURL(ctx, storageKey, ""); rerr == nil {
				e.DownloadURL = rd.URL
			}
		}
		d.Evidence = append(d.Evidence, e)
	}
	if err := evRows.Err(); err != nil {
		return nil, err
	}

	rvRows, err := s.pool.Query(ctx, `
		SELECT reviewer_type, COALESCE(reviewer_id,''), decision, COALESCE(reason_code,''),
		       COALESCE(granted_level,''), COALESCE(notes,''), created_at
		  FROM kyc_reviews WHERE case_id = $1 ORDER BY created_at`, caseID)
	if err != nil {
		return nil, err
	}
	defer rvRows.Close()
	for rvRows.Next() {
		var r KycReviewRecord
		if err := rvRows.Scan(&r.ReviewerType, &r.ReviewerID, &r.Decision, &r.ReasonCode,
			&r.GrantedLevel, &r.Notes, &r.CreatedAt); err != nil {
			return nil, err
		}
		d.Reviews = append(d.Reviews, r)
	}
	return &d, rvRows.Err()
}

// ── Decisions ───────────────────────────────────────────────────────────────

// Approve records an APPROVED review, grants the operator-decided level on
// customer_compliance, and moves the case to APPROVED. Requires UNDER_REVIEW.
func (s *KycReviewService) Approve(ctx context.Context, caseID, actor, grantedLevel, notes string) (*KycCaseDetail, error) {
	if !validGrantedLevel(grantedLevel) {
		return nil, ErrKycInvalidLevel
	}
	return s.decide(ctx, caseID, actor, "APPROVED", grantedLevel, "", notes)
}

// Reject records a REJECTED review (reason_code required) and moves the case to
// REJECTED. No level is granted.
func (s *KycReviewService) Reject(ctx context.Context, caseID, actor, reasonCode, notes string) (*KycCaseDetail, error) {
	if reasonCode == "" {
		return nil, ErrKycReasonRequired
	}
	return s.decide(ctx, caseID, actor, "REJECTED", "", reasonCode, notes)
}

// RequestMoreInfo records a NEEDS_MORE_INFO review (reason_code required) and
// returns the case to WAITING_DOCUMENTS so the consumer can supply more evidence.
func (s *KycReviewService) RequestMoreInfo(ctx context.Context, caseID, actor, reasonCode, notes string) (*KycCaseDetail, error) {
	if reasonCode == "" {
		return nil, ErrKycReasonRequired
	}
	return s.decide(ctx, caseID, actor, "NEEDS_MORE_INFO", "", reasonCode, notes)
}

func (s *KycReviewService) decide(ctx context.Context, caseID, actor, decision, grantedLevel, reasonCode, notes string) (*KycCaseDetail, error) {
	if _, err := uuid.Parse(caseID); err != nil {
		return nil, ErrKycCaseNotFound
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var subjectID, status string
	err = tx.QueryRow(ctx, `SELECT subject_id, status FROM kyc_cases WHERE id = $1 FOR UPDATE`, caseID).
		Scan(&subjectID, &status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrKycCaseNotFound
		}
		return nil, err
	}
	if status != "UNDER_REVIEW" {
		return nil, ErrKycInvalidState
	}

	reviewID := uuid.New().String()
	if _, err := tx.Exec(ctx,
		`INSERT INTO kyc_reviews (id, case_id, reviewer_type, reviewer_id, decision, reason_code, granted_level, notes)
		 VALUES ($1, $2, 'HUMAN', $3, $4, $5, $6, $7)`,
		reviewID, caseID, nullS(actor), decision, nullS(reasonCode), nullS(grantedLevel), nullS(notes)); err != nil {
		return nil, err
	}

	switch decision {
	case "APPROVED":
		if _, err := tx.Exec(ctx,
			`UPDATE kyc_cases SET status='APPROVED', reason_code=NULL, reviewed_at=NOW(), version=version+1, updated_at=NOW() WHERE id=$1`, caseID); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO customer_compliance (customer_id, kyc_level, status, reviewed_at)
			 VALUES ($1, $2, 'APPROVED', NOW())
			 ON CONFLICT (customer_id) DO UPDATE SET kyc_level=$2, status='APPROVED', reviewed_at=NOW(), updated_at=NOW()`,
			subjectID, grantedLevel); err != nil {
			return nil, err
		}
	case "REJECTED":
		if _, err := tx.Exec(ctx,
			`UPDATE kyc_cases SET status='REJECTED', reason_code=$2, reviewed_at=NOW(), version=version+1, updated_at=NOW() WHERE id=$1`, caseID, reasonCode); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO customer_compliance (customer_id, kyc_level, status, reviewed_at)
			 VALUES ($1, 'NONE', 'REJECTED', NOW())
			 ON CONFLICT (customer_id) DO UPDATE SET status='REJECTED', reviewed_at=NOW(), updated_at=NOW()`,
			subjectID); err != nil {
			return nil, err
		}
	case "NEEDS_MORE_INFO":
		if _, err := tx.Exec(ctx,
			`UPDATE kyc_cases SET status='WAITING_DOCUMENTS', reason_code=$2, reviewed_at=NOW(), version=version+1, updated_at=NOW() WHERE id=$1`, caseID, reasonCode); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO customer_compliance (customer_id, kyc_level, status)
			 VALUES ($1, 'NONE', 'PENDING')
			 ON CONFLICT (customer_id) DO UPDATE SET status='PENDING', updated_at=NOW()`,
			subjectID); err != nil {
			return nil, err
		}
	}

	// Operator-internal outbox events (idempotent on review id).
	if err := emitKycReviewEvent(ctx, tx, caseID, "kyc.review.completed", reviewID,
		map[string]any{"decision": decision, "granted_level": grantedLevel, "reason_code": reasonCode}); err != nil {
		return nil, err
	}
	terminal := map[string]string{"APPROVED": "kyc.approved", "REJECTED": "kyc.rejected"}
	if et, ok := terminal[decision]; ok {
		if err := emitKycReviewEvent(ctx, tx, caseID, et, reviewID,
			map[string]any{"granted_level": grantedLevel, "reason_code": reasonCode}); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetCase(ctx, caseID)
}

func emitKycReviewEvent(ctx context.Context, tx pgx.Tx, caseID, eventType, reviewID string, payload map[string]any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO kyc_events (id, case_id, event_type, payload, idempotency_key)
		 VALUES ($1, $2, $3, $4, $5) ON CONFLICT (idempotency_key) DO NOTHING`,
		uuid.New().String(), caseID, eventType, raw, eventType+":"+reviewID)
	return err
}

func nullS(s string) any {
	if s == "" {
		return nil
	}
	return s
}
