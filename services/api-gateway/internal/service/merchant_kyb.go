package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/banzami/banzami/services/api-gateway/internal/kybstorage"

	banzamienv "github.com/banzami/banzami/services/common/env"
)

// Merchant-authenticated KYB documents (Banzami operator policy). After approval
// the merchant maintains its business documents here, scoped by merchant_id, with
// a real lifecycle. Files live in the KYB R2 buckets (signed PUT/GET, HEAD verify);
// the DB holds references only. Never mixed with KYC consumer storage.

// Canonical KYB document slots (the base set sent in the application).
var KybDocumentTypes = []string{"COMMERCIAL_REGISTRATION", "COMPANY_TAX_ID", "REPRESENTATIVE_ID"}

func isKybDocType(t string) bool {
	for _, k := range KybDocumentTypes {
		if k == t {
			return true
		}
	}
	return false
}

// Map application document types -> merchant KYB document types (for the bridge).
var appToKybType = map[string]string{
	"BUSINESS_REGISTRATION": "COMMERCIAL_REGISTRATION",
	"TAX_ID":                "COMPANY_TAX_ID",
	"REPRESENTATIVE_ID":     "REPRESENTATIVE_ID",
}

var kybAllowedMimes = map[string]bool{"application/pdf": true, "image/jpeg": true, "image/png": true}

var (
	ErrKybMerchantNotFound  = errors.New("merchant no longer exists")
	ErrKybDocNotFound       = errors.New("kyb document not found")
	ErrKybInvalidType       = errors.New("invalid kyb document_type")
	ErrKybInvalidMime       = errors.New("unsupported file type")
	ErrKybStorageDisabled   = errors.New("kyb storage not configured")
	ErrKybObjectNotUploaded = errors.New("document object was not uploaded")
	ErrKybReasonRequired    = errors.New("rejection_reason is required")
	ErrKybInvalidState      = errors.New("document is not in a valid state for this action")
)

// PostgresMerchantKybService owns merchant_kyb_documents + merchant_kyb_events.
type PostgresMerchantKybService struct {
	pool    *pgxpool.Pool
	storage kybstorage.KybDocumentStorage // nil when KYB_STORAGE_* is absent
	maxSize int64
}

func NewPostgresMerchantKybService(pool *pgxpool.Pool, storage kybstorage.KybDocumentStorage, maxSize int64) *PostgresMerchantKybService {
	if maxSize <= 0 {
		maxSize = 5 * 1024 * 1024
	}
	return &PostgresMerchantKybService{pool: pool, storage: storage, maxSize: maxSize}
}

func (s *PostgresMerchantKybService) StorageConfigured() bool { return s.storage != nil }

// assertMerchant rejects a stale/deleted merchant: the JWT may be valid but the
// merchant_id no longer exists (e.g. account removed). This prevents orphan
// merchant_kyb_documents being created under a non-existent merchant.
func (s *PostgresMerchantKybService) assertMerchant(ctx context.Context, merchantID string) error {
	var x int
	err := s.pool.QueryRow(ctx, `SELECT 1 FROM merchants WHERE id = $1`, merchantID).Scan(&x)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrKybMerchantNotFound
	}
	return err
}

// ── Projections (never carry storage_key) ───────────────────────────────────

type MerchantKybDocument struct {
	ID              string     `json:"id"`
	DocumentType    string     `json:"document_type"`
	Status          string     `json:"status"` // MISSING | PENDING_UPLOAD | PENDING_REVIEW | VALID | REJECTED | EXPIRED | REPLACED
	MimeType        string     `json:"mime_type,omitempty"`
	SizeBytes       int64      `json:"size_bytes,omitempty"`
	SubmittedAt     *time.Time `json:"submitted_at,omitempty"`
	ReviewedAt      *time.Time `json:"reviewed_at,omitempty"`
	ValidUntil      *time.Time `json:"valid_until,omitempty"`
	RejectionReason string     `json:"rejection_reason,omitempty"`
}

type MerchantKybStatus struct {
	KybStatus  string                `json:"kyb_status"`
	Verified   bool                  `json:"verified"`
	ReasonCode string                `json:"reason_code,omitempty"`
	UpdatedAt  *time.Time            `json:"updated_at,omitempty"`
	Documents  []MerchantKybDocument `json:"documents"`
}

