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

var slugStrip = regexp.MustCompile(`[^a-z0-9]+`)

// slugify makes a url-safe slug from a name.
func slugify(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = slugStrip.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}
