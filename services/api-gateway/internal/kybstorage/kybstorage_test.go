package kybstorage

import (
	"context"
	"regexp"
	"strings"
	"testing"
	"time"
)

func testStorage(t *testing.T) *s3Storage {
	t.Helper()
	st, err := NewFromConfig(Config{
		Provider:        "r2",
		Bucket:          "banzami-kyb-sandbox",
		Endpoint:        "https://acct123.r2.cloudflarestorage.com",
		Region:          "auto",
		AccessKeyID:     "AKIAEXAMPLE",
		SecretAccessKey: "secretexample",
		SignedURLTTL:    300 * time.Second,
		Environment:     "SANDBOX",
	})
	if err != nil {
		t.Fatalf("NewFromConfig: %v", err)
	}
	s := st.(*s3Storage)
	// Deterministic clock for stable signatures.
	fixed := time.Date(2026, 6, 26, 12, 0, 0, 0, time.UTC)
	s.now = func() time.Time { return fixed }
	return s
}

func TestNotConfigured(t *testing.T) {
	if _, err := NewFromConfig(Config{}); err != ErrNotConfigured {
		t.Fatalf("want ErrNotConfigured, got %v", err)
	}
	// provider set but missing secret → still not configured
	if _, err := NewFromConfig(Config{Provider: "r2", Bucket: "b", Endpoint: "https://x"}); err != ErrNotConfigured {
		t.Fatalf("want ErrNotConfigured for incomplete config, got %v", err)
	}
}

func TestBuildStorageKey(t *testing.T) {
	s := testStorage(t)
	k1, err := s.BuildStorageKey("SANDBOX", "app-1", "doc-1")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(k1, "kyb/sandbox/app-1/doc-1/") {
		t.Fatalf("unexpected key prefix: %s", k1)
	}
	// 16 hex chars of randomness, non-guessable → two keys differ.
	k2, _ := s.BuildStorageKey("sandbox", "app-1", "doc-1")
	if k1 == k2 {
		t.Fatal("storage keys must include unique randomness")
	}
	suffix := strings.TrimPrefix(k1, "kyb/sandbox/app-1/doc-1/")
	if !regexp.MustCompile(`^[0-9a-f]{16}$`).MatchString(suffix) {
		t.Fatalf("random suffix not 16 hex chars: %q", suffix)
	}
	if _, err := s.BuildStorageKey("prod", "a", "b"); err == nil {
		t.Fatal("invalid environment must error")
	}
}

func TestCreateUploadURL_Structure(t *testing.T) {
	s := testStorage(t)
	up, err := s.CreateUploadURL(context.Background(), "kyb/sandbox/app/doc/abcd0123abcd0123", "application/pdf")
	if err != nil {
		t.Fatal(err)
	}
	if up.Method != "PUT" {
		t.Fatalf("method = %s", up.Method)
	}
	if up.Headers["content-type"] != "application/pdf" {
		t.Fatalf("content-type header missing: %v", up.Headers)
	}
	for _, want := range []string{
		"https://acct123.r2.cloudflarestorage.com/banzami-kyb-sandbox/kyb/sandbox/app/doc/",
		"X-Amz-Algorithm=AWS4-HMAC-SHA256",
		"X-Amz-Credential=AKIAEXAMPLE%2F20260626%2Fauto%2Fs3%2Faws4_request",
		"X-Amz-Date=20260626T120000Z",
		"X-Amz-Expires=300",
		"X-Amz-SignedHeaders=host",
		"X-Amz-Signature=",
	} {
		if !strings.Contains(up.URL, want) {
			t.Errorf("upload URL missing %q\ngot: %s", want, up.URL)
		}
	}
	// Signature is 64 lowercase hex chars.
	sig := up.URL[strings.Index(up.URL, "X-Amz-Signature=")+len("X-Amz-Signature="):]
	if !regexp.MustCompile(`^[0-9a-f]{64}$`).MatchString(sig) {
		t.Fatalf("signature not 64 hex chars: %q", sig)
	}
	// TTL is honoured.
	if got := up.ExpiresAt.Sub(s.now()); got != 300*time.Second {
		t.Fatalf("expires_at TTL = %v, want 300s", got)
	}
}

func TestPresign_DeterministicAndKeyDependent(t *testing.T) {
	s := testStorage(t)
	a, _ := s.CreateUploadURL(context.Background(), "kyb/sandbox/a/d/0000000000000000", "application/pdf")
	b, _ := s.CreateUploadURL(context.Background(), "kyb/sandbox/a/d/0000000000000000", "application/pdf")
	if a.URL != b.URL {
		t.Fatal("same key + same clock must yield the same signature")
	}
	c, _ := s.CreateUploadURL(context.Background(), "kyb/sandbox/a/d/1111111111111111", "application/pdf")
	if a.URL == c.URL {
		t.Fatal("different key must yield a different signature")
	}
}

func TestReadURL_ContentDisposition(t *testing.T) {
	s := testStorage(t)
	r, err := s.CreateReadURL(context.Background(), "kyb/sandbox/a/d/0000000000000000", "nif da empresa.pdf")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(r.URL, "response-content-disposition=") {
		t.Fatalf("read URL missing content-disposition: %s", r.URL)
	}
}

func TestFakeStorage(t *testing.T) {
	f := NewFakeStorage("bucket-x")
	key, _ := f.BuildStorageKey("sandbox", "app", "doc")

	up, _ := f.CreateUploadURL(context.Background(), key, "image/png")
	if up.Method != "PUT" || len(f.UploadLog) != 1 {
		t.Fatal("upload url not recorded")
	}
	// Before upload, the object does not exist.
	if info, _ := f.HeadObject(context.Background(), key); info.Exists {
		t.Fatal("object should not exist before PutObject")
	}
	f.PutObject(key, 1234, "image/png")
	info, _ := f.HeadObject(context.Background(), key)
	if !info.Exists || info.SizeBytes != 1234 {
		t.Fatalf("head after put: %+v", info)
	}
	if err := f.DeleteObject(context.Background(), key); err != nil {
		t.Fatal(err)
	}
	if info, _ := f.HeadObject(context.Background(), key); info.Exists {
		t.Fatal("object should be gone after delete")
	}
}

// A gateway never stores identity documents in another environment's bucket.
func TestBucketMustBelongToTheEnvironment(t *testing.T) {
	base := Config{Provider: "r2", Endpoint: "https://acct123.r2.cloudflarestorage.com",
		AccessKeyID: "AKIAEXAMPLE", SecretAccessKey: "secretexample"}
	cases := []struct {
		bucket, env string
		ok          bool
	}{
		{"banzami-kyb-sandbox", "SANDBOX", true},
		{"banzami-kyb-live", "LIVE", true},
		{"banzami-kyb-live", "SANDBOX", false},
		{"banzami-kyb-sandbox", "LIVE", false},
		{"banzami-kyb", "SANDBOX", false},              // names neither
		{"banzami-kyb-sandbox-live", "SANDBOX", false}, // names both
		{"banzami-kyb-sandbox", "", false},             // environment unknown
	}
	for _, c := range cases {
		cfg := base
		cfg.Bucket, cfg.Environment = c.bucket, c.env
		_, err := NewFromConfig(cfg)
		if c.ok && err != nil {
			t.Errorf("%s in %q refused: %v", c.bucket, c.env, err)
		}
		if !c.ok && err != ErrBucketEnvironment {
			t.Errorf("%s in %q: want ErrBucketEnvironment, got %v", c.bucket, c.env, err)
		}
	}
}