// MerchantKybAdminDocument is the admin projection. It carries the owning
// merchant's identity (name + status + KYB status) so the review inbox is
// readable, and a MerchantExists flag so an orphan document (whose merchant was
// removed) is clearly marked and cannot be reviewed normally. Never carries the
// storage key.
type MerchantKybAdminDocument struct {
	MerchantKybDocument
	MerchantID     string `json:"merchant_id"`
	MerchantName   string `json:"merchant_name,omitempty"`
	MerchantStatus string `json:"merchant_status,omitempty"`
	KybStatus      string `json:"kyb_status,omitempty"`
	Environment    string `json:"environment,omitempty"`
	// MerchantExists is false when the document's merchant no longer exists
	// (orphan). The reviewer UI marks it and blocks normal approve/reject.
	MerchantExists bool   `json:"merchant_exists"`
	ReviewedBy     string `json:"reviewed_by,omitempty"`  // operator who last reviewed this document
	DownloadURL    string `json:"download_url,omitempty"` // short-TTL signed GET, admin only
}

// MerchantKybSummary is one row of the merchant-centric KYB review queue: a whole
// merchant with its document aggregates (not a loose document). The operator
// reviews a complete merchant, then acts on individual documents inside the drawer.
type MerchantKybSummary struct {
	MerchantID     string     `json:"merchant_id"`
	MerchantExists bool       `json:"merchant_exists"`
	Name           string     `json:"name,omitempty"`
	Handle         string     `json:"handle,omitempty"`
	Status         string     `json:"status,omitempty"`     // merchant account status
	KybStatus      string     `json:"kyb_status,omitempty"` // overall KYB status
	Environment    string     `json:"environment,omitempty"`
	Country        string     `json:"country,omitempty"`
	Contact        string     `json:"contact,omitempty"` // primary contact (application email)
	Total          int        `json:"total"`
	Pending        int        `json:"pending"`
	Approved       int        `json:"approved"`
	Rejected       int        `json:"rejected"`
	Expired        int        `json:"expired"`
	LastSubmission *time.Time `json:"last_submission,omitempty"`
}

// ── Merchant surface ─────────────────────────────────────────────────────────

