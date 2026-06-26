package service

import (
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
)

// Allowed document types (v1). Three required company documents plus an
// optional bank proof (for payout/settlement later) and a catch-all. There is
// deliberately NO proof-of-address document — removed to reduce onboarding
// friction for the Angolan market.
var allowedDocTypes = map[string]bool{
	"BUSINESS_REGISTRATION": true,
	"TAX_ID":                true,
	"REPRESENTATIVE_ID":     true,
	"BANK_PROOF":            true,
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
	if s.storage == nil {
		return RequestUploadResult{}, ErrStorageNotConfigured
	}
	if err := s.validateUpload(docType, filename, mime, size); err != nil {
		return RequestUploadResult{}, err
	}

	var environment string
	err := s.pool.QueryRow(ctx, `SELECT environment FROM merchant_applications WHERE id = $1`, appID).Scan(&environment)
	if errors.Is(err, pgx.ErrNoRows) {
		return RequestUploadResult{}, ErrApplicationNotFound
	}
	if err != nil {
		return RequestUploadResult{}, err
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
	var storageKey string
	err := s.pool.QueryRow(ctx,
		`SELECT storage_key FROM merchant_application_documents
		  WHERE id=$1 AND application_id=$2 AND deleted_at IS NULL`,
		documentID, appID).Scan(&storageKey)
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

func (s *PostgresMerchantDocumentService) Accept(ctx context.Context, appID, documentID, reviewedBy string) (AdminDocumentView, error) {
	tag, err := s.pool.Exec(ctx,
		`UPDATE merchant_application_documents
		    SET status='ACCEPTED', reviewed_by=$3, reviewed_at=now(), rejection_reason=NULL, updated_at=now()
		  WHERE id=$1 AND application_id=$2 AND deleted_at IS NULL`,
		documentID, appID, nullStr(reviewedBy))
	if err != nil {
		return AdminDocumentView{}, err
	}
	if tag.RowsAffected() == 0 {
		return AdminDocumentView{}, ErrDocumentNotFound
	}
	return s.getAdmin(ctx, appID, documentID)
}

func (s *PostgresMerchantDocumentService) Reject(ctx context.Context, appID, documentID, reviewedBy, reason string) (AdminDocumentView, error) {
	tag, err := s.pool.Exec(ctx,
		`UPDATE merchant_application_documents
		    SET status='REJECTED', reviewed_by=$3, reviewed_at=now(), rejection_reason=$4, updated_at=now()
		  WHERE id=$1 AND application_id=$2 AND deleted_at IS NULL`,
		documentID, appID, nullStr(reviewedBy), nullStr(reason))
	if err != nil {
		return AdminDocumentView{}, err
	}
	if tag.RowsAffected() == 0 {
		return AdminDocumentView{}, ErrDocumentNotFound
	}
	return s.getAdmin(ctx, appID, documentID)
}
