// Package banzami provides the official Go SDK for the Banzami payment platform.
//
// Webhook signature verification implements the canonical format:
//
//	Banza-Signature: t=<unix_seconds>,v1=<hex_hmac_sha256>
//
// Spec: docs/standards/webhook-signature-spec.md
// Source of truth: services/api-gateway/internal/webhook/signer.go
package banzami

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

// SignatureHeader is the canonical name of the Banzami webhook signature header.
const SignatureHeader = "Banza-Signature"

// DefaultTolerance is the maximum age of an incoming webhook request.
// Requests older than this are rejected as possible replay attacks.
const DefaultTolerance = 300 * time.Second

// ---------------------------------------------------------------------------
// Webhooks client
// ---------------------------------------------------------------------------

// WebhooksClient provides webhook signature verification and test helpers.
// Access via Client.Webhooks.
type WebhooksClient struct {
	secret string
}

// ConstructEvent verifies the Banza-Signature header and parses the webhook
// event body. The raw body must be passed as received — before any JSON
// unmarshalling.
//
// Returns a WebhookSignatureError if verification fails.
func (w *WebhooksClient) ConstructEvent(rawBody []byte, signatureHeader string) (*WebhookEvent, error) {
	return ConstructEvent(rawBody, signatureHeader, w.secret, DefaultTolerance)
}

// ConstructEventWithTolerance is like ConstructEvent but with a custom
// replay-protection tolerance window.
func (w *WebhooksClient) ConstructEventWithTolerance(rawBody []byte, signatureHeader string, tolerance time.Duration) (*WebhookEvent, error) {
	return ConstructEvent(rawBody, signatureHeader, w.secret, tolerance)
}

// GenerateTestSignature produces a valid Banza-Signature header value for
// local testing. Use in test suites to simulate Banzami webhook deliveries.
func (w *WebhooksClient) GenerateTestSignature(rawBody []byte, timestamp time.Time) string {
	return GenerateTestSignature(rawBody, w.secret, timestamp)
}

// ---------------------------------------------------------------------------
// Package-level functions (usable without a Client)
// ---------------------------------------------------------------------------

// ConstructEvent verifies the signature and parses the webhook event payload.
//
//   - rawBody:          Raw HTTP request body bytes.
//   - signatureHeader:  Value of the Banza-Signature header.
//   - secret:           Webhook secret obtained from the Banzami dashboard.
//   - tolerance:        Maximum age of the request; use DefaultTolerance (300s).
func ConstructEvent(rawBody []byte, signatureHeader, secret string, tolerance time.Duration) (*WebhookEvent, error) {
	if err := VerifySignature(rawBody, signatureHeader, secret, tolerance); err != nil {
		return nil, err
	}

	var event WebhookEvent
	if err := json.Unmarshal(rawBody, &event); err != nil {
		return nil, fmt.Errorf("banzami/webhook: failed to parse event body: %w", err)
	}
	return &event, nil
}

// VerifySignature validates the Banza-Signature header against the raw body.
// Returns a *WebhookSignatureError on any verification failure.
func VerifySignature(rawBody []byte, signatureHeader, secret string, tolerance time.Duration) error {
	if signatureHeader == "" {
		return &WebhookSignatureError{Reason: "Banza-Signature header is missing"}
	}

	ts, v1, err := parseHeader(signatureHeader)
	if err != nil {
		return err
	}

	if tolerance > 0 {
		age := time.Since(time.Unix(ts, 0))
		if age < 0 {
			age = -age
		}
		if age > tolerance {
			return &WebhookSignatureError{
				Reason: fmt.Sprintf("timestamp is %s old (tolerance: %s) — possible replay attack", age.Round(time.Second), tolerance),
			}
		}
	}

	mac := hmac.New(sha256.New, []byte(secret))
	fmt.Fprintf(mac, "%d.", ts)
	mac.Write(rawBody)
	expected := hex.EncodeToString(mac.Sum(nil))

	// Constant-time comparison prevents timing side-channels.
	if !hmac.Equal([]byte(v1), []byte(expected)) {
		return &WebhookSignatureError{Reason: "signature mismatch"}
	}
	return nil
}

// GenerateTestSignature produces a valid Banza-Signature header value for
// local testing. Mirrors the canonical signer.go implementation exactly.
func GenerateTestSignature(rawBody []byte, secret string, t time.Time) string {
	ts := t.Unix()
	mac := hmac.New(sha256.New, []byte(secret))
	fmt.Fprintf(mac, "%d.", ts)
	mac.Write(rawBody)
	return fmt.Sprintf("t=%d,v1=%s", ts, hex.EncodeToString(mac.Sum(nil)))
}

// GenerateTestEvent builds a minimal WebhookEvent envelope for use in tests.
func GenerateTestEvent(eventType string, data map[string]any) *WebhookEvent {
	return &WebhookEvent{
		ID:        fmt.Sprintf("evt_test_%d", time.Now().UnixNano()),
		Type:      eventType,
		Data:      data,
		CreatedAt: time.Now().UTC(),
	}
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

func parseHeader(header string) (ts int64, v1 string, err error) {
	for _, part := range strings.Split(header, ",") {
		k, v, found := strings.Cut(strings.TrimSpace(part), "=")
		if !found {
			continue
		}
		switch k {
		case "t":
			ts, err = strconv.ParseInt(v, 10, 64)
			if err != nil {
				return 0, "", &WebhookSignatureError{
					Reason: fmt.Sprintf("invalid timestamp value %q", v),
				}
			}
		case "v1":
			v1 = v
		}
	}

	if ts == 0 || v1 == "" {
		return 0, "", &WebhookSignatureError{
			Reason: `malformed Banza-Signature header: expected "t=<unix>,v1=<hex>"`,
		}
	}
	if math.Abs(float64(ts)) > 1e12 {
		return 0, "", errors.New("banzami/webhook: timestamp out of plausible range")
	}
	return ts, v1, nil
}