// ListDocuments returns the 3 canonical slots for a merchant; a slot with no
// current document is reported MISSING. Expiry is reflected as EXPIRED.
func (s *PostgresMerchantKybService) ListDocuments(ctx context.Context, merchantID string) ([]MerchantKybDocument, error) {
	if err := s.assertMerchant(ctx, merchantID); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT ON (document_type)
		       id, document_type, status, COALESCE(mime_type,''), COALESCE(size_bytes,0),
		       submitted_at, reviewed_at, valid_until, COALESCE(rejection_reason,'')
		  FROM merchant_kyb_documents
		 WHERE merchant_id = $1 AND status <> 'REPLACED'
		 ORDER BY document_type, created_at DESC`, merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byType := map[string]MerchantKybDocument{}
	now := time.Now()
	for rows.Next() {
		var d MerchantKybDocument
		if err := rows.Scan(&d.ID, &d.DocumentType, &d.Status, &d.MimeType, &d.SizeBytes,
			&d.SubmittedAt, &d.ReviewedAt, &d.ValidUntil, &d.RejectionReason); err != nil {
			return nil, err
		}
		if d.Status == "VALID" && d.ValidUntil != nil && d.ValidUntil.Before(now) {
			d.Status = "EXPIRED"
		}
		byType[d.DocumentType] = d
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]MerchantKybDocument, 0, len(KybDocumentTypes))
	for _, t := range KybDocumentTypes {
		if d, ok := byType[t]; ok {
			out = append(out, d)
		} else {
			out = append(out, MerchantKybDocument{DocumentType: t, Status: "MISSING"})
		}
	}
	return out, nil
}

// GetStatus returns the merchant's global KYB status + the 3 document slots.
func (s *PostgresMerchantKybService) GetStatus(ctx context.Context, merchantID string) (*MerchantKybStatus, error) {
	docs, err := s.ListDocuments(ctx, merchantID)
	if err != nil {
		return nil, err
	}
	st := &MerchantKybStatus{KybStatus: "PENDING", Documents: docs}
	var kyb string
	var updated *time.Time
	err = s.pool.QueryRow(ctx, `SELECT kyb_status, updated_at FROM merchant_compliance WHERE merchant_id = $1`, merchantID).
		Scan(&kyb, &updated)
	if err == nil {
		st.KybStatus = kyb
		st.UpdatedAt = updated
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	st.Verified = st.KybStatus == "APPROVED"
	return st, nil
}

func (s *PostgresMerchantKybService) GetDocument(ctx context.Context, merchantID, docID string) (*MerchantKybDocument, error) {
	if err := s.assertMerchant(ctx, merchantID); err != nil {
		return nil, err
	}
	if _, err := uuid.Parse(docID); err != nil {
		return nil, ErrKybDocNotFound
	}
	var d MerchantKybDocument
	err := s.pool.QueryRow(ctx, `
		SELECT id, document_type, status, COALESCE(mime_type,''), COALESCE(size_bytes,0),
		       submitted_at, reviewed_at, valid_until, COALESCE(rejection_reason,'')
		  FROM merchant_kyb_documents WHERE id = $1 AND merchant_id = $2`, docID, merchantID).
		Scan(&d.ID, &d.DocumentType, &d.Status, &d.MimeType, &d.SizeBytes,
			&d.SubmittedAt, &d.ReviewedAt, &d.ValidUntil, &d.RejectionReason)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrKybDocNotFound
		}
		return nil, err
	}
	return &d, nil
}

// RequestUploadURL creates a PENDING_UPLOAD document of docType and returns a
// short-lived signed PUT. The storage_key is persisted, never returned.
func (s *PostgresMerchantKybService) RequestUploadURL(ctx context.Context, merchantID, environment, docType, contentType string) (docID string, up kybstorage.UploadURL, err error) {
	if s.storage == nil {
		return "", kybstorage.UploadURL{}, ErrKybStorageDisabled
	}
	if err = s.assertMerchant(ctx, merchantID); err != nil {
		return "", kybstorage.UploadURL{}, err
	}
	if !isKybDocType(docType) {
		return "", kybstorage.UploadURL{}, ErrKybInvalidType
	}
	contentType = strings.ToLower(strings.TrimSpace(contentType))
	if contentType == "" {
		contentType = "application/octet-stream"
	} else if !kybAllowedMimes[contentType] {
		return "", kybstorage.UploadURL{}, ErrKybInvalidMime
	}
	parsed := banzamienv.Parse(environment)
	if !parsed.IsKnown() {
		return "", kybstorage.UploadURL{}, ErrEnvironmentUndeclared
	}
	env := parsed.String()
	docID = uuid.New().String()
	// merchant-scoped key, separate from the public application prefix.
	storageKey := fmt.Sprintf("kyb/merchant/%s/%s/%s", merchantID, strings.ToLower(docType), docID)

	if _, err = s.pool.Exec(ctx,
		`INSERT INTO merchant_kyb_documents (id, merchant_id, document_type, status, storage_bucket, storage_key, mime_type, environment)
		 VALUES ($1, $2, $3, 'PENDING_UPLOAD', $4, $5, $6, $7)`,
		docID, merchantID, docType, s.storage.Bucket(), storageKey, contentType, env); err != nil {
		return "", kybstorage.UploadURL{}, err
	}
	up, err = s.storage.CreateUploadURL(ctx, storageKey, contentType)
	if err != nil {
		return "", kybstorage.UploadURL{}, err
	}
	return docID, up, nil
}

// CompleteUpload HEAD-verifies the object, records size/mime/sha256, and moves
// the document to PENDING_REVIEW (the previous current doc of the type, if any,
// is left intact until an admin accepts the new one).
func (s *PostgresMerchantKybService) CompleteUpload(ctx context.Context, merchantID, docID, sha256Hex string) (*MerchantKybDocument, error) {
	if s.storage == nil {
		return nil, ErrKybStorageDisabled
	}
	if err := s.assertMerchant(ctx, merchantID); err != nil {
		return nil, err
	}
	var storageKey, status string
	err := s.pool.QueryRow(ctx,
		`SELECT storage_key, status FROM merchant_kyb_documents WHERE id = $1 AND merchant_id = $2`,
		docID, merchantID).Scan(&storageKey, &status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrKybDocNotFound
		}
		return nil, err
	}
	if status != "PENDING_UPLOAD" {
		return nil, ErrKybInvalidState
	}
	info, err := s.storage.HeadObject(ctx, storageKey)
	if err != nil {
		return nil, err
	}
	if !info.Exists {
		return nil, ErrKybObjectNotUploaded
	}
	if s.maxSize > 0 && info.SizeBytes > s.maxSize {
		return nil, fmt.Errorf("file too large")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx,
		`UPDATE merchant_kyb_documents
		    SET status='PENDING_REVIEW', size_bytes=$2, mime_type=COALESCE(NULLIF($3,''), mime_type),
		        sha256=$4, submitted_at=NOW(), updated_at=NOW()
		  WHERE id=$1`,
		docID, info.SizeBytes, info.ContentType, nullStrKyb(sha256Hex)); err != nil {
		return nil, err
	}
	if err := emitKybEvent(ctx, tx, merchantID, docID, "merchant.kyb.document.uploaded", "uploaded:"+docID, nil); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetDocument(ctx, merchantID, docID)
}

// ── Admin surface ────────────────────────────────────────────────────────────

// AdminList returns documents for review (optionally filtered by status), with
// signed download URLs minted for the reviewer.
func (s *PostgresMerchantKybService) AdminList(ctx context.Context, status string, limit int) ([]MerchantKybAdminDocument, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	// LEFT JOIN so an orphan document (merchant removed) still appears, marked
	// via merchant_exists=false. Enriched with the merchant name/status + KYB
	// status so the inbox is readable instead of showing a bare id.
	rows, err := s.pool.Query(ctx, `
		SELECT d.id, d.merchant_id, d.document_type, d.status, COALESCE(d.mime_type,''),
		       COALESCE(d.size_bytes,0), d.submitted_at, d.reviewed_at, d.valid_until,
		       COALESCE(d.rejection_reason,''), d.storage_key,
		       COALESCE(m.name,''), COALESCE(m.status,''), COALESCE(mc.kyb_status,''),
		       COALESCE(d.environment,''), (m.id IS NOT NULL) AS merchant_exists
		  FROM merchant_kyb_documents d
		  LEFT JOIN merchants m           ON m.id = d.merchant_id
		  LEFT JOIN merchant_compliance mc ON mc.merchant_id = d.merchant_id
		 WHERE ($1 = '' OR d.status = $1) AND d.status <> 'REPLACED'
		 ORDER BY d.submitted_at DESC NULLS LAST, d.created_at DESC
		 LIMIT $2`, status, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []MerchantKybAdminDocument
	for rows.Next() {
		var d MerchantKybAdminDocument
		var key string
		if err := rows.Scan(&d.ID, &d.MerchantID, &d.DocumentType, &d.Status, &d.MimeType, &d.SizeBytes,
			&d.SubmittedAt, &d.ReviewedAt, &d.ValidUntil, &d.RejectionReason, &key,
			&d.MerchantName, &d.MerchantStatus, &d.KybStatus, &d.Environment, &d.MerchantExists); err != nil {
			return nil, err
		}
		// A signed read URL is still minted for viewing (incl. orphans) but never
		// for a REPLACED doc; the key itself is never exposed.
		if s.storage != nil && key != "" && (d.Status == "PENDING_REVIEW" || d.Status == "VALID") {
			if rd, rerr := s.storage.CreateReadURL(ctx, key, ""); rerr == nil {
				d.DownloadURL = rd.URL
			}
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// AdminListMerchants returns the merchant-centric KYB review queue: one row per
// merchant that has KYB documents, with per-status counts and the latest
// submission. The operator reviews a whole merchant, not loose documents. An
// orphan (merchant removed) still appears with merchant_exists=false. REPLACED
// documents are excluded from the aggregates.
func (s *PostgresMerchantKybService) AdminListMerchants(ctx context.Context, limit int) ([]MerchantKybSummary, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	// Merchant-driven: every merchant appears — even one that was auto-approved
	// with no uploaded documents (SANDBOX assisted onboarding) — plus any orphan
	// document whose merchant was removed. Aggregates count real documents only
	// (count(d.id), so a doc-less merchant is total=0/pending=0, not 1).
	rows, err := s.pool.Query(ctx, `
		WITH ids AS (
		  SELECT id AS merchant_id FROM merchants
		  UNION
		  SELECT DISTINCT merchant_id FROM merchant_kyb_documents
		)
		SELECT ids.merchant_id,
		       COALESCE(m.name,''), COALESCE(p.handle,''), COALESCE(m.status,''),
		       COALESCE(mc.kyb_status,''), COALESCE(max(d.environment), max(a.environment), ''),
		       COALESCE(max(a.country),''), COALESCE(max(a.email), m.email, ''),
		       (m.id IS NOT NULL) AS merchant_exists,
		       count(d.id) FILTER (WHERE d.status <> 'REPLACED') AS total,
		       count(d.id) FILTER (WHERE d.status = 'PENDING_REVIEW') AS pending,
		       count(d.id) FILTER (WHERE d.status = 'VALID') AS approved,
		       count(d.id) FILTER (WHERE d.status = 'REJECTED') AS rejected,
		       count(d.id) FILTER (WHERE d.status = 'EXPIRED') AS expired,
		       max(d.submitted_at) AS last_submission
		  FROM ids
		  LEFT JOIN merchants m            ON m.id = ids.merchant_id
		  LEFT JOIN merchant_compliance mc ON mc.merchant_id = ids.merchant_id
		  LEFT JOIN merchant_profiles p    ON p.merchant_id = ids.merchant_id
		  LEFT JOIN merchant_applications a ON a.created_merchant_id = ids.merchant_id
		  LEFT JOIN merchant_kyb_documents d ON d.merchant_id = ids.merchant_id
		 GROUP BY ids.merchant_id, m.id, m.name, p.handle, m.status, mc.kyb_status, m.email
		 ORDER BY (count(d.id) FILTER (WHERE d.status = 'PENDING_REVIEW')) DESC,
		          max(d.submitted_at) DESC NULLS LAST,
		          m.name ASC
		 LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MerchantKybSummary{}
	for rows.Next() {
		var m MerchantKybSummary
		if err := rows.Scan(&m.MerchantID, &m.Name, &m.Handle, &m.Status, &m.KybStatus,
			&m.Environment, &m.Country, &m.Contact, &m.MerchantExists,
			&m.Total, &m.Pending, &m.Approved, &m.Rejected, &m.Expired, &m.LastSubmission); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// AdminMerchantDocuments returns all current (non-REPLACED) KYB documents for one
// merchant, for the merchant review drawer. No signed URLs are minted here — the
// operator mints one on demand per access (audited). storage_key never leaves.
func (s *PostgresMerchantKybService) AdminMerchantDocuments(ctx context.Context, merchantID string) ([]MerchantKybAdminDocument, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT d.id, d.merchant_id, d.document_type, d.status, COALESCE(d.mime_type,''),
		       COALESCE(d.size_bytes,0), d.submitted_at, d.reviewed_at, d.valid_until,
		       COALESCE(d.rejection_reason,''), COALESCE(d.reviewed_by,''),
		       COALESCE(m.name,''), COALESCE(m.status,''), COALESCE(mc.kyb_status,''),
		       COALESCE(d.environment,''), (m.id IS NOT NULL) AS merchant_exists
		  FROM merchant_kyb_documents d
		  LEFT JOIN merchants m            ON m.id = d.merchant_id
		  LEFT JOIN merchant_compliance mc ON mc.merchant_id = d.merchant_id
		 WHERE d.merchant_id = $1 AND d.status <> 'REPLACED'
		 ORDER BY d.document_type, d.submitted_at DESC NULLS LAST`, merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MerchantKybAdminDocument{}
	for rows.Next() {
		var d MerchantKybAdminDocument
		if err := rows.Scan(&d.ID, &d.MerchantID, &d.DocumentType, &d.Status, &d.MimeType, &d.SizeBytes,
			&d.SubmittedAt, &d.ReviewedAt, &d.ValidUntil, &d.RejectionReason, &d.ReviewedBy,
			&d.MerchantName, &d.MerchantStatus, &d.KybStatus, &d.Environment, &d.MerchantExists); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// AdminApprove marks a document VALID (optionally with valid_until), supersedes
// the previous current document of the same type (-> REPLACED), and promotes the
// merchant to KYB APPROVED when all required documents are VALID.
func (s *PostgresMerchantKybService) AdminApprove(ctx context.Context, docID, actor, notes string, validUntil *time.Time) error {
	return s.decide(ctx, docID, actor, "VALID", "", notes, validUntil)
}

// AdminReject marks a document REJECTED with a required reason.
func (s *PostgresMerchantKybService) AdminReject(ctx context.Context, docID, actor, reason, notes string) error {
	if strings.TrimSpace(reason) == "" {
		return ErrKybReasonRequired
	}
	return s.decide(ctx, docID, actor, "REJECTED", reason, notes, nil)
}

// MerchantKybContext is the full review context for the drawer: merchant identity
// + representative + company details (from the application) + KYB status.
// Read-only; never carries secrets.
type MerchantKybContext struct {
	MerchantID       string  `json:"merchant_id"`
	MerchantExists   bool    `json:"merchant_exists"`
	Name             string  `json:"name,omitempty"`
	Email            string  `json:"email,omitempty"`
	Status           string  `json:"status,omitempty"`
	KybStatus        string  `json:"kyb_status,omitempty"`
	Handle           string  `json:"handle,omitempty"`
	Category         string  `json:"category,omitempty"`
	CreatedAt        *string `json:"created_at,omitempty"`
	RepName          string  `json:"representative_name,omitempty"`
	RepEmail         string  `json:"representative_email,omitempty"`
	RepPhone         string  `json:"representative_phone,omitempty"`
	LegalName        string  `json:"legal_name,omitempty"`
	Nif              string  `json:"nif,omitempty"`
	Country          string  `json:"country,omitempty"`
	City             string  `json:"city,omitempty"`
	Address          string  `json:"address,omitempty"`
	BusinessActivity string  `json:"business_activity,omitempty"`
}

// KybTimelineEvent is one immutable history entry from merchant_kyb_events.
type KybTimelineEvent struct {
	ID         string         `json:"id"`
	EventType  string         `json:"event_type"`
	DocumentID string         `json:"document_id,omitempty"`
	Payload    map[string]any `json:"payload,omitempty"`
	CreatedAt  string         `json:"created_at"`
}

// Context returns the merchant review context (merchant_exists=false for orphans).
func (s *PostgresMerchantKybService) Context(ctx context.Context, merchantID string) (*MerchantKybContext, error) {
	if _, err := uuid.Parse(merchantID); err != nil {
		return nil, ErrKybMerchantNotFound
	}
	c := &MerchantKybContext{MerchantID: merchantID}
	var created *time.Time
	err := s.pool.QueryRow(ctx, `
		SELECT (m.id IS NOT NULL), COALESCE(m.name,''), COALESCE(m.email,''), COALESCE(m.status,''),
		       COALESCE(mc.kyb_status,''), COALESCE(p.handle,''), COALESCE(p.category,''), m.created_at,
		       COALESCE(a.legal_representative,''), COALESCE(a.email,''), COALESCE(a.phone,''),
		       COALESCE(a.business_name,''), COALESCE(a.nif,''), COALESCE(a.country,''),
		       COALESCE(a.city,''), COALESCE(a.address,''), COALESCE(a.business_activity,'')
		  FROM (SELECT $1::uuid AS id) q
		  LEFT JOIN merchants m             ON m.id = q.id
		  LEFT JOIN merchant_compliance mc  ON mc.merchant_id = q.id
		  LEFT JOIN merchant_profiles p     ON p.merchant_id = q.id
		  LEFT JOIN merchant_applications a ON a.created_merchant_id = q.id
		 LIMIT 1`, merchantID).
		Scan(&c.MerchantExists, &c.Name, &c.Email, &c.Status, &c.KybStatus, &c.Handle, &c.Category, &created,
			&c.RepName, &c.RepEmail, &c.RepPhone, &c.LegalName, &c.Nif, &c.Country, &c.City, &c.Address, &c.BusinessActivity)
	if err != nil {
		return nil, err
	}
	if created != nil {
		v := created.UTC().Format(time.RFC3339)
		c.CreatedAt = &v
	}
	return c, nil
}

// Timeline returns the immutable KYB event history for a merchant (newest first).
func (s *PostgresMerchantKybService) Timeline(ctx context.Context, merchantID string) ([]KybTimelineEvent, error) {
	if _, err := uuid.Parse(merchantID); err != nil {
		return nil, ErrKybMerchantNotFound
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, event_type, COALESCE(document_id::text,''), COALESCE(payload,'{}'::jsonb), created_at
		  FROM merchant_kyb_events WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 200`, merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []KybTimelineEvent
	for rows.Next() {
		var e KybTimelineEvent
		var created time.Time
		if err := rows.Scan(&e.ID, &e.EventType, &e.DocumentID, &e.Payload, &created); err != nil {
			return nil, err
		}
		e.CreatedAt = created.UTC().Format(time.RFC3339)
		out = append(out, e)
	}
	return out, rows.Err()
}

// ReadURL mints a fresh short-TTL signed GET for a document, on demand. The
// storage key is never returned.
func (s *PostgresMerchantKybService) ReadURL(ctx context.Context, docID string) (string, error) {
	if s.storage == nil {
		return "", ErrKybStorageDisabled
	}
	if _, err := uuid.Parse(docID); err != nil {
		return "", ErrKybDocNotFound
	}
	var key string
	err := s.pool.QueryRow(ctx, `SELECT storage_key FROM merchant_kyb_documents WHERE id=$1`, docID).Scan(&key)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrKybDocNotFound
		}
		return "", err
	}
	rd, err := s.storage.CreateReadURL(ctx, key, "")
	if err != nil {
		return "", err
	}
	return rd.URL, nil
}

