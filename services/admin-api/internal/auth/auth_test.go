package auth

import (
	"testing"
	"time"
)

func TestPassword(t *testing.T) {
	if _, err := HashPassword("short"); err != ErrWeakPassword {
		t.Fatalf("want ErrWeakPassword, got %v", err)
	}
	hash, err := HashPassword("a-strong-password")
	if err != nil {
		t.Fatal(err)
	}
	if hash == "a-strong-password" {
		t.Fatal("hash must not equal the plaintext password")
	}
	if !VerifyPassword(hash, "a-strong-password") {
		t.Fatal("verify should succeed for the correct password")
	}
	if VerifyPassword(hash, "wrong-password-x") {
		t.Fatal("verify should fail for a wrong password")
	}
}

func TestJWTRoundTrip(t *testing.T) {
	const secret = "test-secret-please-change"
	// The JWT carries only sub/email/role/token_version (not the full name): the
	// middleware re-loads identity from the database. FullName is therefore empty
	// after a round-trip, by design.
	p := Principal{ID: "u1", Email: "op@banzami.com", FullName: "Op Silva", Role: "OPERATIONS", TokenVersion: 7}
	now := time.Now()
	tok, exp, err := Issue(secret, p, time.Hour, now)
	if err != nil {
		t.Fatal(err)
	}
	if !exp.After(now) {
		t.Fatal("expiry must be in the future")
	}
	got, err := Parse(secret, tok)
	if err != nil {
		t.Fatal(err)
	}
	want := Principal{ID: "u1", Email: "op@banzami.com", Role: "OPERATIONS", TokenVersion: 7}
	if got != want {
		t.Fatalf("round-trip mismatch: %+v != %+v", got, want)
	}
}

func TestJWTRejections(t *testing.T) {
	const secret = "test-secret-please-change"
	p := Principal{ID: "u1", Email: "op@banzami.com", Role: "OPERATIONS"}
	tok, _, _ := Issue(secret, p, time.Hour, time.Now())

	if _, err := Parse("other-secret", tok); err == nil {
		t.Fatal("parse must fail with the wrong secret")
	}
	if _, err := Parse("", tok); err != ErrInvalidToken {
		t.Fatal("empty secret must be rejected")
	}
	if _, err := Parse(secret, tok+"tamper"); err == nil {
		t.Fatal("tampered token must be rejected")
	}
	// Expired token.
	exp, _, _ := Issue(secret, p, -time.Hour, time.Now())
	if _, err := Parse(secret, exp); err == nil {
		t.Fatal("expired token must be rejected")
	}
}
