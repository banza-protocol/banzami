package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/banzami/banzami/services/public-api/internal/kycstorage"
)

// KYC — Banzami's first official consumer identity verification (ADR-020).
// KYC is operator policy (BANZA ADR-038); the protocol defines none of it.
// Files live in R2; this service stores only references. No money, no ledger:
// the only financial consequence is that an APPROVED review (in admin-api)
// lifts the wallet KYC level — never here, never automatically.

// Operator identity stamped on every case (single-operator v1).
const kycOperatorID = "banzami"

// ── Errors (mapped to HTTP by the handler) ─────────────────────────────────

var (
	// ErrKycCaseNotFound is returned for a missing case OR a case owned by
	// another subject (anti-IDOR: cross-subject access is indistinguishable
	// from "not found" — the handler returns 404 in both).
	ErrKycCaseNotFound = errors.New("kyc case not found")
	// ErrKycStorageNotConfigured — uploads require KYC_STORAGE_* (503).
	ErrKycStorageNotConfigured = errors.New("kyc storage not configured")
	// ErrKycInvalidState — the requested transition is not allowed from the
	// case's current status (409).
	ErrKycInvalidState = errors.New("kyc case is not in a valid state for this action")
	// ErrKycInvalidInput — bad document type / evidence type / side (400).
	ErrKycInvalidInput = errors.New("invalid kyc input")
	// ErrKycEvidenceMissing — submit attempted before all required evidence
	// is uploaded, or completing an unknown evidence id (409/404).
	ErrKycEvidenceMissing = errors.New("required kyc evidence is missing")
	// ErrKycObjectNotUploaded — HEAD on R2 found no object for this evidence.
	ErrKycObjectNotUploaded = errors.New("evidence object was not uploaded")
)

// ── Domain ─────────────────────────────────────────────────────────────────

// Case statuses (state machine — see ADR-020).
const (
	KycDraft             = "DRAFT"
	KycWaitingDocuments  = "WAITING_DOCUMENTS"
	KycDocumentsReceived = "DOCUMENTS_RECEIVED"
	KycUnderReview       = "UNDER_REVIEW"
	KycApproved          = "APPROVED"
	KycRejected          = "REJECTED"
	KycNeedsMoreInfo     = "NEEDS_MORE_INFO"
	KycExpired           = "EXPIRED"
	KycCancelled         = "CANCELLED"
	KycFailed            = "FAILED"
)

// KycCase is the aggregate root (one verification attempt).
type KycCase struct {
	ID           string
	OperatorID   string
	SubjectType  string
	SubjectID    string
	Status       string
	ReasonCode   string
	Environment  string
	DocumentType string // from the case's (single) document
	Country      string
	CreatedAt    time.Time
	UpdatedAt    time.Time
	SubmittedAt  *time.Time
	ReviewedAt   *time.Time
	ExpiresAt    *time.Time
	Version      int
}

// KycEvidenceItem is one uploaded slot, projected for API responses. It never
// carries the storage_key (anti-leak).
type KycEvidenceItem struct {
	ID           string
	EvidenceType string
	Side         string
	Slot         string
	Status       string
	MimeType     string
	SizeBytes    int64
	UploadedAt   *time.Time
}

// reqSlot is one required piece of evidence for a document type.
type reqSlot struct {
	EvidenceType string
	Side         string
	Slot         string
}

// requiredSlots returns the evidence a document type demands. Operator policy.
func requiredSlots(documentType string) ([]reqSlot, error) {
	switch documentType {
	case "PASSPORT":
		return []reqSlot{
			{"DOCUMENT_IMAGE", "MAIN_PAGE", "passport-main"},
			{"DOCUMENT_IMAGE", "LAST_PAGE", "passport-last"},
			{"SELFIE", "SELFIE", "selfie"},
		}, nil
	case "IDENTITY_CARD", "RESIDENCE_PERMIT", "DRIVING_LICENSE":
		return []reqSlot{
			{"DOCUMENT_IMAGE", "FRONT", "document-front"},
			{"DOCUMENT_IMAGE", "BACK", "document-back"},
			{"SELFIE", "SELFIE", "selfie"},
		}, nil
	default:
		return nil, fmt.Errorf("%w: document_type %q", ErrKycInvalidInput, documentType)
	}
}

// RequiredSlot is the public projection of a required evidence slot.
type RequiredSlot struct {
	EvidenceType string
	Side         string
	Slot         string
}

