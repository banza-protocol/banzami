package config

// RATE_LIMIT_PEPPER is a dedicated, mandatory secret. It is NOT derived from
// OTP_PEPPER and has no fallback: a missing secret is a reported
// misconfiguration (so the service refuses to boot), never a silently disabled
// protection. The two secrets have separate responsibilities.

import (
	"strings"
	"testing"
)

func TestRateLimitSecret_IsTheDedicatedPepperOnly(t *testing.T) {
	c := &Config{RateLimitPepper: "dedicated", OTPPepper: "otp"}
	if got := c.RateLimitSecret(); got != "dedicated" {
		t.Fatalf("RateLimitSecret must be RATE_LIMIT_PEPPER verbatim, got %q", got)
	}
	if !c.RateLimitConfigured() {
		t.Fatal("a dedicated pepper is configured")
	}
}

// The canonical rule: OTP_PEPPER must NEVER satisfy the throttle secret. With
// OTP_PEPPER present but RATE_LIMIT_PEPPER absent, the throttle secret is empty,
// the environment is an invalid launch config, and RATE_LIMIT_PEPPER is flagged
// independently of OTP_PEPPER.
func TestRateLimitSecret_NoDerivationFromOTPPepper(t *testing.T) {
	c := &Config{OTPPepper: "otp-only"}
	if got := c.RateLimitSecret(); got != "" {
		t.Fatalf("OTP_PEPPER must NOT be derived into the throttle secret, got %q", got)
	}
	if c.RateLimitConfigured() {
		t.Fatal("OTP_PEPPER alone must NOT count as a configured throttle secret")
	}
	missing := c.MissingLaunchSecrets()
	if !contains(missing, "RATE_LIMIT_PEPPER") {
		t.Fatalf("RATE_LIMIT_PEPPER must be flagged independently of OTP_PEPPER, got %v", missing)
	}
	if contains(missing, "OTP_PEPPER") {
		t.Fatalf("OTP_PEPPER is set, so it must NOT be flagged missing, got %v", missing)
	}
}

func TestRateLimitSecret_EmptyOrWhitespaceIsNotConfigured(t *testing.T) {
	for _, pepper := range []string{"", "   ", "\t\n"} {
		c := &Config{RateLimitPepper: pepper, OTPPepper: "otp"}
		if c.RateLimitSecret() != "" {
			t.Fatalf("whitespace/empty RATE_LIMIT_PEPPER %q must yield no secret", pepper)
		}
		if c.RateLimitConfigured() {
			t.Fatalf("whitespace/empty RATE_LIMIT_PEPPER %q must NOT be configured", pepper)
		}
		if !contains(c.MissingLaunchSecrets(), "RATE_LIMIT_PEPPER") {
			t.Fatalf("whitespace/empty RATE_LIMIT_PEPPER %q must be flagged missing", pepper)
		}
	}
}

func TestMissingLaunchSecrets_EnumeratesEveryMandatorySecret(t *testing.T) {
	// A bare config is missing all three tiers.
	bare := &Config{}
	got := bare.MissingLaunchSecrets()
	for _, want := range []string{"OTP_PEPPER", "RATE_LIMIT_PEPPER", "RESEND_API_KEY/EMAIL_* (sender config)"} {
		if !contains(got, want) {
			t.Fatalf("expected %q in missing set, got %v", want, got)
		}
	}
	// A fully configured launch environment reports nothing missing.
	ready := &Config{
		OTPPepper:           "otp",
		RateLimitPepper:     "rl",
		ResendAPIKey:        "resend-test-placeholder",
		EmailFromAddress:    "no-reply@banzami.com",
		EmailNoreplyAddress: "no-reply@banzami.com",
	}
	if m := ready.MissingLaunchSecrets(); len(m) != 0 {
		t.Fatalf("a fully configured launch env must report nothing missing, got %v", m)
	}
}

// Readiness reporting must never leak a secret value — it returns config-key
// NAMES only. Even with secrets set, the output contains none of their values.
func TestMissingLaunchSecrets_NeverLeaksSecretValues(t *testing.T) {
	c := &Config{
		OTPPepper:       "super-secret-otp-value",
		RateLimitPepper: "super-secret-rl-value",
		// email deliberately unset so the list is non-empty
	}
	for _, s := range c.MissingLaunchSecrets() {
		if strings.Contains(s, "super-secret") {
			t.Fatalf("MissingLaunchSecrets leaked a secret value: %q", s)
		}
	}
}

func contains(ss []string, want string) bool {
	for _, s := range ss {
		if s == want {
			return true
		}
	}
	return false
}
