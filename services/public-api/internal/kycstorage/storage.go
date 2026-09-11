// Package kycstorage is the storage abstraction for consumer KYC evidence
// (document images, selfie). Business code depends ONLY on the
// KycEvidenceStorage interface — never on Cloudflare R2 directly. R2 is one
// S3-compatible implementation (s3.go); tests use the in-memory fake (fake.go).
//
// It is intentionally separate from the merchant KYB storage (kybstorage) and
// uses a distinct `kyc/consumer/...` prefix — consumer KYC evidence is never
// mixed with merchant KYB documents.
//
// Security contract:
//   - buckets are private; no object is ever public.
//   - the DB stores only {bucket, storage_key}; URLs are minted on demand and
//     are short-lived (signed). Storage keys / signed URLs are NEVER logged.
package kycstorage

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
)

// ErrNotConfigured is returned by NewFromConfig when the KYC_STORAGE_* env is
// absent/incomplete. Callers treat a nil storage as "not configured" and the
// HTTP layer responds 503 STORAGE_NOT_CONFIGURED — it never panics at startup.
var ErrNotConfigured = errors.New("kyc storage not configured")

// ErrBucketEnvironment: the bucket does not name this stack's environment. A
// Sandbox stack must never read or write consumer KYC evidence in the Live
// bucket, and the reverse is worse (A2-12, the RA-100 defect for consumers).
var ErrBucketEnvironment = errors.New("kyc storage bucket does not belong to this environment")

// BucketBelongsTo reports whether a bucket is the given environment's: it names
// that environment and not the other ("banzami-kyc-sandbox" for SANDBOX,
// "banzami-kyc-live" for LIVE). Positive, so a bucket named for neither — a
// typo, a shared bucket — is refused rather than assumed to be fine.
func BucketBelongsTo(bucket, environment string) bool {
	b := strings.ToLower(bucket)
	switch strings.ToUpper(strings.TrimSpace(environment)) {
	case "SANDBOX":
		return strings.Contains(b, "sandbox") && !strings.Contains(b, "live")
	case "LIVE":
		return strings.Contains(b, "live") && !strings.Contains(b, "sandbox")
	default:
		return false
	}
}

// allowedSlots are the only object slots a KYC case may hold. The key is
// deterministic per (case, slot) so re-uploading a side overwrites in place.
var allowedSlots = map[string]bool{
	"document-front":   true,
	"document-back":    true,
	"passport-main":    true,
	"passport-last":    true,
	"proof-of-address": true,
	"selfie":           true,
}

// UploadURL is a short-lived pre-signed PUT target for direct client upload.
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

// KycEvidenceStorage is the only storage surface business code may use.
type KycEvidenceStorage interface {
	// BuildStorageKey returns a deterministic key of the form
	// kyc/consumer/{consumer_id}/{case_id}/{slot}. It never embeds a filename.
	BuildStorageKey(consumerID, caseID, slot string) (string, error)

	// CreateUploadURL mints a short-lived pre-signed PUT URL for key.
	CreateUploadURL(ctx context.Context, key, contentType string) (UploadURL, error)

	// CreateReadURL mints a short-lived pre-signed GET URL for key (admin only).
	CreateReadURL(ctx context.Context, key, downloadFilename string) (ReadURL, error)

	// HeadObject reports whether the object exists and its size/content-type.
	HeadObject(ctx context.Context, key string) (ObjectInfo, error)

	// DeleteObject removes the object (hard-delete / retention tooling only).
	DeleteObject(ctx context.Context, key string) error

	// Bucket is the configured bucket name (stored alongside the key in DB).
	Bucket() string
}

// Config is the resolved KYC_STORAGE_* configuration.
type Config struct {
	// Environment this stack is: the bucket must name it (A2-12).
	Environment     string
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
// when the config is incomplete — the service must NOT fail startup on this.
func NewFromConfig(c Config) (KycEvidenceStorage, error) {
	if !c.IsConfigured() {
		return nil, ErrNotConfigured
	}
	if !BucketBelongsTo(c.Bucket, c.Environment) {
		return nil, ErrBucketEnvironment
	}
	if c.Region == "" {
		c.Region = "auto"
	}
	if c.SignedURLTTL <= 0 {
		c.SignedURLTTL = 300 * time.Second
	}
	return newS3Storage(c)
}

// buildKey is shared by every implementation so keys are uniform. The slot is a
// fixed enum (no user input in the path), keeping keys non-injectable.
func buildKey(consumerID, caseID, slot string) (string, error) {
	consumerID = strings.TrimSpace(consumerID)
	caseID = strings.TrimSpace(caseID)
	slot = strings.ToLower(strings.TrimSpace(slot))
	if consumerID == "" || caseID == "" {
		return "", errors.New("consumer_id and case_id are required")
	}
	if !allowedSlots[slot] {
		return "", fmt.Errorf("invalid evidence slot %q", slot)
	}
	return fmt.Sprintf("kyc/consumer/%s/%s/%s", consumerID, caseID, slot), nil
}
