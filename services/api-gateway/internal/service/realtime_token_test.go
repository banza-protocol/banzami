package service

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func tokensAt(now time.Time, env string) *RealtimeTokens {
	t := NewRealtimeTokens("0123456789abcdef0123456789abcdef", env)
	t.now = func() time.Time { return now }
	return t
}

func TestRealtimeToken_ScopedToOneSessionAndEnvironment(t *testing.T) {
	now := time.Now()
	sb := tokensAt(now, "SANDBOX")
	tok, exp := sb.Mint("sess-A")
	if !strings.HasPrefix(tok, RealtimeTokenPrefix) {
		t.Fatalf("token prefix: %s", tok)
	}
	if exp.Sub(now) > RealtimeTokenMaxTTL {
		t.Fatalf("token lives %s, policy ceiling is %s", exp.Sub(now), RealtimeTokenMaxTTL)
	}
	if _, err := sb.Verify(tok, "sess-A"); err != nil {
		t.Fatalf("own session: %v", err)
	}
	if _, err := sb.Verify(tok, "sess-B"); !errors.Is(err, ErrRealtimeTokenWrongResource) {
		t.Fatalf("another session must be refused: %v", err)
	}
	if _, err := tokensAt(now, "LIVE").Verify(tok, "sess-A"); err == nil {
		t.Fatal("a Sandbox token was accepted by a LIVE verifier")
	}
	if _, err := tokensAt(now.Add(RealtimeTokenTTL+time.Second), "SANDBOX").Verify(tok, "sess-A"); !errors.Is(err, ErrRealtimeTokenExpired) {
		t.Fatalf("an expired token must be refused: %v", err)
	}
	tampered := tok[:len(tok)-2] + "xx"
	if _, err := sb.Verify(tampered, "sess-A"); !errors.Is(err, ErrRealtimeTokenInvalid) {
		t.Fatalf("a tampered token must be refused: %v", err)
	}
	if _, err := NewRealtimeTokens("another-secret-another-secret-01", "SANDBOX").Verify(tok, "sess-A"); err == nil {
		t.Fatal("a token verified under another key")
	}
}

// Policy gate: the lifetime is a security property, not a tuning knob.
func TestRealtimeToken_LifetimePolicy(t *testing.T) {
	if RealtimeTokenTTL > 30*time.Minute || RealtimeTokenMaxTTL > 30*time.Minute {
		t.Fatalf("realtime token lifetime %s / ceiling %s exceeds the 30-minute policy", RealtimeTokenTTL, RealtimeTokenMaxTTL)
	}
}

func TestRealtimeToken_NoSecretMeansNoTokens(t *testing.T) {
	if NewRealtimeTokens("  ", "SANDBOX") != nil {
		t.Fatal("tokens minted with an empty key")
	}
}
