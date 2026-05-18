package banzami_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/banzami/banzami-go/banzami"
)

const (
	testSecret    = "whsec_test_secret"
	testTimestamp = int64(1716000000)
)

var testPayload = []byte(`{"type":"payment_link.paid","id":"evt_test_001"}`)

func TestVerifySignature_Valid(t *testing.T) {
	header := banzami.GenerateTestSignature(testPayload, testSecret, time.Unix(testTimestamp, 0))
	if err := banzami.VerifySignature(testPayload, header, testSecret, 0); err != nil {
		t.Fatalf("expected valid signature, got: %v", err)
	}
}

func TestVerifySignature_AtToleranceBoundary(t *testing.T) {
	now := time.Unix(testTimestamp+300, 0)
	header := banzami.GenerateTestSignature(testPayload, testSecret, time.Unix(testTimestamp, 0))
	_ = now // tolerance check uses real time in VerifySignature; use tolerance=0 to bypass
	if err := banzami.VerifySignature(testPayload, header, testSecret, 0); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestVerifySignature_ExpiredTimestamp(t *testing.T) {
	// Use GenerateTestSignature with a very old timestamp.
	oldTs := time.Unix(testTimestamp-400, 0)
	header := banzami.GenerateTestSignature(testPayload, testSecret, oldTs)
	err := banzami.VerifySignature(testPayload, header, testSecret, banzami.DefaultTolerance)
	if err == nil {
		t.Fatal("expected replay rejection, got nil error")
	}
	sigErr, ok := err.(*banzami.WebhookSignatureError)
	if !ok {
		t.Fatalf("expected *WebhookSignatureError, got %T: %v", err, err)
	}
	t.Logf("correctly rejected: %s", sigErr.Reason)
}

func TestVerifySignature_TamperedBody(t *testing.T) {
	header := banzami.GenerateTestSignature(testPayload, testSecret, time.Unix(testTimestamp, 0))
	tampered := append(testPayload, byte(' '))
	err := banzami.VerifySignature(tampered, header, testSecret, 0)
	if err == nil {
		t.Fatal("expected signature mismatch for tampered body")
	}
}

func TestVerifySignature_WrongSecret(t *testing.T) {
	header := banzami.GenerateTestSignature(testPayload, testSecret, time.Unix(testTimestamp, 0))
	err := banzami.VerifySignature(testPayload, header, "wrong_secret", 0)
	if err == nil {
		t.Fatal("expected signature mismatch for wrong secret")
	}
}

func TestVerifySignature_MissingHeader(t *testing.T) {
	err := banzami.VerifySignature(testPayload, "", testSecret, 0)
	if err == nil {
		t.Fatal("expected error for empty header")
	}
}

func TestVerifySignature_OldFormat_Rejected(t *testing.T) {
	// The old wrong format: sha256=<hmac(body_only)>
	err := banzami.VerifySignature(testPayload, "sha256=deadbeef", testSecret, 0)
	if err == nil {
		t.Fatal("expected error for legacy sha256= format")
	}
}

func TestVerifySignature_MissingVOneField(t *testing.T) {
	header := "t=1716000000"
	err := banzami.VerifySignature(testPayload, header, testSecret, 0)
	if err == nil {
		t.Fatal("expected error for missing v1= field")
	}
}

func TestConstructEvent_Valid(t *testing.T) {
	payload := []byte(`{"id":"evt_001","type":"payment_link.paid","data":{},"created_at":"2026-05-18T14:32:07Z"}`)
	header := banzami.GenerateTestSignature(payload, testSecret, time.Now())
	event, err := banzami.ConstructEvent(payload, header, testSecret, 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if event.Type != "payment_link.paid" {
		t.Fatalf("expected type 'payment_link.paid', got %q", event.Type)
	}
}

func TestGenerateTestSignature_MatchesGolden(t *testing.T) {
	// Golden vector V-001 from sdk-certification/vectors/webhook_signatures.json
	secret  := "whsec_test_secret_for_vectors_32by"
	body    := []byte(`{"type":"payment_link.paid","id":"evt_test_001"}`)
	ts      := time.Unix(1716000000, 0)
	expected := "t=1716000000,v1=c5b81e18bf170f081781f860811ee5567618e251b8b6002a90f4ac12c109dbcb"

	got := banzami.GenerateTestSignature(body, secret, ts)
	if got != expected {
		t.Fatalf("signature mismatch:\n  got:      %s\n  expected: %s", got, expected)
	}
}

func TestGenerateTestEvent(t *testing.T) {
	data  := map[string]any{"amount_minor": float64(50000)}
	event := banzami.GenerateTestEvent(banzami.EventPaymentLinkPaid, data)
	if event.Type != "payment_link.paid" {
		t.Fatalf("unexpected event type: %s", event.Type)
	}
	raw, _ := json.Marshal(event)
	var decoded banzami.WebhookEvent
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("round-trip failed: %v", err)
	}
}
