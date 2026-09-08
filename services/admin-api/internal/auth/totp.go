package auth

// TOTP (RFC 6238) for BANZADMIN second factors.
//
// Written out rather than pulled in: it is forty lines of HMAC and the
// alternative is a dependency in the authentication path of the operator
// console. The algorithm is fixed — SHA-1, 6 digits, 30-second steps — because
// that is what every authenticator app assumes, and an operator whose app
// silently disagrees is locked out of the console.

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"
	"time"
)

const (
	totpDigits = 6
	totpPeriod = 30 * time.Second
	// One step either side. Clocks drift and people type slowly; two steps
	// would be a minute of validity for a one-time code.
	totpSkew = 1
)

// NewTOTPSecret returns a fresh base32 secret, the form authenticator apps read.
func NewTOTPSecret() (string, error) {
	b := make([]byte, 20) // 160 bits, the RFC 4226 recommendation for HMAC-SHA1
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return strings.TrimRight(base32.StdEncoding.EncodeToString(b), "="), nil
}

// TOTPProvisioningURI is the otpauth:// URI an authenticator app scans.
//
// The issuer appears twice — as a label prefix and as a parameter — because
// different apps read different ones, and an operator with three "Banzami"
// entries and no way to tell them apart is a support call during an incident.
func TOTPProvisioningURI(secret, account, issuer string) string {
	label := url.PathEscape(issuer + ":" + account)
	q := url.Values{}
	q.Set("secret", secret)
	q.Set("issuer", issuer)
	q.Set("algorithm", "SHA1")
	q.Set("digits", fmt.Sprint(totpDigits))
	q.Set("period", fmt.Sprint(int(totpPeriod.Seconds())))
	return "otpauth://totp/" + label + "?" + q.Encode()
}

// TOTPCodeAt computes the code for one step. Exported for tests and for the
// enrolment confirmation path.
func TOTPCodeAt(secret string, step int64) (string, error) {
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(strings.TrimSpace(secret)))
	if err != nil {
		return "", fmt.Errorf("invalid secret")
	}
	var buf [8]byte
	binary.BigEndian.PutUint64(buf[:], uint64(step))
	mac := hmac.New(sha1.New, key)
	mac.Write(buf[:])
	sum := mac.Sum(nil)
	off := sum[len(sum)-1] & 0x0f
	v := (uint32(sum[off]&0x7f) << 24) | (uint32(sum[off+1]) << 16) | (uint32(sum[off+2]) << 8) | uint32(sum[off+3])
	return fmt.Sprintf("%0*d", totpDigits, v%1000000), nil
}

// VerifyTOTP checks a code against the current step and one either side, and
// returns the step it matched.
//
// The step is the caller's business: a one-time code that is accepted twice
// inside its window is not one-time, so the caller records the last accepted
// step and refuses anything at or below it.
func VerifyTOTP(secret, code string, now time.Time) (int64, bool) {
	code = strings.TrimSpace(code)
	if len(code) != totpDigits {
		return 0, false
	}
	current := now.Unix() / int64(totpPeriod.Seconds())
	for d := int64(-totpSkew); d <= totpSkew; d++ {
		want, err := TOTPCodeAt(secret, current+d)
		if err != nil {
			return 0, false
		}
		// Constant time: a timing difference here leaks how much of a guess was
		// right, and there are only a million codes.
		if subtle.ConstantTimeCompare([]byte(want), []byte(code)) == 1 {
			return current + d, true
		}
	}
	return 0, false
}