func (s *PostgresMerchantKybService) decide(ctx context.Context, docID, actor, decision, reason, notes string, validUntil *time.Time) error {
	if _, err := uuid.Parse(docID); err != nil {
		return ErrKybDocNotFound
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var merchantID, docType, status string
	err = tx.QueryRow(ctx,
		`SELECT merchant_id, document_type, status FROM merchant_kyb_documents WHERE id=$1 FOR UPDATE`, docID).
		Scan(&merchantID, &docType, &status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrKybDocNotFound
		}
		return err
	}
	if status != "PENDING_REVIEW" {
		return ErrKybInvalidState
	}

	// Orphan-safety: never review a document whose merchant no longer exists.
	// The reviewer must use the administrative path (the UI marks it and disables
	// approve/reject); we never auto-delete anything here.
	var merchantExists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM merchants WHERE id=$1)`, merchantID).
		Scan(&merchantExists); err != nil {
		return err
	}
	if !merchantExists {
		return ErrKybMerchantNotFound
	}

	if decision == "VALID" {
		// Supersede the prior current doc of this type.
		if _, err := tx.Exec(ctx,
			`UPDATE merchant_kyb_documents SET status='REPLACED', replaced_by_document_id=$1, updated_at=NOW()
			  WHERE merchant_id=$2 AND document_type=$3 AND id<>$1 AND status IN ('VALID','REJECTED','EXPIRED')`,
			docID, merchantID, docType); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx,
			`UPDATE merchant_kyb_documents
			    SET status='VALID', valid_until=$2, reviewed_by=$3, reviewed_at=NOW(), rejection_reason=NULL,
			        metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('review_notes', $4::text),
			        updated_at=NOW()
			  WHERE id=$1`,
			docID, validUntil, nullStrKyb(actor), notes); err != nil {
			return err
		}
		if err := emitKybEvent(ctx, tx, merchantID, docID, "merchant.kyb.document.approved", "approved:"+docID,
			map[string]any{"document_type": docType, "reviewed_by": actor, "notes": notes}); err != nil {
			return err
		}
		// Promote KYB to APPROVED when all required types are VALID.
		allValid, err := allKybValidTx(ctx, tx, merchantID)
		if err != nil {
			return err
		}
		if allValid {
			if _, err := tx.Exec(ctx,
				`INSERT INTO merchant_compliance (merchant_id, kyb_status) VALUES ($1,'APPROVED')
				 ON CONFLICT (merchant_id) DO UPDATE SET kyb_status='APPROVED', updated_at=NOW()`, merchantID); err != nil {
				return err
			}
			if err := emitKybEvent(ctx, tx, merchantID, "", "merchant.kyb.verified", "verified:"+merchantID, nil); err != nil {
				return err
			}
		}
	} else { // REJECTED
		if _, err := tx.Exec(ctx,
			`UPDATE merchant_kyb_documents
			    SET status='REJECTED', rejection_reason=$2, reviewed_by=$3, reviewed_at=NOW(),
			        metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('review_notes', $4::text),
			        updated_at=NOW()
			  WHERE id=$1`,
			docID, reason, nullStrKyb(actor), notes); err != nil {
			return err
		}
		if err := emitKybEvent(ctx, tx, merchantID, docID, "merchant.kyb.document.rejected", "rejected:"+docID,
			map[string]any{"document_type": docType, "reason_code": reason, "reviewed_by": actor, "notes": notes}); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// ── Bridge: copy approved application documents into the merchant KYB set ─────

// BridgeFromApplicationTx is called inside the merchant-approval transaction. It
// references the application's accepted/uploaded documents as VALID merchant KYB
// documents (history in merchant_application_documents is preserved). Idempotent.
func BridgeFromApplicationTx(ctx context.Context, tx pgx.Tx, applicationID, merchantID, environment string) error {
	parsed := banzamienv.Parse(environment)
	if !parsed.IsKnown() {
		return ErrEnvironmentUndeclared
	}
	env := parsed.String()
	rows, err := tx.Query(ctx, `
		SELECT document_type, storage_bucket, storage_key, mime_type, size_bytes, COALESCE(checksum_sha256,'')
		  FROM merchant_application_documents
		 WHERE application_id = $1 AND deleted_at IS NULL AND status IN ('UPLOADED','ACCEPTED')`, applicationID)
	if err != nil {
		return err
	}
	type srcDoc struct {
		typ, bucket, key, mime, sha string
		size                        int64
	}
	var src []srcDoc
	for rows.Next() {
		var d srcDoc
		if err := rows.Scan(&d.typ, &d.bucket, &d.key, &d.mime, &d.size, &d.sha); err != nil {
			rows.Close()
			return err
		}
		src = append(src, d)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, d := range src {
		kt, ok := appToKybType[d.typ]
		if !ok {
			continue
		}
		// Skip if the merchant already has a current document of this type.
		var exists int
		if err := tx.QueryRow(ctx,
			`SELECT COUNT(*) FROM merchant_kyb_documents WHERE merchant_id=$1 AND document_type=$2 AND status<>'REPLACED'`,
			merchantID, kt).Scan(&exists); err != nil {
			return err
		}
		if exists > 0 {
			continue
		}
		id := uuid.New().String()
		// References the same R2 object as the application document (read-only).
		if _, err := tx.Exec(ctx,
			`INSERT INTO merchant_kyb_documents (id, merchant_id, document_type, status, storage_bucket, storage_key, mime_type, sha256, size_bytes, environment, submitted_at, reviewed_at)
			 VALUES ($1,$2,$3,'VALID',$4,$5,$6,$7,$8,$9,NOW(),NOW())
			 ON CONFLICT (storage_key) DO NOTHING`,
			id, merchantID, kt, d.bucket, d.key, nullStrKyb(d.mime), nullStrKyb(d.sha), d.size, env); err != nil {
			return err
		}
		if err := emitKybEvent(ctx, tx, merchantID, id, "merchant.kyb.document.approved", "bridge:"+id,
			map[string]any{"document_type": kt, "source": "application"}); err != nil {
			return err
		}
	}
	return nil
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func allKybValidTx(ctx context.Context, tx pgx.Tx, merchantID string) (bool, error) {
	for _, t := range KybDocumentTypes {
		var n int
		if err := tx.QueryRow(ctx,
			`SELECT COUNT(*) FROM merchant_kyb_documents
			  WHERE merchant_id=$1 AND document_type=$2 AND status='VALID'
			    AND (valid_until IS NULL OR valid_until > NOW())`, merchantID, t).Scan(&n); err != nil {
			return false, err
		}
		if n == 0 {
			return false, nil
		}
	}
	return true, nil
}

func emitKybEvent(ctx context.Context, tx pgx.Tx, merchantID, docID, eventType, idemKey string, payload map[string]any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	var docArg any
	if docID != "" {
		docArg = docID
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO merchant_kyb_events (id, merchant_id, document_id, event_type, payload, idempotency_key)
		 VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (idempotency_key) DO NOTHING`,
		uuid.New().String(), merchantID, docArg, eventType, raw, idemKey)
	return err
}

func nullStrKyb(s string) any {
	if s == "" {
		return nil
	}
	return s
}
