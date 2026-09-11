package kycstorage

import (
	"errors"
	"testing"
	"time"
)

// A2-12. Consumer KYC evidence is personal identity documents. The store was
// built from whatever bucket the environment variables named, with no check
// that the bucket belongs to this stack — the RA-100 defect, for consumers.
func TestNewFromConfig_RefusesABucketOfAnotherEnvironment(t *testing.T) {
	base := func(bucket, environment string) Config {
		return Config{
			Environment: environment, Provider: "r2", Bucket: bucket,
			Endpoint: "https://acct.r2.cloudflarestorage.com", Region: "auto",
			AccessKeyID: "ak", SecretAccessKey: "sk", SignedURLTTL: time.Minute,
		}
	}
	for _, c := range []struct {
		bucket, environment string
		ok                  bool
	}{
		{"banzami-kyc-sandbox", "SANDBOX", true},
		{"banzami-kyc-live", "LIVE", true},
		{"banzami-kyc-live", "SANDBOX", false},
		{"banzami-kyc-sandbox", "LIVE", false},
		{"banzami-kyc", "SANDBOX", false},              // names neither
		{"banzami-kyc-sandbox", "", false},             // no environment declared
		{"banzami-kyc-sandbox-live", "SANDBOX", false}, // names both
	} {
		_, err := NewFromConfig(base(c.bucket, c.environment))
		refused := errors.Is(err, ErrBucketEnvironment)
		if c.ok && refused {
			t.Errorf("%s in %s was refused", c.bucket, c.environment)
		}
		if !c.ok && !refused {
			t.Errorf("%s was accepted in %s (err=%v)", c.bucket, c.environment, err)
		}
	}

	// An unconfigured store is still just unconfigured, never an environment error.
	if _, err := NewFromConfig(Config{Environment: "SANDBOX"}); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("an unconfigured store answered %v", err)
	}
}
