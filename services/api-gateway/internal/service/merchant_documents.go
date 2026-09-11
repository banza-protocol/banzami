package service

import (
	"bytes"
	"context"
	"errors"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/banzami/banzami/services/api-gateway/internal/kybstorage"
)

// KYB documents for Business onboarding (Merchant Lifecycle, Track 3). The DB
// stores only {storage_bucket, storage_key} + metadata. Files live in private
// object storage; signed URLs are minted on demand and never persisted/logged.

var (
	ErrStorageNotConfigured = errors.New("kyb storage not configured")
	ErrInvalidDocumentType  = errors.New("invalid document_type")
	ErrInvalidMimeType      = errors.New("invalid mime_type")
	ErrInvalidExtension     = errors.New("invalid file extension")
	ErrFileTooLarge         = errors.New("file too large")
	ErrEmptyFile            = errors.New("empty file")
	ErrDocumentNotFound     = errors.New("document not found")
	ErrObjectMissing        = errors.New("uploaded object not found in storage")
	// ErrContentMismatch: the uploaded bytes are not the kind of file declared
	// (a renamed executable called registo.pdf, say). Refused and deleted.
	ErrContentMismatch = errors.New("the uploaded file is not a valid PDF, JPEG or PNG of the declared type")
	// ErrApplicationClosed: documents are part of a review; a decided
	// application takes no more.
	ErrApplicationClosed = errors.New("this application is no longer accepting documents")
	// ErrDocumentNotUploaded: a review decides on a file; a document whose file
	// never arrived has nothing to accept or reject.
	ErrDocumentNotUploaded = errors.New("the document has no uploaded file to review")
)

// Allowed document types (v1). Three required company documents plus an
// optional bank proof (for payout/settlement later) and a catch-all. There is
// The Business application requires exactly THREE company documents:
// BUSINESS_REGISTRATION, TAX_ID, REPRESENTATIVE_ID. Deliberately NO
// proof-of-address and NO bank proof — banking/settlement details belong to a
// later payout configuration phase, not the initial application. OTHER is kept
// only as a generic admin-side bucket. This keeps onboarding friction minimal.
var allowedDocTypes = map[string]bool{
	"BUSINESS_REGISTRATION": true,
	"TAX_ID":                true,
	"REPRESENTATIVE_ID":     true,
	"OTHER":                 true,
}

var allowedMimes = map[string]bool{
	"application/pdf": true,
	"image/jpeg":      true,
	"image/png":       true,
}

var allowedExts = map[string]bool{
	".pdf": true, ".jpg": true, ".jpeg": true, ".png": true,
}

// DocumentView is the PUBLIC-safe projection (applicant + website). It never
// exposes storage_bucket / storage_key.
type DocumentView struct {
	DocumentID      string     `json:"document_id"`
	DocumentType    string     `json:"document_type"`
	OriginalName    string     `json:"original_filename"`
	Status          string     `json:"status"`
	SizeBytes       int64      `json:"size_bytes"`
	UploadedAt      *time.Time `json:"uploaded_at"`
	RejectionReason *string    `json:"rejection_reason"`
}

// AdminDocumentView adds review metadata for the admin UI. Still no storage_key.
type AdminDocumentView struct {
	DocumentID      string     `json:"document_id"`
	DocumentType    string     `json:"document_type"`
	OriginalName    string     `json:"original_filename"`
	MimeType        string     `json:"mime_type"`
	Status          string     `json:"status"`
	SizeBytes       int64      `json:"size_bytes"`
	UploadedAt      *time.Time `json:"uploaded_at"`
	ReviewedBy      *string    `json:"reviewed_by"`
	ReviewedAt      *time.Time `json:"reviewed_at"`
	RejectionReason *string    `json:"rejection_reason"`
}

// RequestUploadResult carries the new document id and its pre-signed PUT URL.
type RequestUploadResult struct {
	DocumentID string
	Upload     kybstorage.UploadURL
}

// ReadURLResult is a short-lived signed GET URL (admin only).
type ReadURLResult struct {
	URL       string
	ExpiresAt time.Time
}

// MerchantDocumentService is the storage-aware document API used by the public
// and internal handlers.
type MerchantDocumentService interface {
	StorageConfigured() bool
	RequestUpload(ctx context.Context, appID, docType, filename, mime string, size int64) (RequestUploadResult, error)
	ConfirmUpload(ctx context.Context, appID, documentID string) (DocumentView, error)
	ListForApplication(ctx context.Context, appID string) ([]DocumentView, error)
	AdminList(ctx context.Context, appID string) ([]AdminDocumentView, error)
	CreateReadURL(ctx context.Context, appID, documentID string) (ReadURLResult, error)
	Accept(ctx context.Context, appID, documentID, reviewedBy string) (AdminDocumentView, error)
	Reject(ctx context.Context, appID, documentID, reviewedBy, reason string) (AdminDocumentView, error)
}

