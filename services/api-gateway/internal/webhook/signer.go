// Package webhook provides HMAC-SHA256 signing and verification for outgoing
// webhook events.
//
// Signature header format (compatible with Stripe's approach):
//
//	Banzami-Signature: t=<unix_seconds>,v1=<hex_hmac_sha256>
//
// The HMAC input is: "<unix_seconds>.<payload_bytes>"
// Prepending the timestamp makes the signature unique per delivery, preventing
// replay attacks when the same payload is sent to the same endpoint twice.
package webhook

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

const SignatureHeader = "Banzami-Signature"

// Sign returns the value of the Banzami-Signature header for the given payload.
func Sign(secret string, t time.Time, payload []byte) string {
	ts := t.Unix()
	mac := hmac.New(sha256.New, []byte(secret))
	fmt.Fprintf(mac, "%d.", ts)
	mac.Write(payload)
	return fmt.Sprintf("t=%d,v1=%s", ts, hex.EncodeToString(mac.Sum(nil)))
}

// Verify validates the Banzami-Signature header against the given payload.
// Returns a non-nil error if the signature is invalid or the timestamp falls
// outside the replay-protection tolerance window.
func Verify(secret, header string, payload []byte, tolerance time.Duration) error {
	ts, v1, err := parseHeader(header)
	if err != nil {
		return err
	}

	age := time.Since(time.Unix(ts, 0))
	if age < 0 {
		age = -age
	}
	if age > tolerance {
		return errors.New("webhook: timestamp outside tolerance window — possible replay attack")
	}

	mac := hmac.New(sha256.New, []byte(secret))
	fmt.Fprintf(mac, "%d.", ts)
	mac.Write(payload)
	expected := hex.EncodeToString(mac.Sum(nil))

	// Constant-time comparison prevents timing side-channels.
	if !hmac.Equal([]byte(v1), []byte(expected)) {
		return errors.New("webhook: signature mismatch")
	}
	return nil
}

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
				return 0, "", errors.New("webhook: invalid timestamp in signature header")
			}
		case "v1":
			v1 = v
		}
	}
	if ts == 0 || v1 == "" {
		return 0, "", errors.New("webhook: malformed Banzami-Signature header")
	}
	return ts, v1, nil
}
