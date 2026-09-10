package config

import (
	"testing"
)

// The sandbox KYC storage must point at the sandbox bucket while inheriting the
// live KYC credentials/endpoint when no sandbox-specific override is set — so a
// single KYC_SANDBOX_STORAGE_BUCKET (or nothing) is enough, and SANDBOX evidence
// is never signed against the live bucket.
func TestSandboxKycStorage_BucketAndFallback(t *testing.T) {
	t.Setenv("ENVIRONMENT", "LIVE")
	// Live KYC creds present; no sandbox overrides.
	t.Setenv("KYC_STORAGE_PROVIDER", "r2")
	t.Setenv("KYC_STORAGE_ENDPOINT", "https://acct.r2.cloudflarestorage.com")
	t.Setenv("KYC_STORAGE_REGION", "auto")
	t.Setenv("KYC_STORAGE_ACCESS_KEY_ID", "live-key")
	t.Setenv("KYC_STORAGE_SECRET_ACCESS_KEY", "live-secret")
	t.Setenv("KYC_STORAGE_BUCKET", "banzami-kyc-live")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if cfg.KycStorageBucket != "banzami-kyc-live" {
		t.Fatalf("live bucket: got %q", cfg.KycStorageBucket)
	}
	// Sandbox defaults to the sandbox bucket, never the live one.
	if cfg.KycSandboxStorageBucket != "banzami-kyc-sandbox" {
		t.Fatalf("sandbox bucket default: got %q, want banzami-kyc-sandbox", cfg.KycSandboxStorageBucket)
	}
	// Credentials/endpoint inherit the live values (same R2 account).
	if cfg.KycSandboxStorageAccessKey != "live-key" || cfg.KycSandboxStorageEndpoint != "https://acct.r2.cloudflarestorage.com" || cfg.KycSandboxStorageProvider != "r2" {
		t.Fatalf("sandbox creds should fall back to live: %+v", cfg)
	}

	// An explicit override wins.
	t.Setenv("KYC_SANDBOX_STORAGE_BUCKET", "custom-sandbox")
	t.Setenv("KYC_SANDBOX_STORAGE_ACCESS_KEY_ID", "sbx-key")
	cfg2, err := Load()
	if err != nil {
		t.Fatalf("load2: %v", err)
	}
	if cfg2.KycSandboxStorageBucket != "custom-sandbox" || cfg2.KycSandboxStorageAccessKey != "sbx-key" {
		t.Fatalf("sandbox override not applied: %+v", cfg2)
	}
	// The live bucket is untouched by the sandbox override.
	if cfg2.KycStorageBucket != "banzami-kyc-live" {
		t.Fatalf("live bucket changed by sandbox override: %q", cfg2.KycStorageBucket)
	}
}