type PostgresMerchantDocumentService struct {
	pool    *pgxpool.Pool
	storage kybstorage.KybDocumentStorage // nil when KYB_STORAGE_* is absent
	maxSize int64
}

func NewPostgresMerchantDocumentService(pool *pgxpool.Pool, storage kybstorage.KybDocumentStorage, maxSize int64) *PostgresMerchantDocumentService {
	if maxSize <= 0 {
		maxSize = 5 * 1024 * 1024
	}
	return &PostgresMerchantDocumentService{pool: pool, storage: storage, maxSize: maxSize}
}

func (s *PostgresMerchantDocumentService) StorageConfigured() bool { return s.storage != nil }

// validateUpload enforces type/mime/extension/size rules (Phase 7).
func (s *PostgresMerchantDocumentService) validateUpload(docType, filename, mime string, size int64) error {
	if !allowedDocTypes[docType] {
		return ErrInvalidDocumentType
	}
	if !allowedMimes[mime] {
		return ErrInvalidMimeType
	}
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == "" || !allowedExts[ext] {
		return ErrInvalidExtension
	}
	if size <= 0 {
		return ErrEmptyFile
	}
	if size > s.maxSize {
		return ErrFileTooLarge
	}
	return nil
}

func (s *PostgresMerchantDocumentService) RequestUpload(ctx context.Context, appID, docType, filename, mime string, size int64) (RequestUploadResult, error) {
	// A file that could never be accepted is refused for what it is, whether or
	// not storage is configured: "not an executable" is not an outage.
	if err := s.validateUpload(docType, filename, mime, size); err != nil {
		return RequestUploadResult{}, err
	}
	if s.storage == nil {
		return RequestUploadResult{}, ErrStorageNotConfigured
	}

	var environment, appStatus string
	err := s.pool.QueryRow(ctx, `SELECT environment, status FROM merchant_applications WHERE id = $1`, appID).
		Scan(&environment, &appStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return RequestUploadResult{}, ErrApplicationNotFound
	}
	if err != nil {
		return RequestUploadResult{}, err
	}
	if !documentsOpen(appStatus) {
		return RequestUploadResult{}, ErrApplicationClosed
	}

	documentID := uuid.NewString()
	key, err := s.storage.BuildStorageKey(strings.ToLower(environment), appID, documentID)
	if err != nil {
		return RequestUploadResult{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return RequestUploadResult{}, err
	}
	defer tx.Rollback(ctx)

	// One active file per (application, document_type): soft-delete the previous.
	if _, err := tx.Exec(ctx,
		`UPDATE merchant_application_documents
		    SET status='DELETED', deleted_at=now(), updated_at=now()
		  WHERE application_id=$1 AND document_type=$2 AND deleted_at IS NULL`,
		appID, docType); err != nil {
		return RequestUploadResult{}, err
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO merchant_application_documents
		   (id, application_id, document_type, original_filename, storage_bucket,
		    storage_key, mime_type, size_bytes, status, uploaded_by)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING_UPLOAD','applicant')`,
		documentID, appID, docType, filename, s.storage.Bucket(), key, mime, size); err != nil {
		return RequestUploadResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return RequestUploadResult{}, err
	}

	up, err := s.storage.CreateUploadURL(ctx, key, mime)
	if err != nil {
		return RequestUploadResult{}, err
	}
	return RequestUploadResult{DocumentID: documentID, Upload: up}, nil
}

func (s *PostgresMerchantDocumentService) ConfirmUpload(ctx context.Context, appID, documentID string) (DocumentView, error) {
	if s.storage == nil {
		return DocumentView{}, ErrStorageNotConfigured
	}
	var storageKey, declaredMime, appStatus string
	err := s.pool.QueryRow(ctx,
		`SELECT d.storage_key, d.mime_type, a.status FROM merchant_application_documents d
		   JOIN merchant_applications a ON a.id = d.application_id
		  WHERE d.id=$1 AND d.application_id=$2 AND d.deleted_at IS NULL`,
		documentID, appID).Scan(&storageKey, &declaredMime, &appStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return DocumentView{}, ErrDocumentNotFound
	}
	if err != nil {
		return DocumentView{}, err
	}

	info, err := s.storage.HeadObject(ctx, storageKey)
	if err != nil {
		return DocumentView{}, err
	}
	if !info.Exists {
		return DocumentView{}, ErrObjectMissing
	}

	if !documentsOpen(appStatus) {
		return DocumentView{}, ErrApplicationClosed
	}

	// The upload URL is signed for the host only, so the store enforced neither
	// the size nor the type the client declared when it asked for it. Both are
	// checked here, on what actually arrived; a file that fails is deleted and
	// its row refused, so nothing unverified reaches a reviewer.
	refuse := func(reason string, e error) (DocumentView, error) {
		_ = s.storage.DeleteObject(ctx, storageKey)
		_, _ = s.pool.Exec(ctx,
			`UPDATE merchant_application_documents
			    SET status='REJECTED', rejection_reason=$2, deleted_at=now(), updated_at=now()
			  WHERE id=$1`, documentID, reason)
		return DocumentView{}, e
	}
	if info.SizeBytes > s.maxSize {
		return refuse("FILE_TOO_LARGE", ErrFileTooLarge)
	}
	if info.SizeBytes == 0 {
		return refuse("EMPTY_FILE", ErrEmptyFile)
	}
	head, err := s.storage.ReadPrefix(ctx, storageKey, 16)
	if err != nil {
		return DocumentView{}, err
	}
	if sniffDocumentType(head) != declaredMime {
		return refuse("CONTENT_MISMATCH", ErrContentMismatch)
	}

	// Trust the real object size when the store reports it.
	if info.SizeBytes > 0 {
		_, _ = s.pool.Exec(ctx,
			`UPDATE merchant_application_documents SET size_bytes=$2 WHERE id=$1`, documentID, info.SizeBytes)
	}
	if _, err := s.pool.Exec(ctx,
		`UPDATE merchant_application_documents
		    SET status='UPLOADED', uploaded_at=now(), confirmed_at=now(), updated_at=now()
		  WHERE id=$1 AND application_id=$2 AND deleted_at IS NULL`,
		documentID, appID); err != nil {
		return DocumentView{}, err
	}
	return s.getPublic(ctx, appID, documentID)
}

func (s *PostgresMerchantDocumentService) ListForApplication(ctx context.Context, appID string) ([]DocumentView, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id::text, document_type, original_filename, status, size_bytes, uploaded_at, rejection_reason
		   FROM merchant_application_documents
		  WHERE application_id=$1 AND deleted_at IS NULL
		  ORDER BY created_at`, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DocumentView{}
	for rows.Next() {
		var d DocumentView
		if err := rows.Scan(&d.DocumentID, &d.DocumentType, &d.OriginalName, &d.Status, &d.SizeBytes, &d.UploadedAt, &d.RejectionReason); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (s *PostgresMerchantDocumentService) getPublic(ctx context.Context, appID, documentID string) (DocumentView, error) {
	var d DocumentView
	err := s.pool.QueryRow(ctx,
		`SELECT id::text, document_type, original_filename, status, size_bytes, uploaded_at, rejection_reason
		   FROM merchant_application_documents
		  WHERE id=$1 AND application_id=$2 AND deleted_at IS NULL`,
		documentID, appID).Scan(&d.DocumentID, &d.DocumentType, &d.OriginalName, &d.Status, &d.SizeBytes, &d.UploadedAt, &d.RejectionReason)
	if errors.Is(err, pgx.ErrNoRows) {
		return DocumentView{}, ErrDocumentNotFound
	}
	return d, err
}

func (s *PostgresMerchantDocumentService) AdminList(ctx context.Context, appID string) ([]AdminDocumentView, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id::text, document_type, original_filename, mime_type, status, size_bytes,
		        uploaded_at, reviewed_by, reviewed_at, rejection_reason
		   FROM merchant_application_documents
		  WHERE application_id=$1 AND deleted_at IS NULL
		  ORDER BY created_at`, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminDocumentView{}
	for rows.Next() {
		var d AdminDocumentView
		if err := rows.Scan(&d.DocumentID, &d.DocumentType, &d.OriginalName, &d.MimeType, &d.Status,
			&d.SizeBytes, &d.UploadedAt, &d.ReviewedBy, &d.ReviewedAt, &d.RejectionReason); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (s *PostgresMerchantDocumentService) getAdmin(ctx context.Context, appID, documentID string) (AdminDocumentView, error) {
	var d AdminDocumentView
	err := s.pool.QueryRow(ctx,
		`SELECT id::text, document_type, original_filename, mime_type, status, size_bytes,
		        uploaded_at, reviewed_by, reviewed_at, rejection_reason
		   FROM merchant_application_documents
		  WHERE id=$1 AND application_id=$2 AND deleted_at IS NULL`,
		documentID, appID).Scan(&d.DocumentID, &d.DocumentType, &d.OriginalName, &d.MimeType, &d.Status,
		&d.SizeBytes, &d.UploadedAt, &d.ReviewedBy, &d.ReviewedAt, &d.RejectionReason)
	if errors.Is(err, pgx.ErrNoRows) {
		return AdminDocumentView{}, ErrDocumentNotFound
	}
	return d, err
}

func (s *PostgresMerchantDocumentService) CreateReadURL(ctx context.Context, appID, documentID string) (ReadURLResult, error) {
	if s.storage == nil {
		return ReadURLResult{}, ErrStorageNotConfigured
	}
	var storageKey, filename string
	err := s.pool.QueryRow(ctx,
		`SELECT storage_key, original_filename FROM merchant_application_documents
		  WHERE id=$1 AND application_id=$2 AND deleted_at IS NULL`,
		documentID, appID).Scan(&storageKey, &filename)
	if errors.Is(err, pgx.ErrNoRows) {
		return ReadURLResult{}, ErrDocumentNotFound
	}
	if err != nil {
		return ReadURLResult{}, err
	}
	r, err := s.storage.CreateReadURL(ctx, storageKey, filename)
	if err != nil {
		return ReadURLResult{}, err
	}
	return ReadURLResult{URL: r.URL, ExpiresAt: r.ExpiresAt}, nil
}

// Accept and Reject decide on an uploaded file, of an application still under
// review — in the UPDATE itself, not only in the console. They were
// unconditional: accepting a document whose upload never happened counted it
// as present, and approval then provisioned the Business with no file in
// storage; a decided application's documents could be flipped afterwards
// (A5-05).
func (s *PostgresMerchantDocumentService) Accept(ctx context.Context, appID, documentID, reviewedBy string) (AdminDocumentView, error) {
	return s.decide(ctx, appID, documentID, "ACCEPTED", reviewedBy, "")
}

func (s *PostgresMerchantDocumentService) Reject(ctx context.Context, appID, documentID, reviewedBy, reason string) (AdminDocumentView, error) {
	return s.decide(ctx, appID, documentID, "REJECTED", reviewedBy, reason)
}

func (s *PostgresMerchantDocumentService) decide(ctx context.Context, appID, documentID, status, reviewedBy, reason string) (AdminDocumentView, error) {
	tag, err := s.pool.Exec(ctx,
		`UPDATE merchant_application_documents d
		    SET status=$3, reviewed_by=$4, reviewed_at=now(), rejection_reason=$5, updated_at=now()
		   FROM merchant_applications a
		  WHERE d.id=$1 AND d.application_id=$2 AND d.deleted_at IS NULL
		    AND a.id = d.application_id
		    AND d.status IN ('UPLOADED','ACCEPTED','REJECTED')
		    AND a.status IN ('SUBMITTED','UNDER_REVIEW','INFORMATION_REQUIRED','PROVISIONING_FAILED')`,
		documentID, appID, status, nullStr(reviewedBy), nullStr(reason))
	if err != nil {
		return AdminDocumentView{}, err
	}
	if tag.RowsAffected() == 0 {
		// Say why: no such document, a file that never arrived, or a decided
		// application.
		var docStatus, appStatus string
		err := s.pool.QueryRow(ctx,
			`SELECT d.status, a.status FROM merchant_application_documents d
			   JOIN merchant_applications a ON a.id = d.application_id
			  WHERE d.id=$1 AND d.application_id=$2 AND d.deleted_at IS NULL`,
			documentID, appID).Scan(&docStatus, &appStatus)
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			return AdminDocumentView{}, ErrDocumentNotFound
		case err != nil:
			return AdminDocumentView{}, err
		case !documentsOpen(appStatus):
			return AdminDocumentView{}, ErrApplicationClosed
		default:
			return AdminDocumentView{}, ErrDocumentNotUploaded
		}
	}
	return s.getAdmin(ctx, appID, documentID)
}

// documentsOpen: an application takes documents while it is being reviewed.
func documentsOpen(status string) bool {
	switch status {
	// INFORMATION_REQUIRED: the reviewer asked for a document; the applicant
	// attaches it before resubmitting.
	case "SUBMITTED", "UNDER_REVIEW", "INFORMATION_REQUIRED", "PROVISIONING_FAILED":
		return true
	}
	return false
}

// sniffDocumentType names the file by its leading bytes — the only accepted
// kinds — or returns "" for anything else.
func sniffDocumentType(head []byte) string {
	switch {
	case bytes.HasPrefix(head, []byte("%PDF-")):
		return "application/pdf"
	case bytes.HasPrefix(head, []byte("\x89PNG\r\n\x1a\n")):
		return "image/png"
	case bytes.HasPrefix(head, []byte{0xFF, 0xD8, 0xFF}):
		return "image/jpeg"
	}
	return ""
}
