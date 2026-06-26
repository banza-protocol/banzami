// Package kybstorage is the storage abstraction for KYB documents. Business
// code depends ONLY on the KybDocumentStorage interface — never on Cloudflare
// R2 directly. R2 is just one S3-compatible implementation (s3.go); tests use
// the in-memory fake (fake.go).
//
// Security contract:
//   - buckets are private; no object is ever public.
//   - the DB stores only {bucket, storage_key}; URLs are minted on demand and
//     are short-lived (signed). Storage keys are non-guessable.
//   - signed URLs must never be logged in full.
package kybstorage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"
)

// ErrNotConfigured is returned by NewFromConfig when the KYB_STORAGE_* env is
// absent/incomplete. Callers treat a nil storage as "not configured" and the
// HTTP layer responds 503 STORAGE_NOT_CONFIGURED — it never panics at startup.
var ErrNotConfigured = errors.New("kyb storage not configured")

// UploadURL is a short-lived pre-signed PUT target for direct browser upload.
type UploadURL struct {
	URL       string
	Method    string            // always "PUT"
	Headers   map[string]string // headers the client MUST send (e.g. content-type)
	ExpiresAt time.Time
}

// ReadURL is a short-lived pre-signed GET URL for admin viewing/download.
type ReadURL struct {
	URL       string
	ExpiresAt time.Time
}

// ObjectInfo is the result of a HEAD on a stored object.
type ObjectInfo struct {
	Exists      bool
	SizeBytes   int64
	ContentType string
}

// KybDocumentStorage is the only storage surface business code may use.
type KybDocumentStorage interface {
	// BuildStorageKey returns a non-guessable key of the form
	// kyb/{environment}/{application_id}/{document_id}/{random16}. It never
	// embeds the original filename.
	BuildStorageKey(environment, applicationID, documentID string) (string, error)

	// CreateUploadURL mints a short-lived pre-signed PUT URL for key.
	CreateUploadURL(ctx context.Context, key, contentType string) (UploadURL, error)

	// CreateReadURL mints a short-lived pre-signed GET URL for key. When
	// downloadFilename is non-empty the response is served as an attachment.
	CreateReadURL(ctx context.Context, key, downloadFilename string) (ReadURL, error)

	// HeadObject reports whether the object exists and its size/content-type.
	HeadObject(ctx context.Context, key string) (ObjectInfo, error)

	// DeleteObject removes the object (used by hard-delete tooling only).
	DeleteObject(ctx context.Context, key string) error

	// Bucket is the configured bucket name (stored alongside the key in DB).
	Bucket() string
}

// Config is the resolved KYB_STORAGE_* configuration.
type Config struct {
	Provider        string // "r2" | "s3"
	Bucket          string
	Endpoint        string // https://<account>.r2.cloudflarestorage.com
	Region          string // "auto" for R2
	AccessKeyID     string
	SecretAccessKey string
	SignedURLTTL    time.Duration
}

// IsConfigured reports whether the minimum required fields are present.
func (c Config) IsConfigured() bool {
	return (c.Provider == "r2" || c.Provider == "s3") &&
		c.Bucket != "" && c.Endpoint != "" && c.AccessKeyID != "" && c.SecretAccessKey != ""
}

// NewFromConfig builds the S3-compatible storage. It returns (nil, ErrNotConfigured)
// when the config is incomplete — the gateway must NOT fail startup on this.
func NewFromConfig(c Config) (KybDocumentStorage, error) {
	if !c.IsConfigured() {
		return nil, ErrNotConfigured
	}
	if c.Region == "" {
		c.Region = "auto"
	}
	if c.SignedURLTTL <= 0 {
		c.SignedURLTTL = 300 * time.Second
	}
	return newS3Storage(c)
}

// buildKey is shared by every implementation so keys are uniform.
func buildKey(environment, applicationID, documentID string) (string, error) {
	env := strings.ToLower(strings.TrimSpace(environment))
	if env != "sandbox" && env != "live" {
		return "", fmt.Errorf("invalid environment %q", environment)
	}
	if applicationID == "" || documentID == "" {
		return "", errors.New("application_id and document_id are required")
	}
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return fmt.Sprintf("kyb/%s/%s/%s/%s", env, applicationID, documentID, hex.EncodeToString(b[:])), nil
}
