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
// operator policy (BANZA ADR-029); none of this is protocol.

var (
	ErrKycCaseNotFound      = errors.New("kyc case not found")
	ErrKycInvalidState      = errors.New("kyc case is not under review")
	ErrKycInvalidLevel      = errors.New("granted_level must be BASIC, ENHANCED or FULL")
	ErrKycReasonRequired    = errors.New("reason_code is required")
	ErrKycEvidenceNotFound  = errors.New("kyc evidence not found")
	ErrKycStorageDisabled   = errors.New("kyc evidence storage is not configured")
	ErrKycEvidenceNotStored = errors.New("kyc evidence has no stored object")
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
	ID              string     `json:"id"`
	SubjectID       string     `json:"subject_id"`
	Status          string     `json:"status"`
	DocumentType    string     `json:"document_type,omitempty"`
	DocumentCountry string     `json:"document_country,omitempty"`
	ReasonCode      string     `json:"reason_code,omitempty"`
	Environment     string     `json:"environment"`
	CreatedAt       time.Time  `json:"created_at"`
	SubmittedAt     *time.Time `json:"submitted_at,omitempty"`
	ReviewedAt      *time.Time `json:"reviewed_at,omitempty"`
	// Consumer context (enriched from consumers + customer_compliance). Empty when
	// the consumer no longer exists (orphan case) — decisions stay blocked by the
	// state machine, never auto-deleted.
	ConsumerExists   bool   `json:"consumer_exists"`
	ConsumerHandle   string `json:"consumer_handle,omitempty"`
	ConsumerName     string `json:"consumer_name,omitempty"`
	ConsumerStatus   string `json:"consumer_status,omitempty"`
	ConsumerPhone    string `json:"consumer_phone,omitempty"`
	KycLevel         string `json:"kyc_level,omitempty"`
	ComplianceStatus string `json:"compliance_status,omitempty"`
	EvidenceCount    int    `json:"evidence_count"`
}

type KycEvidenceDetail struct {
	ID           string     `json:"id"`
	EvidenceType string     `json:"evidence_type"`
	Side         string     `json:"side,omitempty"`
	Status       string     `json:"status"`
	MimeType     string     `json:"mime_type,omitempty"`
	SizeBytes    int64      `json:"size_bytes,omitempty"`
	UploadedAt   *time.Time `json:"uploaded_at,omitempty"`
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

// KycTimelineEvent is one immutable entry of the case history, sourced from
// kyc_events (the operator outbox) — newest-first.
type KycTimelineEvent struct {
	ID        string         `json:"id"`
	EventType string         `json:"event_type"`
	Payload   map[string]any `json:"payload,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
}

// ── Reads ───────────────────────────────────────────────────────────────────

// ListCases returns the consumer-centric KYC review queue: one row per consumer
// (their latest case), enriched with identity + compliance + evidence count. The
// operator reviews a whole consumer, not loose documents. The status/environment
// filters apply to that latest case.
func (s *KycReviewService) ListCases(ctx context.Context, status, environment string, limit int) ([]KycCaseSummary, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	// Inner DISTINCT ON picks the latest case per consumer; the outer query filters
	// on that case's status/environment so the queue is one entry per consumer.
	rows, err := s.pool.Query(ctx, `
		SELECT q.id, q.subject_id, q.status, q.document_type, q.country,
		       q.reason_code, q.environment, q.created_at, q.submitted_at, q.reviewed_at,
		       q.consumer_exists, q.handle, q.display_name, q.consumer_status,
		       q.phone_number, q.kyc_level, q.compliance_status, q.evidence_count
		  FROM (
		    SELECT DISTINCT ON (c.subject_id)
		           c.id, c.subject_id, c.status, COALESCE(d.document_type,'') AS document_type,
		           COALESCE(d.country,'') AS country, COALESCE(c.reason_code,'') AS reason_code,
		           c.environment, c.created_at, c.submitted_at, c.reviewed_at,
		           (cons.id IS NOT NULL) AS consumer_exists,
		           COALESCE(cons.handle,'') AS handle, COALESCE(cons.display_name,'') AS display_name,
		           COALESCE(cons.status,'') AS consumer_status, COALESCE(cons.phone_number,'') AS phone_number,
		           COALESCE(cc.kyc_level,'') AS kyc_level, COALESCE(cc.status,'') AS compliance_status,
		           COALESCE(ev.n,0) AS evidence_count
		      FROM kyc_cases c
		      LEFT JOIN LATERAL (
		          SELECT document_type, country FROM kyc_documents WHERE case_id = c.id ORDER BY created_at LIMIT 1
		      ) d ON true
		      LEFT JOIN consumers cons ON cons.id = c.subject_id
		      LEFT JOIN customer_compliance cc ON cc.customer_id = c.subject_id
		      LEFT JOIN LATERAL (SELECT count(*) AS n FROM kyc_evidence WHERE case_id = c.id) ev ON true
		     ORDER BY c.subject_id, c.created_at DESC
		  ) q
		 WHERE ($1 = '' OR q.status = $1)
		   AND ($2 = '' OR q.environment = $2)
		 ORDER BY q.submitted_at DESC NULLS LAST, q.created_at DESC
		 LIMIT $3`, status, environment, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []KycCaseSummary
	for rows.Next() {
		var c KycCaseSummary
		if err := rows.Scan(&c.ID, &c.SubjectID, &c.Status, &c.DocumentType, &c.DocumentCountry, &c.ReasonCode,
			&c.Environment, &c.CreatedAt, &c.SubmittedAt, &c.ReviewedAt,
			&c.ConsumerExists, &c.ConsumerHandle, &c.ConsumerName, &c.ConsumerStatus,
			&c.ConsumerPhone, &c.KycLevel, &c.ComplianceStatus, &c.EvidenceCount); err != nil {
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
		SELECT c.id, c.subject_id, c.status, COALESCE(dd.document_type,''), COALESCE(dd.country,''),
		       COALESCE(c.reason_code,''), c.environment, c.created_at, c.submitted_at, c.reviewed_at,
		       (cons.id IS NOT NULL),
		       COALESCE(cons.handle,''), COALESCE(cons.display_name,''), COALESCE(cons.status,''),
		       COALESCE(cons.phone_number,''), COALESCE(cc.kyc_level,''), COALESCE(cc.status,'')
		  FROM kyc_cases c
		  LEFT JOIN LATERAL (
		      SELECT document_type, country FROM kyc_documents WHERE case_id = c.id ORDER BY created_at LIMIT 1
		  ) dd ON true
		  LEFT JOIN consumers cons ON cons.id = c.subject_id
		  LEFT JOIN customer_compliance cc ON cc.customer_id = c.subject_id
		 WHERE c.id = $1`, caseID).
		Scan(&d.ID, &d.SubjectID, &d.Status, &d.DocumentType, &d.DocumentCountry, &d.ReasonCode,
			&d.Environment, &d.CreatedAt, &d.SubmittedAt, &d.ReviewedAt,
			&d.ConsumerExists, &d.ConsumerHandle, &d.ConsumerName, &d.ConsumerStatus,
			&d.ConsumerPhone, &d.KycLevel, &d.ComplianceStatus)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrKycCaseNotFound
		}
		return nil, err
	}

	evRows, err := s.pool.Query(ctx, `
		SELECT id, evidence_type, COALESCE(side,''), status, mime_type, COALESCE(size_bytes,0), uploaded_at
		  FROM kyc_evidence WHERE case_id = $1 ORDER BY created_at`, caseID)
	if err != nil {
		return nil, err
	}
	defer evRows.Close()
	for evRows.Next() {
		var e KycEvidenceDetail
		if err := evRows.Scan(&e.ID, &e.EvidenceType, &e.Side, &e.Status, &e.MimeType,
			&e.SizeBytes, &e.UploadedAt); err != nil {
			return nil, err
		}
		// Signed download URLs are NOT minted here — the operator mints one on
		// demand per access via ReadEvidenceURL (audited as VIEW/DOWNLOAD/COPY).
		// The storage_key never leaves the service.
		d.Evidence = append(d.Evidence, e)
	}
	if err := evRows.Err(); err != nil {
		return nil, err
	}
	d.EvidenceCount = len(d.Evidence)

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

