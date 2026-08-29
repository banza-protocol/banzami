package middleware

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"strconv"
	"testing"
)

func itoa(i int64) string { return strconv.FormatInt(i, 10) }

// forgeHS256Token builds a JWT the way an attacker would: raw HS256 over the
// given key, with no dependency on the service's own minting helper.
func forgeHS256Token(t *testing.T, key, claimsJSON string) string {
	t.Helper()
	b64 := func(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }
	signing := b64([]byte(`{"alg":"HS256","typ":"JWT"}`)) + "." + b64([]byte(claimsJSON))
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(signing))
	return signing + "." + b64(mac.Sum(nil))
}
