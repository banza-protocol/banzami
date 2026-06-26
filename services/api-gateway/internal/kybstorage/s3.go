package kybstorage

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// s3Storage is the S3-compatible (Cloudflare R2) implementation of
// KybDocumentStorage. It uses path-style addressing (endpoint/bucket/key),
// which R2 supports, and the self-contained SigV4 presigner in sigv4.go.
type s3Storage struct {
	bucket          string
	endpoint        string // scheme://host (no trailing slash)
	host            string
	region          string
	accessKeyID     string
	secretAccessKey string
	ttl             time.Duration
	httpClient      *http.Client
	now             func() time.Time // injectable for tests
}

func newS3Storage(c Config) (*s3Storage, error) {
	u, err := url.Parse(strings.TrimRight(c.Endpoint, "/"))
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("invalid KYB_STORAGE_ENDPOINT: %q", c.Endpoint)
	}
	return &s3Storage{
		bucket:          c.Bucket,
		endpoint:        u.Scheme + "://" + u.Host,
		host:            u.Host,
		region:          c.Region,
		accessKeyID:     c.AccessKeyID,
		secretAccessKey: c.SecretAccessKey,
		ttl:             c.SignedURLTTL,
		httpClient:      &http.Client{Timeout: 15 * time.Second},
		now:             time.Now,
	}, nil
}

func (s *s3Storage) Bucket() string { return s.bucket }

func (s *s3Storage) BuildStorageKey(environment, applicationID, documentID string) (string, error) {
	return buildKey(environment, applicationID, documentID)
}

func (s *s3Storage) CreateUploadURL(_ context.Context, key, contentType string) (UploadURL, error) {
	now := s.now()
	u := s.presign(http.MethodPut, key, s.ttl, now, nil)
	headers := map[string]string{}
	if contentType != "" {
		headers["content-type"] = contentType
	}
	return UploadURL{
		URL:       u,
		Method:    http.MethodPut,
		Headers:   headers,
		ExpiresAt: now.Add(s.ttl),
	}, nil
}

func (s *s3Storage) CreateReadURL(_ context.Context, key, downloadFilename string) (ReadURL, error) {
	now := s.now()
	extra := url.Values{}
	if downloadFilename != "" {
		extra.Set("response-content-disposition",
			`attachment; filename="`+sanitizeFilename(downloadFilename)+`"`)
	}
	u := s.presign(http.MethodGet, key, s.ttl, now, extra)
	return ReadURL{URL: u, ExpiresAt: now.Add(s.ttl)}, nil
}

func (s *s3Storage) HeadObject(ctx context.Context, key string) (ObjectInfo, error) {
	// A short-lived presigned HEAD avoids signing live request headers.
	u := s.presign(http.MethodHead, key, 60*time.Second, s.now(), nil)
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, u, nil)
	if err != nil {
		return ObjectInfo{}, err
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return ObjectInfo{}, err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusOK:
		return ObjectInfo{
			Exists:      true,
			SizeBytes:   resp.ContentLength,
			ContentType: resp.Header.Get("Content-Type"),
		}, nil
	case http.StatusNotFound, http.StatusForbidden:
		return ObjectInfo{Exists: false}, nil
	default:
		return ObjectInfo{}, fmt.Errorf("head object: unexpected status %d", resp.StatusCode)
	}
}

func (s *s3Storage) DeleteObject(ctx context.Context, key string) error {
	u := s.presign(http.MethodDelete, key, 60*time.Second, s.now(), nil)
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, u, nil)
	if err != nil {
		return err
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotFound {
		return fmt.Errorf("delete object: unexpected status %d", resp.StatusCode)
	}
	return nil
}

// sanitizeFilename strips characters that would break a Content-Disposition
// header. Never used as a storage key — display only.
func sanitizeFilename(name string) string {
	name = strings.ReplaceAll(name, `"`, "")
	name = strings.ReplaceAll(name, "\n", "")
	name = strings.ReplaceAll(name, "\r", "")
	return name
}
