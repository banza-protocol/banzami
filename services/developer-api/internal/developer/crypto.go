package developer

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"regexp"
	"strings"
)

// newToken returns a fresh opaque token (≥256-bit) and its HMAC hash. Only the
// hash is stored; the raw token is shown once (invite links) or on creation.
func newToken(secret string) (raw, hash string, err error) {
	buf := make([]byte, 32)
	if _, err = rand.Read(buf); err != nil {
		return "", "", err
	}
	raw = base64.RawURLEncoding.EncodeToString(buf)
	return raw, hashToken(raw, secret), nil
}

func hashToken(token, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(token))
	return hex.EncodeToString(mac.Sum(nil))
}

// API key prefixes. Live prefixes are reserved constants ONLY — never issued,
// accepted for activation, or connected to live credentials in Slice 1.
const (
	prefixTestPub = "bz_test_pk_"
	prefixTestSec = "bz_test_sk_"
	PrefixLivePub = "bz_live_pk_" // reserved; never issued in Slice 1
	PrefixLiveSec = "bz_live_sk_" // reserved; never issued in Slice 1
)

// newAPIKey generates a SANDBOX key of the given kind: the full raw value (≥256
// bits of entropy in the body) and a short display prefix for the dashboard.
func newAPIKey(kind string) (raw, displayPrefix string, err error) {
	var p string
	switch kind {
	case KindPublishable:
		p = prefixTestPub
	case KindSecret:
		p = prefixTestSec
	default:
		return "", "", ErrValidation
	}
	buf := make([]byte, 32)
	if _, err = rand.Read(buf); err != nil {
		return "", "", err
	}
	body := base64.RawURLEncoding.EncodeToString(buf)
	raw = p + body
	displayPrefix = p + body[:8]
	return raw, displayPrefix, nil
}

// hashKey computes HMAC-SHA-256(raw, API_KEY_PEPPER) hex — the only key material
// stored for secret keys.
func hashKey(raw, pepper string) string { return hashToken(raw, pepper) }

var slugStrip = regexp.MustCompile(`[^a-z0-9]+`)

// slugify makes a url-safe slug from a name.
func slugify(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = slugStrip.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}