// RequiredEvidenceFor returns the evidence a document type demands, for API
// projection. An unknown document type yields nil.
func RequiredEvidenceFor(documentType string) []RequiredSlot {
	req, err := requiredSlots(documentType)
	if err != nil {
		return nil
	}
	out := make([]RequiredSlot, len(req))
	for i, r := range req {
		out[i] = RequiredSlot{EvidenceType: r.EvidenceType, Side: r.Side, Slot: r.Slot}
	}
	return out
}

// slotFor maps an (evidence_type, side) pair to its storage slot, validating it
// is a slot the document type actually requires.
func slotFor(documentType, evidenceType, side string) (reqSlot, error) {
	req, err := requiredSlots(documentType)
	if err != nil {
		return reqSlot{}, err
	}
	for _, s := range req {
		if s.EvidenceType == evidenceType && s.Side == side {
			return s, nil
		}
	}
	return reqSlot{}, fmt.Errorf("%w: %s/%s not valid for %s", ErrKycInvalidInput, evidenceType, side, documentType)
}

// ── Service ────────────────────────────────────────────────────────────────

// KycService owns the kyc_* tables. It is the only writer of consumer KYC
// state in public-api. Storage may be nil when KYC_STORAGE_* is unset — upload
// endpoints then return 503 instead of panicking.
type KycService struct {
	pool        *pgxpool.Pool
	storage     kycstorage.KycEvidenceStorage
	environment string // "LIVE" | "SANDBOX"
}

// NewKycService builds the service. apiEnvironment is the public-api ENVIRONMENT
// ("PRODUCTION" | "SANDBOX"); it is normalised to the DB enum ("LIVE"|"SANDBOX").
func NewKycService(pool *pgxpool.Pool, storage kycstorage.KycEvidenceStorage, apiEnvironment string) *KycService {
	env := "LIVE"
	if apiEnvironment == "SANDBOX" {
		env = "SANDBOX"
	}
	return &KycService{pool: pool, storage: storage, environment: env}
}

// CreateOrResumeCase returns the consumer's active case (resume) or creates a
// new one in WAITING_DOCUMENTS with a single document of documentType. Idempotent
// on idempotencyKey. The consumer never chooses a level (ADR-020).
func (s *KycService) CreateOrResumeCase(ctx context.Context, consumerID, documentType, country, idempotencyKey string) (*KycCase, error) {
	if _, err := requiredSlots(documentType); err != nil {
		return nil, err
	}

	// Idempotency: a prior create with the same key returns the same case.
	if idempotencyKey != "" {
		if c, err := s.caseByIdempotencyKey(ctx, consumerID, idempotencyKey); err == nil {
			return c, nil
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
	}

	// Resume: one active (non-terminal) case per consumer+environment.
	if c, err := s.activeCase(ctx, consumerID); err == nil {
		return c, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	caseID := uuid.New().String()
	docID := uuid.New().String()
	var idemArg any
	if idempotencyKey != "" {
		idemArg = idempotencyKey
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO kyc_cases (id, operator_id, subject_type, subject_id, status, environment, idempotency_key)
		 VALUES ($1, $2, 'CONSUMER', $3, 'WAITING_DOCUMENTS', $4, $5)`,
		caseID, kycOperatorID, consumerID, s.environment, idemArg); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO kyc_documents (id, case_id, document_type, country, status)
		 VALUES ($1, $2, $3, $4, 'PENDING')`,
		docID, caseID, documentType, nullStr(country)); err != nil {
		return nil, err
	}
	if err := emitKycEvent(ctx, tx, caseID, "kyc.case.created",
		map[string]any{"document_type": documentType, "environment": s.environment}); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetCase(ctx, consumerID, caseID)
}

// GetCurrentCase returns the consumer's most recent case (resume target), or
// ErrKycCaseNotFound if they have none.
func (s *KycService) GetCurrentCase(ctx context.Context, consumerID string) (*KycCase, error) {
	row := s.pool.QueryRow(ctx, kycCaseSelect+`
		WHERE c.subject_id = $1 AND c.environment = $2
		ORDER BY c.created_at DESC LIMIT 1`, consumerID, s.environment)
	c, err := scanCase(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrKycCaseNotFound
		}
		return nil, err
	}
	return c, nil
}

// GetCase loads a case scoped to its owner. A case owned by another consumer is
// reported as ErrKycCaseNotFound (anti-IDOR → 404).
func (s *KycService) GetCase(ctx context.Context, consumerID, caseID string) (*KycCase, error) {
	if _, err := uuid.Parse(caseID); err != nil {
		return nil, ErrKycCaseNotFound
	}
	row := s.pool.QueryRow(ctx, kycCaseSelect+` WHERE c.id = $1 AND c.subject_id = $2`, caseID, consumerID)
	c, err := scanCase(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrKycCaseNotFound
		}
		return nil, err
	}
	return c, nil
}

