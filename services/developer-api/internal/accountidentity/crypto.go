package accountidentity

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"math/big"
	"strings"
)

// Crypto primitives for Account Identity. Peppers (OTP_PEPPER, session secret)
// are supplied by config and NEVER stored in Postgres. Raw OTP codes and raw
// session tokens are never persisted or logged — only their HMAC/hash.

const otpHashVersion = 1

// newOTPCode returns a cryptographically-random 6-digit code (leading zeros
// preserved).
func newOTPCode() (string, error) {
	var b strings.Builder
	b.Grow(6)
	for i := 0; i < 6; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", err
		}
		b.WriteByte(byte('0' + n.Int64()))
	}
	return b.String(), nil
}

// hashOTP computes HMAC-SHA-256(code, pepper), hex-encoded. Deterministic for a
// given (code, pepper) so verification is a constant-time compare of hashes.
func hashOTP(code, pepper string) string {
	mac := hmac.New(sha256.New, []byte(pepper))
	mac.Write([]byte(code))
	return hex.EncodeToString(mac.Sum(nil))
}

// otpMatches compares a candidate code against a stored hash in constant time.
func otpMatches(candidate, storedHash, pepper string) bool {
	want := hashOTP(candidate, pepper)
	return subtle.ConstantTimeCompare([]byte(want), []byte(storedHash)) == 1
}

// newSessionToken returns a fresh opaque session token (≥256-bit) and its hash.
// Only the hash is stored; the raw token lives solely in the host-only cookie.
func newSessionToken(secret string) (raw, hash string, err error) {
	buf := make([]byte, 32)
	if _, err = rand.Read(buf); err != nil {
		return "", "", err
	}
	raw = base64.RawURLEncoding.EncodeToString(buf)
	hash = hashToken(raw, secret)
	return raw, hash, nil
}

// hashToken computes HMAC-SHA-256(token, secret), hex-encoded — used for both
// session tokens and CSRF tokens bound to the session secret.
func hashToken(token, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(token))
	return hex.EncodeToString(mac.Sum(nil))
}

// newCSRFToken returns a fresh random CSRF token (raw, sent to the client) — the
// double-submit value. It is compared in constant time on state-changing calls.
func newCSRFToken() (string, error) {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// constantTimeEqual reports whether a == b without leaking timing.
func constantTimeEqual(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
