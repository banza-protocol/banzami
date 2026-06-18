package webhook

import (
	"strings"
	"testing"
	"time"
)

// WH-002 — the Banza-Signature webhook wire contract.

func TestSignVerify_RoundTrip(t *testing.T) {
	secret := "whsec_test"
	payload := []byte(`{"type":"payment.completed","id":"evt_1"}`)
	header := Sign(secret, time.Now(), payload)

	if !strings.HasPrefix(header, "t=") || !strings.Contains(header, ",v1=") {
		t.Fatalf("header not in t=..,v1=.. format: %q", header)
	}
	if err := Verify(secret, header, payload, time.Minute); err != nil {
		t.Fatalf("a freshly-signed payload must verify: %v", err)
	}
}

func TestVerify_RejectsTamperedPayload(t *testing.T) {
	secret := "whsec_test"
	header := Sign(secret, time.Now(), []byte(`{"amount":100}`))
	// Same signature, different payload — must be rejected.
	if err := Verify(secret, header, []byte(`{"amount":999999}`), time.Minute); err == nil {
		t.Fatal("a tampered payload must fail signature verification")
	}
}

func TestVerify_RejectsWrongSecret(t *testing.T) {
	payload := []byte(`{"type":"payout.sent"}`)
	header := Sign("whsec_real", time.Now(), payload)
	if err := Verify("whsec_attacker", header, payload, time.Minute); err == nil {
		t.Fatal("a signature made with a different secret must be rejected")
	}
}

func TestVerify_RejectsReplayOutsideTolerance(t *testing.T) {
	secret := "whsec_test"
	payload := []byte(`{"type":"payment.completed"}`)
	// Signed 10 minutes ago, tolerance 1 minute → replay rejected.
	header := Sign(secret, time.Now().Add(-10*time.Minute), payload)
	if err := Verify(secret, header, payload, time.Minute); err == nil {
		t.Fatal("a stale timestamp must be rejected (replay protection)")
	}
}