// Timeline returns the immutable case history (kyc_events), newest-first. The
// events themselves are the audit-grade record; reviews are also surfaced inline
// in GetCase. Limited to 200 entries.
func (s *KycReviewService) Timeline(ctx context.Context, caseID string) ([]KycTimelineEvent, error) {
	if _, err := uuid.Parse(caseID); err != nil {
		return nil, ErrKycCaseNotFound
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, event_type, COALESCE(payload,'{}'::jsonb), created_at
		  FROM kyc_events WHERE case_id = $1 ORDER BY created_at DESC LIMIT 200`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []KycTimelineEvent{}
	for rows.Next() {
		var e KycTimelineEvent
		var raw []byte
		if err := rows.Scan(&e.ID, &e.EventType, &raw, &e.CreatedAt); err != nil {
			return nil, err
		}
		if len(raw) > 0 {
			_ = json.Unmarshal(raw, &e.Payload)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// ReadEvidenceURL mints a short-lived signed GET for one evidence object on
// demand. The storage_key is fetched internally and never returned; only the URL
// is. Errors when storage is unconfigured, the evidence is unknown, or no object
// has been uploaded yet.
func (s *KycReviewService) ReadEvidenceURL(ctx context.Context, evidenceID string) (string, error) {
	if s.storage == nil {
		return "", ErrKycStorageDisabled
	}
	if _, err := uuid.Parse(evidenceID); err != nil {
		return "", ErrKycEvidenceNotFound
	}
	var storageKey, status string
	err := s.pool.QueryRow(ctx,
		`SELECT storage_key, status FROM kyc_evidence WHERE id = $1`, evidenceID).Scan(&storageKey, &status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrKycEvidenceNotFound
		}
		return "", err
	}
	if status != "UPLOADED" || storageKey == "" {
		return "", ErrKycEvidenceNotStored
	}
	rd, err := s.storage.CreateReadURL(ctx, storageKey, "")
	if err != nil {
		return "", err
	}
	return rd.URL, nil
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
