package middleware

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/banzami/banzami/services/public-api/internal/config"
)

// liveSessions answers every session as live — for tests about the token
// itself, not the session behind it.
type liveSessions struct{}

func (liveSessions) SessionValid(context.Context, string, int) (bool, error) { return true, nil }

type sessionAt struct {
	version int
	active  bool
	err     error
}

func (s sessionAt) SessionValid(_ context.Context, _ string, v int) (bool, error) {
	if s.err != nil {
		return false, s.err
	}
	return s.active && v == s.version, nil
}

func call(t *testing.T, sessions SessionChecker, tokenVersion int) int {
	t.Helper()
	const secret = "public-api-unit-test-signing-key-000000"
	tok, _, err := NewConsumerToken(secret, "c-1", tokenVersion, []string{"consumer"}, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	h := Auth(&config.Config{JWTSecret: secret}, sessions)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code
}

// A 24-hour consumer token outlived a sign-out (there was none) and the
// consumer's suspension: the signature was all that was checked.
func TestAuth_ATokenIsGoodOnlyWhileItsSessionIs(t *testing.T) {
	if got := call(t, sessionAt{version: 2, active: true}, 2); got != http.StatusOK {
		t.Fatalf("a live session was refused: %d", got)
	}
	if got := call(t, sessionAt{version: 3, active: true}, 2); got != http.StatusUnauthorized {
		t.Fatalf("a token from before a sign-out was accepted: %d", got)
	}
	if got := call(t, sessionAt{version: 2, active: false}, 2); got != http.StatusUnauthorized {
		t.Fatalf("a suspended consumer's token was accepted: %d", got)
	}
}

func TestAuth_AnUncheckableSessionIsNotLetThrough(t *testing.T) {
	if got := call(t, sessionAt{err: errors.New("db down")}, 0); got != http.StatusServiceUnavailable {
		t.Fatalf("an unreadable session store let the token through: %d", got)
	}
	if got := call(t, nil, 0); got != http.StatusServiceUnavailable {
		t.Fatalf("no session checker let the token through: %d", got)
	}
}
