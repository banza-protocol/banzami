package auth

import (
	"strings"
	"testing"
	"time"
)

func TestTOTP_MatchesTheRFCTestVector(t *testing.T) {
	// RFC 6238 appendix B, SHA-1: the shared secret "12345678901234567890"
	// base32-encoded, at T=59, gives 94287082 — the 6-digit truncation is the
	// last six of that.
	secret := "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
	code, err := TOTPCodeAt(secret, 59/30)
	if err != nil {
		t.Fatal(err)
	}
	if code != "287082" {
		t.Fatalf("RFC vector: got %s, want 287082", code)
	}
}

func TestVerifyTOTP_AcceptsTheCurrentStepAndOneEitherSide(t *testing.T) {
	secret, err := NewTOTPSecret()
	if err != nil {
		t.Fatal(err)
	}
	now := time.Unix(1_700_000_000, 0)
	step := now.Unix() / 30

	for _, d := range []int64{-1, 0, 1} {
		code, _ := TOTPCodeAt(secret, step+d)
		got, ok := VerifyTOTP(secret, code, now)
		if !ok || got != step+d {
			t.Fatalf("step %+d not accepted (ok=%v step=%d)", d, ok, got)
		}
	}
	// Two steps away is a minute of validity for a one-time code.
	for _, d := range []int64{-2, 2} {
		code, _ := TOTPCodeAt(secret, step+d)
		if _, ok := VerifyTOTP(secret, code, now); ok {
			t.Fatalf("step %+d was accepted — the window is too wide", d)
		}
	}
}

func TestVerifyTOTP_RejectsRubbishWithoutPanicking(t *testing.T) {
	secret, _ := NewTOTPSecret()
	now := time.Now()
	for _, bad := range []string{"", "12345", "1234567", "abcdef", "  ", "000000"} {
		if _, ok := VerifyTOTP(secret, bad, now); ok && bad != "000000" {
			t.Fatalf("%q was accepted", bad)
		}
	}
	if _, ok := VerifyTOTP("not-base32!!", "123456", now); ok {
		t.Fatal("an invalid secret produced a match")
	}
}

func TestNewTOTPSecret_IsBase32AndNotReused(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 50; i++ {
		s, err := NewTOTPSecret()
		if err != nil {
			t.Fatal(err)
		}
		if len(s) < 32 {
			t.Fatalf("secret too short: %d chars", len(s))
		}
		if strings.ContainsAny(s, "=018") {
			t.Fatalf("not canonical base32: %q", s)
		}
		if seen[s] {
			t.Fatal("a secret repeated")
		}
		seen[s] = true
	}
}

func TestTOTPProvisioningURI_CarriesWhatAnAppNeeds(t *testing.T) {
	uri := TOTPProvisioningURI("ABCDEFGHIJKLMNOP", "fidel.monteiro@banzami.com", "BANZADMIN")
	for _, want := range []string{"otpauth://totp/", "secret=ABCDEFGHIJKLMNOP", "issuer=BANZADMIN", "digits=6", "period=30", "algorithm=SHA1"} {
		if !strings.Contains(uri, want) {
			t.Fatalf("provisioning URI missing %q: %s", want, uri)
		}
	}
	// The account must be identifiable: an operator with several entries needs
	// to know which is which.
	// `@` is legal in a path segment and every authenticator handles it, so it
	// is not percent-encoded — what matters is that the account is there at all.
	if !strings.Contains(uri, "BANZADMIN:fidel.monteiro@banzami.com") {
		t.Fatalf("the account is not in the label: %s", uri)
	}
}