// ListEvidence returns the case's evidence items (no storage_key).
func (s *KycService) ListEvidence(ctx context.Context, caseID string) ([]KycEvidenceItem, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, evidence_type, COALESCE(side,''), status, mime_type, COALESCE(size_bytes,0), uploaded_at
		   FROM kyc_evidence WHERE case_id = $1 ORDER BY created_at`, caseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []KycEvidenceItem
	for rows.Next() {
		var e KycEvidenceItem
		if err := rows.Scan(&e.ID, &e.EvidenceType, &e.Side, &e.Status, &e.MimeType, &e.SizeBytes, &e.UploadedAt); err != nil {
			return nil, err
		}
		e.Slot = slotName(e.EvidenceType, e.Side)
		out = append(out, e)
	}
	return out, rows.Err()
}

// RequestUploadURL provisions (or reuses) the evidence slot and mints a
// short-lived signed PUT URL. The storage_key is persisted but never returned.
func (s *KycService) RequestUploadURL(ctx context.Context, consumerID, caseID, evidenceType, side, contentType string) (evidenceID string, up kycstorage.UploadURL, err error) {
	if s.storage == nil {
		return "", kycstorage.UploadURL{}, ErrKycStorageNotConfigured
	}
	c, err := s.GetCase(ctx, consumerID, caseID)
	if err != nil {
		return "", kycstorage.UploadURL{}, err
	}
	// Uploads are only accepted while collecting documents.
	switch c.Status {
	case KycWaitingDocuments, KycDocumentsReceived, KycNeedsMoreInfo:
	default:
		return "", kycstorage.UploadURL{}, ErrKycInvalidState
	}
	slot, err := slotFor(c.DocumentType, evidenceType, side)
	if err != nil {
		return "", kycstorage.UploadURL{}, err
	}

	storageKey, err := s.storage.BuildStorageKey(consumerID, caseID, slot.Slot)
	if err != nil {
		return "", kycstorage.UploadURL{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", kycstorage.UploadURL{}, err
	}
	defer tx.Rollback(ctx)

	// One row per (case, slot). A re-upload resets it to PENDING and re-keys.
	var sideArg any
	if slot.Side != "" {
		sideArg = slot.Side
	}
	evidenceID = uuid.New().String()
	err = tx.QueryRow(ctx,
		`INSERT INTO kyc_evidence (id, case_id, document_id, evidence_type, side, storage_bucket, storage_key, mime_type, status, environment)
		   SELECT $1, $2, d.id, $3, $4, $5, $6, $7, 'PENDING', $8 FROM kyc_documents d WHERE d.case_id = $2 LIMIT 1
		 ON CONFLICT (storage_key) DO UPDATE
		   SET status='PENDING', mime_type=EXCLUDED.mime_type, size_bytes=NULL, sha256=NULL, uploaded_at=NULL
		 RETURNING id`,
		evidenceID, caseID, evidenceType, sideArg, s.storage.Bucket(), storageKey, contentTypeOrDefault(contentType), s.environment).
		Scan(&evidenceID)
	if err != nil {
		return "", kycstorage.UploadURL{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", kycstorage.UploadURL{}, err
	}

	up, err = s.storage.CreateUploadURL(ctx, storageKey, contentType)
	if err != nil {
		return "", kycstorage.UploadURL{}, err
	}
	return evidenceID, up, nil
}

// CompleteEvidence verifies the object exists in R2 (HEAD), records its real
// size/mime, marks the evidence UPLOADED, and advances the case to
// DOCUMENTS_RECEIVED once every required slot is uploaded.
func (s *KycService) CompleteEvidence(ctx context.Context, consumerID, caseID, evidenceID, sha256Hex string) (*KycCase, error) {
	if s.storage == nil {
		return nil, ErrKycStorageNotConfigured
	}
	c, err := s.GetCase(ctx, consumerID, caseID)
	if err != nil {
		return nil, err
	}
	switch c.Status {
	case KycWaitingDocuments, KycDocumentsReceived, KycNeedsMoreInfo:
	default:
		return nil, ErrKycInvalidState
	}

	var storageKey, evType, side string
	err = s.pool.QueryRow(ctx,
		`SELECT storage_key, evidence_type, COALESCE(side,'') FROM kyc_evidence WHERE id = $1 AND case_id = $2`,
		evidenceID, caseID).Scan(&storageKey, &evType, &side)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrKycEvidenceMissing
		}
		return nil, err
	}

	info, err := s.storage.HeadObject(ctx, storageKey)
	if err != nil {
		return nil, err
	}
	if !info.Exists {
		return nil, ErrKycObjectNotUploaded
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx,
		`UPDATE kyc_evidence
		    SET status='UPLOADED', size_bytes=$2, mime_type=COALESCE(NULLIF($3,''), mime_type),
		        sha256=$4, uploaded_at=NOW()
		  WHERE id=$1`,
		evidenceID, info.SizeBytes, info.ContentType, nullStr(sha256Hex)); err != nil {
		return nil, err
	}

	eventType := "kyc.document.uploaded"
	if evType == "SELFIE" {
		eventType = "kyc.selfie.uploaded"
	}
	if err := emitKycEventKeyed(ctx, tx, caseID, eventType, "evidence:"+evidenceID,
		map[string]any{"evidence_type": evType, "side": side}); err != nil {
		return nil, err
	}

	// Promote to DOCUMENTS_RECEIVED only when every required slot is UPLOADED.
	complete, err := allRequiredUploadedTx(ctx, tx, caseID, c.DocumentType)
	if err != nil {
		return nil, err
	}
	if complete && c.Status == KycWaitingDocuments {
		if _, err := tx.Exec(ctx,
			`UPDATE kyc_cases SET status='DOCUMENTS_RECEIVED', version=version+1, updated_at=NOW()
			  WHERE id=$1 AND status='WAITING_DOCUMENTS'`, caseID); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetCase(ctx, consumerID, caseID)
}

// SubmitCase moves a fully-documented case to UNDER_REVIEW (the consumer cannot
// self-approve) and reflects UNDER_REVIEW on customer_compliance. No level change.
func (s *KycService) SubmitCase(ctx context.Context, consumerID, caseID string) (*KycCase, error) {
	c, err := s.GetCase(ctx, consumerID, caseID)
	if err != nil {
		return nil, err
	}
	if c.Status != KycDocumentsReceived {
		// Either still collecting, or already submitted/terminal.
		if c.Status == KycWaitingDocuments || c.Status == KycNeedsMoreInfo {
			return nil, ErrKycEvidenceMissing
		}
		return nil, ErrKycInvalidState
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Guard against a race: re-check completeness inside the tx.
	complete, err := allRequiredUploadedTx(ctx, tx, caseID, c.DocumentType)
	if err != nil {
		return nil, err
	}
	if !complete {
		return nil, ErrKycEvidenceMissing
	}

	ct, err := tx.Exec(ctx,
		`UPDATE kyc_cases SET status='UNDER_REVIEW', submitted_at=NOW(), version=version+1, updated_at=NOW()
		  WHERE id=$1 AND status='DOCUMENTS_RECEIVED'`, caseID)
	if err != nil {
		return nil, err
	}
	if ct.RowsAffected() == 0 {
		return nil, ErrKycInvalidState
	}
	if _, err := tx.Exec(ctx, `UPDATE kyc_documents SET status='COMPLETE' WHERE case_id=$1`, caseID); err != nil {
		return nil, err
	}
	// Reflect review state on the compliance record the wallet gates read.
	if _, err := tx.Exec(ctx,
		`INSERT INTO customer_compliance (customer_id, kyc_level, status)
		 VALUES ($1, 'NONE', 'UNDER_REVIEW')
		 ON CONFLICT (customer_id) DO UPDATE SET status='UNDER_REVIEW', updated_at=NOW()`,
		consumerID); err != nil {
		return nil, err
	}
	if err := emitKycEventKeyed(ctx, tx, caseID, "kyc.review.started", "submit:"+caseID,
		map[string]any{"document_type": c.DocumentType}); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetCase(ctx, consumerID, caseID)
}

// ── Internal queries / helpers ─────────────────────────────────────────────

const kycCaseSelect = `
	SELECT c.id, c.operator_id, c.subject_type, c.subject_id, c.status,
	       COALESCE(c.reason_code,''), c.environment,
	       COALESCE(d.document_type,''), COALESCE(d.country,''),
	       c.created_at, c.updated_at, c.submitted_at, c.reviewed_at, c.expires_at, c.version
	  FROM kyc_cases c
	  LEFT JOIN LATERAL (
	      SELECT document_type, country FROM kyc_documents WHERE case_id = c.id ORDER BY created_at LIMIT 1
	  ) d ON true`

type rowScanner interface {
	Scan(dest ...any) error
}

func scanCase(row rowScanner) (*KycCase, error) {
	var c KycCase
	if err := row.Scan(
		&c.ID, &c.OperatorID, &c.SubjectType, &c.SubjectID, &c.Status,
		&c.ReasonCode, &c.Environment, &c.DocumentType, &c.Country,
		&c.CreatedAt, &c.UpdatedAt, &c.SubmittedAt, &c.ReviewedAt, &c.ExpiresAt, &c.Version,
	); err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *KycService) caseByIdempotencyKey(ctx context.Context, consumerID, key string) (*KycCase, error) {
	row := s.pool.QueryRow(ctx, kycCaseSelect+` WHERE c.idempotency_key = $1 AND c.subject_id = $2`, key, consumerID)
	return scanCase(row)
}

// activeCase returns the consumer's single non-terminal case, if any.
func (s *KycService) activeCase(ctx context.Context, consumerID string) (*KycCase, error) {
	row := s.pool.QueryRow(ctx, kycCaseSelect+`
		WHERE c.subject_id = $1 AND c.environment = $2
		  AND c.status IN ('WAITING_DOCUMENTS','DOCUMENTS_RECEIVED','UNDER_REVIEW','NEEDS_MORE_INFO')
		ORDER BY c.created_at DESC LIMIT 1`, consumerID, s.environment)
	return scanCase(row)
}

// allRequiredUploadedTx reports whether every required slot for documentType is
// present as an UPLOADED evidence row.
func allRequiredUploadedTx(ctx context.Context, tx pgx.Tx, caseID, documentType string) (bool, error) {
	req, err := requiredSlots(documentType)
	if err != nil {
		return false, err
	}
	for _, r := range req {
		var n int
		var sideArg any
		if r.Side != "" {
			sideArg = r.Side
		}
		if err := tx.QueryRow(ctx,
			`SELECT COUNT(*) FROM kyc_evidence
			  WHERE case_id=$1 AND evidence_type=$2 AND status='UPLOADED'
			    AND (side IS NOT DISTINCT FROM $3)`,
			caseID, r.EvidenceType, sideArg).Scan(&n); err != nil {
			return false, err
		}
		if n == 0 {
			return false, nil
		}
	}
	return true, nil
}

func slotName(evidenceType, side string) string {
	switch {
	case evidenceType == "SELFIE":
		return "selfie"
	case evidenceType == "PROOF_OF_ADDRESS":
		return "proof-of-address"
	case side == "FRONT":
		return "document-front"
	case side == "BACK":
		return "document-back"
	case side == "MAIN_PAGE":
		return "passport-main"
	case side == "LAST_PAGE":
		return "passport-last"
	default:
		return ""
	}
}

// emitKycEvent writes an operator-internal outbox event keyed by case+type
// (idempotent). Use emitKycEventKeyed when multiple events of one type can occur.
func emitKycEvent(ctx context.Context, tx pgx.Tx, caseID, eventType string, payload map[string]any) error {
	return emitKycEventKeyed(ctx, tx, caseID, eventType, eventType+":"+caseID, payload)
}

func emitKycEventKeyed(ctx context.Context, tx pgx.Tx, caseID, eventType, idemKey string, payload map[string]any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO kyc_events (id, case_id, event_type, payload, idempotency_key)
		 VALUES ($1, $2, $3, $4, $5) ON CONFLICT (idempotency_key) DO NOTHING`,
		uuid.New().String(), caseID, eventType, raw, idemKey)
	return err
}

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func contentTypeOrDefault(ct string) string {
	if ct == "" {
		return "application/octet-stream"
	}
	return ct
}
